// Ядро sing-box: запуск, готовность, супервизор, смена сервера на лету, kill switch.
//
// Жизненный цикл:
//   connect()    — генерирует конфиг в папку данных приложения, проверяет его
//                  («sing-box check»), запускает процесс, ждёт clash_api и делает
//                  реальную проверку через туннель (generate_204).
//                  Если ядро уже работает с тем же конфигом — только переключает
//                  selector через clash_api (без перезапуска и без окна утечки).
//   супервизор   — при неожиданном выходе перезапускает с тем же конфигом
//                  (бэкофф, не больше MAX_RESTARTS за минуту). В TUN на время
//                  перезапуска включается блокировка Брандмауэра (firewall-guard),
//                  чтобы трафик не ушёл напрямую.
//   disconnect() — останавливает процесс. auto_route/strict_route sing-box держит
//                  в Wintun-адаптере и динамическом WFP-сеансе процесса: они
//                  снимаются вместе с процессом, в т.ч. при аварийном завершении.

const { spawn, execFile, execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const net = require('net')
const http = require('http')
const crypto = require('crypto')
const dns = require('dns')

const logger = require('./logger')
const systemProxy = require('./system-proxy')
const firewall = require('./firewall-guard')
const { generateSingboxConfig, configKey, DNS_DIRECT_IP } = require('./singbox-config')

const MAX_RESTARTS = 5
const RESTART_WINDOW_MS = 60_000
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000]
const READY_TIMEOUT_MS = 15_000
const PROBE_URLS = ['https://www.gstatic.com/generate_204', 'https://cp.cloudflare.com/generate_204']
const PROBE_TIMEOUT_MS = 6000

const st = {
  proc: null,
  startingProc: null,       // процесс, готовность которого сейчас проверяет startProc
  status: 'disconnected',   // disconnected | connecting | connected | reconnecting | disconnecting
  desired: false,           // VPN «должен быть включён»
  killSwitch: false,        // настройка Kill Switch
  killSwitchEngaged: false, // ядро не поднялось, трафик заблокирован
  mode: null,               // 'tun' | 'proxy'
  httpPort: 10809,
  workDir: null,
  configPath: null,
  key: null,
  clash: null,              // { port, secret }
  selectedTag: null,
  allowIps: [],
  callbacks: {},
  restartTimes: [],
  restartTimer: null,
  lastError: '',
  gen: 0,                   // растёт при каждом disconnect() — отменяет начатое подключение
  epoch: 0,                 // растёт при каждом connect()/disconnect() — отменяет перезапуски супервизора
}

// ─── Пути ────────────────────────────────────────────────────────────────────

function findSingbox() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'resources', 'sing-box', 'sing-box.exe'),
    path.join(__dirname, '..', 'resources', 'sing-box', 'sing-box.exe'),
  ].filter(Boolean)
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error('Ядро VPN не найдено (resources/sing-box/sing-box.exe). Переустановите приложение.')
}

function rulesDirFor(exe) {
  return path.join(path.dirname(exe), 'rules')
}

function defaultDataDir() {
  return process.env.LIPTON_DATA_DIR || path.join(os.homedir(), 'AppData', 'Local', 'LiptonVPN')
}

function pidFile(workDir) {
  return path.join(workDir || path.join(defaultDataDir(), 'sing-box'), 'core.pid')
}

// ─── Вспомогательное ─────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))

const stripAnsi = t => String(t || '').replace(/\x1b\[[0-9;]*m/g, '')

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function clashRequest(method, urlPath, body, timeout = 3000) {
  const clash = st.clash
  if (!clash) return Promise.resolve({ status: 0, body: '' })
  return new Promise(resolve => {
    const data = body ? JSON.stringify(body) : null
    const req = http.request({
      host: '127.0.0.1', port: clash.port, path: urlPath, method, timeout,
      headers: {
        Authorization: `Bearer ${clash.secret}`,
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let buf = ''
      res.on('data', c => { buf += c })
      res.on('end', () => resolve({ status: res.statusCode, body: buf }))
    })
    req.on('error', () => resolve({ status: 0, body: '' }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }) })
    if (data) req.write(data)
    req.end()
  })
}

function runCheck(exe, configPath, workDir) {
  return new Promise(resolve => {
    execFile(exe, ['check', '-c', configPath, '-D', workDir], { windowsHide: true, timeout: 20000 }, (err, stdout, stderr) => {
      if (!err) return resolve({ ok: true })
      resolve({ ok: false, error: stripAnsi(stderr || stdout || err.message).trim() })
    })
  })
}

async function resolveAllowIps(servers) {
  const ips = new Set([DNS_DIRECT_IP])
  const resolver = new dns.promises.Resolver({ timeout: 2000, tries: 1 })
  try { resolver.setServers([DNS_DIRECT_IP]) } catch {}
  await Promise.all((servers || []).map(async s => {
    const host = s && s.address
    if (!host) return
    if (net.isIP(host)) { ips.add(host); return }
    try { (await dns.promises.lookup(host, { all: true, family: 4 })).forEach(r => ips.add(r.address)) } catch {}
    try { (await resolver.resolve4(host)).forEach(ip => ips.add(ip)) } catch {}
  }))
  return [...ips]
}

function friendlyError(raw) {
  const t = String(raw || '')
  const low = t.toLowerCase()
  if (low.includes('access is denied') || low.includes('access denied') || low.includes('elevation') || low.includes('operation not permitted')) {
    return 'Для режима «Весь трафик» нужны права администратора — перезапустите приложение от имени администратора'
  }
  if (low.includes('address already in use') || low.includes('only one usage of each socket address')) {
    return `Порт ${st.httpPort} занят другой программой — закройте её или перезагрузите ПК`
  }
  if (low.includes('configure tun') || low.includes('wintun')) {
    return 'Не удалось создать сетевой адаптер VPN. Перезагрузите ПК или включите режим «Только браузеры»'
  }
  return t.split('\n').filter(Boolean).slice(-1)[0] || 'Не удалось запустить ядро VPN'
}

function ourProxyActive() {
  const cur = systemProxy.getProxyServer()
  return cur === `127.0.0.1:${st.httpPort}` || cur === '127.0.0.1:1'
}

function setStatus(s) {
  st.status = s
}

// ─── Процесс ─────────────────────────────────────────────────────────────────

function writePid(pid) {
  try { fs.writeFileSync(pidFile(st.workDir), String(pid), 'utf-8') } catch {}
}

function removePid() {
  try { fs.unlinkSync(pidFile(st.workDir)) } catch {}
}

function pipeLogs(proc) {
  const onData = d => {
    for (const line of d.toString().split(/\r?\n/)) {
      const t = stripAnsi(line).trim()
      if (!t) continue
      logger.verbose('[sing-box]', t)
      if (/\b(ERROR|FATAL|PANIC)\b/.test(t)) {
        st.lastError = t
        // Ошибки отдельных соединений в рабочем режиме — только в файл.
        if (/\b(FATAL|PANIC)\b/.test(t) || st.status !== 'connected') console.warn('[sing-box]', t)
      }
    }
  }
  proc.stdout.on('data', onData)
  proc.stderr.on('data', onData)
}

function killProc(proc) {
  return new Promise(resolve => {
    if (!proc || proc.exitCode !== null) return resolve()
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    proc.once('exit', finish)
    try { proc.kill() } catch { finish() }
    setTimeout(() => {
      if (done) return
      try { execFileSync('taskkill', ['/F', '/PID', String(proc.pid)], { stdio: 'ignore', windowsHide: true, timeout: 5000 }) } catch {}
      setTimeout(finish, 500)
    }, 3000)
  })
}

async function stopProc() {
  const proc = st.proc
  st.proc = null // выход этого процесса — намеренный, супервизор его игнорирует
  if (proc) await killProc(proc)
  removePid()
}

async function probe() {
  for (const url of PROBE_URLS) {
    const q = `/proxies/proxy/delay?timeout=${PROBE_TIMEOUT_MS}&url=${encodeURIComponent(url)}`
    const r = await clashRequest('GET', q, null, PROBE_TIMEOUT_MS + 2000)
    if (r.status === 200) {
      try { return { ok: true, delay: JSON.parse(r.body).delay } } catch { return { ok: true } }
    }
  }
  return { ok: false }
}

// Запуск процесса по текущему configPath + ожидание реальной готовности.
async function startProc() {
  const exe = findSingbox()
  st.lastError = ''
  const proc = spawn(exe, ['run', '-c', st.configPath, '-D', st.workDir], {
    cwd: st.workDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  st.proc = proc
  st.startingProc = proc
  let exited = false
  let spawnError = ''
  proc.on('error', e => { spawnError = e.message; exited = true })
  proc.on('exit', code => { exited = true; onExit(proc, code) })
  pipeLogs(proc)
  if (proc.pid) writePid(proc.pid)

  const fail = async (msg) => {
    if (st.startingProc === proc) st.startingProc = null
    if (st.proc === proc) await stopProc()
    return { ok: false, error: msg }
  }

  // 1. clash_api поднялся
  const t0 = Date.now()
  let up = false
  while (Date.now() - t0 < READY_TIMEOUT_MS) {
    if (exited || st.proc !== proc) return fail(friendlyError(spawnError || st.lastError || 'Ядро VPN завершилось при запуске'))
    const r = await clashRequest('GET', '/version', null, 1000)
    if (r.status === 200) { up = true; break }
    await sleep(250)
  }
  if (!up) return fail('Ядро VPN не ответило вовремя')
  await sleep(300)
  if (exited || st.proc !== proc) return fail(friendlyError(st.lastError || 'Ядро VPN завершилось при запуске'))

  // 2. реальная проверка через туннель
  const p = await probe()
  if (exited || st.proc !== proc) return fail(friendlyError(st.lastError || 'Ядро VPN завершилось при запуске'))
  if (!p.ok) {
    return fail('Сервер не отвечает. Проверьте интернет, выберите другой сервер или проверьте, что время на ПК выставлено верно')
  }
  st.startingProc = null
  console.log(`[VPN] Туннель проверен${p.delay ? `, задержка ${p.delay} мс` : ''}`)
  return { ok: true }
}

// ─── Супервизор ──────────────────────────────────────────────────────────────

function onExit(proc, code) {
  if (proc !== st.proc) return // намеренная остановка или устаревший процесс
  st.proc = null
  removePid()
  if (proc === st.startingProc) return // ошибку запуска вернёт startProc
  if (!st.desired) { setStatus('disconnected'); return }
  if (st.status !== 'connected' && st.status !== 'reconnecting') return
  console.warn(`[VPN] Ядро неожиданно завершилось (код ${code})${st.lastError ? ': ' + st.lastError : ''}`)
  scheduleRestart()
}

async function scheduleRestart() {
  if (!st.desired) return
  const now = Date.now()
  st.restartTimes = st.restartTimes.filter(t => now - t < RESTART_WINDOW_MS)
  if (st.restartTimes.length >= MAX_RESTARTS) return giveUp()

  const delay = BACKOFF_MS[Math.min(st.restartTimes.length, BACKOFF_MS.length - 1)]
  st.restartTimes.push(now)
  const wasReconnecting = st.status === 'reconnecting'
  setStatus('reconnecting')
  if (!wasReconnecting) st.callbacks.onReconnecting?.()

  // В TUN без ядра трафик пошёл бы напрямую — закрываем его до перезапуска.
  // В режиме прокси системный прокси остаётся на 127.0.0.1 — без ядра соединения
  // просто не проходят, напрямую ничего не уходит.
  if (st.mode === 'tun' && !firewall.isActive()) await firewall.enable(st.allowIps)

  console.log(`[VPN] Перезапуск ядра через ${delay} мс (попытка ${st.restartTimes.length}/${MAX_RESTARTS})`)
  const ep = st.epoch
  clearTimeout(st.restartTimer)
  st.restartTimer = setTimeout(async () => {
    st.restartTimer = null
    if (!st.desired || st.epoch !== ep) return
    const r = await startProc()
    if (st.epoch !== ep) return // подключением уже управляет новый connect()/disconnect()
    if (!st.desired) { await stopProc(); return }
    if (r.ok) {
      setStatus('connected')
      await firewall.disable()
      console.log('[VPN] Ядро перезапущено, соединение восстановлено')
      st.callbacks.onReconnected?.()
    } else {
      console.warn('[VPN] Перезапуск не удался:', r.error)
      scheduleRestart()
    }
  }, delay)
}

async function giveUp() {
  console.error('[VPN] Ядро не удаётся перезапустить — VPN отключён')
  st.desired = false
  setStatus('disconnected')
  if (st.killSwitch) {
    await engageKillSwitch()
    st.callbacks.onKillSwitch?.()
  } else {
    await releaseNetwork()
    st.callbacks.onUnexpectedDisconnect?.()
  }
}

async function engageKillSwitch() {
  st.killSwitchEngaged = true
  if (st.mode === 'tun') {
    if (!firewall.isActive()) await firewall.enable(st.allowIps)
  } else {
    systemProxy.setProxy('127.0.0.1', 1)
  }
  console.log('[Kill Switch] Активирован — трафик заблокирован')
}

async function releaseNetwork() {
  st.killSwitchEngaged = false
  await firewall.disable()
  if (st.mode === 'proxy' || ourProxyActive()) systemProxy.clearProxy()
}

// ─── Публичный API ───────────────────────────────────────────────────────────

/**
 * @param {object} server   выбранный сервер
 * @param {object} opts     { servers, tunMode, httpPort, bypassRu, bypassDomains,
 *                            strictRoute, dataDir, onUnexpectedDisconnect,
 *                            onKillSwitch, onReconnecting, onReconnected }
 */
let connectChain = Promise.resolve()

// Подключения выполняются по очереди; disconnect() — сразу (отменяет текущее).
function connect(server, opts = {}) {
  const run = connectChain.then(() => doConnect(server, opts))
  connectChain = run.catch(() => {})
  return run
}

async function doConnect(server, opts = {}) {
  const exe = findSingbox()
  const gen0 = st.gen
  const cancelled = { success: false, error: 'Подключение отменено' }
  const mode = opts.tunMode ? 'tun' : 'proxy'
  const servers = Array.isArray(opts.servers) && opts.servers.length ? opts.servers.slice() : [server]
  if (server && !servers.some(s => s.id === server.id)) servers.unshift(server)

  st.callbacks = {
    onUnexpectedDisconnect: opts.onUnexpectedDisconnect,
    onKillSwitch: opts.onKillSwitch,
    onReconnecting: opts.onReconnecting,
    onReconnected: opts.onReconnected,
  }

  // VPN сейчас защищает трафик (работает или перезапускается супервизором)
  const wasProtecting = st.desired && (st.status === 'connected' || st.status === 'reconnecting')
  const running = !!st.proc && wasProtecting
  const prevMode = st.mode
  const clash = running ? st.clash : { port: await freePort(), secret: crypto.randomBytes(16).toString('hex') }

  let gen
  try {
    gen = generateSingboxConfig(servers, {
      mode,
      selectedId: server?.id,
      httpPort: opts.httpPort || 10809,
      bypassRu: opts.bypassRu !== false,
      bypassDomains: opts.bypassDomains || [],
      strictRoute: opts.strictRoute !== false,
      rulesDir: rulesDirFor(exe),
      clashApi: clash,
    })
  } catch (e) {
    return { success: false, error: e.message }
  }
  if (gen.skipped.length) console.warn('[VPN] Пропущены неподдерживаемые серверы:', gen.skipped.map(s => `${s.remark} (${s.reason})`).join('; '))

  const key = mode + '|' + configKey(gen.config)
  st.workDir = path.join(opts.dataDir || defaultDataDir(), 'sing-box')
  st.configPath = path.join(st.workDir, 'config.json')
  fs.mkdirSync(st.workDir, { recursive: true })

  console.log(`[VPN] Подключение к: ${server?.remark || server?.address} (${server?.protocol}), режим: ${mode === 'tun' ? 'весь трафик (TUN)' : 'только браузеры (прокси)'}`)
  console.log(`[VPN] Обход РФ: ${opts.bypassRu !== false ? 'вкл' : 'выкл'}, своих доменов: ${(opts.bypassDomains || []).length}`)

  // ── Смена сервера на лету: тот же конфиг, другой выбранный outbound ──
  if (running && st.status === 'connected' && key === st.key) {
    const prevTag = st.selectedTag
    const r = await clashRequest('PUT', '/proxies/proxy', { name: gen.selectedTag })
    if (r.status === 204 || r.status === 200) {
      const p = await probe()
      if (p.ok) {
        st.selectedTag = gen.selectedTag
        fs.writeFileSync(st.configPath, JSON.stringify(gen.config, null, 2), 'utf-8') // для перезапусков супервизора
        console.log(`[VPN] Сервер переключён без перезапуска ядра (${gen.selectedTag})`)
        return { success: true }
      }
      // Новый сервер не отвечает — возвращаемся на прежний, VPN остаётся включённым.
      if (prevTag && prevTag !== gen.selectedTag) await clashRequest('PUT', '/proxies/proxy', { name: prevTag })
      console.warn('[VPN] Новый сервер не отвечает, оставлен прежний')
      return { success: false, error: 'Сервер не отвечает. Выберите другой сервер', keptPrevious: true }
    }
    console.warn('[VPN] Не удалось переключить сервер через API, перезапуск ядра')
  }

  // ── Проверка конфига до остановки текущего ядра ──
  fs.writeFileSync(st.configPath, JSON.stringify(gen.config, null, 2), 'utf-8')
  const chk = await runCheck(exe, st.configPath, st.workDir)
  if (!chk.ok) {
    console.error('[VPN] Конфиг не прошёл проверку:', chk.error)
    return { success: false, error: 'Ошибка конфигурации VPN: ' + friendlyError(chk.error) }
  }

  const allowIps = await resolveAllowIps(servers)
  if (st.gen !== gen0) return cancelled
  // Дальше подключением управляет этот вызов — отложенный перезапуск супервизора отменяем.
  st.epoch++
  clearTimeout(st.restartTimer)
  st.restartTimer = null
  st.allowIps = allowIps
  st.desired = true
  st.restartTimes = []

  // ── Перезапуск работающего ядра: в TUN держим блокировку, пока нет нового ──
  if (wasProtecting && (prevMode === 'tun' || mode === 'tun')) await firewall.enable(st.allowIps)
  else if (firewall.isActive()) await firewall.enable(st.allowIps) // Kill Switch: обновить список серверов
  if (st.proc) await stopProc()

  st.mode = mode
  st.httpPort = opts.httpPort || 10809
  st.clash = clash
  st.key = key
  st.selectedTag = gen.selectedTag
  setStatus('connecting')

  const r = await startProc()
  if (!st.desired || st.gen !== gen0) { await stopProc(); return cancelled }

  if (r.ok) {
    if (mode === 'proxy') systemProxy.setProxy('127.0.0.1', st.httpPort)
    else if (ourProxyActive()) systemProxy.clearProxy()
    st.killSwitchEngaged = false
    await firewall.disable()
    setStatus('connected')
    console.log(`[VPN] Подключено (${mode === 'tun' ? 'TUN' : 'proxy'})`)
    return { success: true }
  }

  console.error('[VPN] Ошибка подключения:', r.error)
  st.desired = false
  setStatus('disconnected')
  if (wasProtecting && st.killSwitch) {
    // Защита была включена — не отпускаем трафик напрямую.
    await engageKillSwitch()
    st.callbacks.onKillSwitch?.()
  } else {
    await releaseNetwork()
  }
  return { success: false, error: r.error }
}

async function disconnect() {
  st.gen++
  st.epoch++
  st.desired = false
  clearTimeout(st.restartTimer)
  st.restartTimer = null
  const hadProc = !!st.proc
  if (hadProc) {
    setStatus('disconnecting')
    console.log('[VPN] Отключение...')
  }
  await stopProc()
  await releaseNetwork()
  setStatus('disconnected')
  if (hadProc) console.log('[VPN] Отключено')
}

function getStatus() {
  return st.status
}

function getMode() {
  return st.mode
}

function isKillSwitchEngaged() {
  return st.killSwitchEngaged
}

function setKillSwitch(enabled) {
  st.killSwitch = !!enabled
}

// Снимает блокировку (Kill Switch) и наш системный прокси, если VPN не включён.
function clearProxy() {
  if (st.desired) return
  st.killSwitchEngaged = false
  firewall.disable()
  if (ourProxyActive()) systemProxy.clearProxy()
}

// Синхронная аварийная очистка — для process.on('exit').
function emergencyCleanupSync() {
  const proc = st.proc
  st.proc = null
  st.desired = false
  if (proc && proc.exitCode === null) {
    try { execFileSync('taskkill', ['/F', '/PID', String(proc.pid)], { stdio: 'ignore', windowsHide: true, timeout: 5000 }) } catch {}
  }
  removePid()
  if (firewall.isActive()) firewall.disableSync()
  if (st.mode === 'proxy' && ourProxyActive()) systemProxy.clearProxy()
}

// Очистка следов прошлого запуска (падение приложения, обновление поверх v2.0.x):
// осиротевший sing-box, правило блокировки, маршруты старого TUN (tun2socks), наш прокси.
async function cleanupStale({ dataDir, killSwitch = false, httpPort = 10809 } = {}) {
  st.workDir = path.join(dataDir || defaultDataDir(), 'sing-box')
  st.httpPort = httpPort
  const pf = pidFile(st.workDir)
  try {
    const pid = parseInt(fs.readFileSync(pf, 'utf-8'), 10)
    if (pid > 0) {
      const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true, timeout: 5000 })
      if (/"sing-box\.exe"/i.test(out)) {
        execFileSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true, timeout: 5000 })
        console.log(`[VPN] Остановлено ядро от прошлого запуска (PID ${pid})`)
      }
    }
  } catch { /* нет pid-файла */ }
  try { fs.unlinkSync(pf) } catch {}

  firewall.disableSync()

  // Маршруты старого TUN-режима (tun2socks, шлюз 10.0.0.1) — если остались после v2.0.x.
  for (const net0 of ['0.0.0.0', '128.0.0.0']) {
    try { execFileSync('route', ['delete', net0, 'mask', '128.0.0.0', '10.0.0.1'], { stdio: 'ignore', windowsHide: true, timeout: 3000 }) } catch {}
  }

  if (!killSwitch && ourProxyActive()) {
    systemProxy.clearProxy()
    console.log('[VPN] Снят системный прокси, оставшийся от прошлого запуска')
  }
}

module.exports = {
  connect,
  disconnect,
  getStatus,
  getMode,
  setKillSwitch,
  clearProxy,
  isKillSwitchEngaged,
  emergencyCleanupSync,
  cleanupStale,
  findSingbox,
}
