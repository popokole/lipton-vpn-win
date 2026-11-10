const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { generateConfig } = require('./xray-config')
const logger = require('./logger')
const tunManager = require('./tun-manager')

let active = null
let pending = null
let operations = Promise.resolve()
let status = 'disconnected'
let killSwitchEnabled = false
let killSwitchEngaged = false

// ─── xray binary / geo-data paths ────────────────────────────────────────────

function findXray() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'resources', 'xray', 'xray.exe'),
    path.join(__dirname, '..', 'resources', 'xray', 'xray.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'LiptonVPN', 'xray', 'xray.exe'),
  ].filter(Boolean)
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error('xray.exe не найден. Поместите xray.exe в папку resources/xray/ проекта.')
}

function findGeoDir() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'resources', 'xray'),
    path.join(__dirname, '..', 'resources', 'xray'),
    path.join(os.homedir(), 'AppData', 'Local', 'LiptonVPN', 'xray'),
  ].filter(Boolean)
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'geoip.dat'))) return p
  }
  return path.dirname(findXray())
}

const { setProxy, clearProxy, getProxyServer } = require('./system-proxy')

function enqueue(run) {
  const operation = operations.then(run)
  operations = operation.catch(() => {})
  return operation
}

function stopChild(proc) {
  if (!proc?.pid || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve()
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer)
      proc.removeListener('exit', finish)
      resolve()
    }
    const timer = setTimeout(finish, 2000)
    proc.once('exit', finish)
    if (!proc.kill()) finish()
  })
}

function clearOwnedProxy(httpPort) {
  if ([`127.0.0.1:${httpPort}`, '127.0.0.1:1'].includes(getProxyServer())) clearProxy()
}

async function tearDown() {
  const session = active
  active = null
  if (session?.mode === 'tun') await tunManager.stop()
  if (session?.proxySet || killSwitchEngaged) clearOwnedProxy(session?.httpPort)
  killSwitchEngaged = false
  await stopChild(session?.proc)
  status = 'disconnected'
}

function waitForXray(proc, signal) {
  return new Promise((resolve, reject) => {
    let tail = ''
    const onData = chunk => {
      tail = (tail + chunk.toString()).slice(-2048)
      if (/\bXray [^\r\n]*\bstarted\b/i.test(tail)) finish()
    }
    const onError = error => finish(new Error('Не удалось запустить Xray: ' + error.message))
    const onExit = code => finish(new Error('Xray завершился до подключения, код: ' + code))
    const onAbort = () => finish(signal.reason)
    const timer = setTimeout(() => finish(new Error('Xray не запустился за 8 секунд')), 8000)

    function finish(error) {
      clearTimeout(timer)
      proc.stdout.removeListener('data', onData)
      proc.stderr.removeListener('data', onData)
      proc.removeListener('error', onError)
      proc.removeListener('exit', onExit)
      signal.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }

    if (signal.aborted) return onAbort()
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.once('error', onError)
    proc.once('exit', onExit)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function unexpectedExit(session, opts) {
  if (active !== session) return
  if (status === 'connecting') {
    session.controller.abort(new Error('Ядро или виртуальный адаптер VPN остановились во время подключения'))
    return
  }
  if (status !== 'connected') return

  enqueue(async () => {
    if (active !== session) return
    await tearDown()
    if (session.mode === 'proxy' && killSwitchEnabled && setProxy('127.0.0.1', 1, { bypassRu: false })) {
      killSwitchEngaged = true
      opts.onKillSwitch?.()
    } else {
      opts.onUnexpectedDisconnect?.()
    }
  }).catch(error => console.warn('[VPN] Ошибка отключения:', error.message))
}

function connect(server, opts = {}) {
  pending?.abort(new Error('Подключение отменено'))
  const controller = new AbortController()
  pending = controller
  const { signal } = controller

  return enqueue(async () => {
    try {
      signal.throwIfAborted()
      await tearDown()
      signal.throwIfAborted()
      status = 'connecting'

      const xrayPath = findXray()
      const geoDir = findGeoDir()
      const socksPort = opts.socksPort || 10808
      const httpPort = opts.httpPort || 10809
      const mode = opts.tunMode ? 'tun' : 'proxy'
      const dataDir = opts.dataDir || path.join(os.homedir(), 'AppData', 'Local', 'LiptonVPN')
      const configPath = path.join(dataDir, 'xray', 'config.json')
      const endpoint = mode === 'tun' ? await tunManager.resolveEndpoint(server.address) : null
      signal.throwIfAborted()
      const config = generateConfig(server, {
        socksPort,
        httpPort,
        tunFrontend: mode === 'tun',
        bypassRu: opts.bypassRu !== false,
        bypassDomains: opts.bypassDomains || [],
        adBlock: opts.adBlock === true,
      })
      if (endpoint) {
        const outbound = config.outbounds[0]
        const destination = (outbound.settings.vnext || outbound.settings.servers)[0]
        destination.address = endpoint
        if (outbound.streamSettings.tlsSettings) outbound.streamSettings.tlsSettings.serverName ||= server.address
        const xhttp = outbound.streamSettings.xhttpSettings || outbound.streamSettings.splithttpSettings
        if (xhttp) xhttp.host ||= server.address
      }
      fs.mkdirSync(path.dirname(configPath), { recursive: true })
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
      console.log(`[VPN] Подключение к ${server.remark || server.address} через Xray (${mode})`)

      const proc = spawn(xrayPath, ['-config', configPath], {
        env: { ...process.env, XRAY_LOCATION_ASSET: geoDir },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      const session = { proc, mode, httpPort, controller }
      active = session
      for (const stream of [proc.stdout, proc.stderr]) {
        stream.on('data', chunk => logger.verbose('[xray]', chunk.toString().trim()))
      }
      proc.once('error', error => console.error('[VPN] Ошибка запуска Xray:', error.message))
      await waitForXray(proc, signal)
      proc.once('exit', () => unexpectedExit(session, opts))

      if (typeof opts.probeLegacy !== 'function') throw new Error('Проверка VPN недоступна')
      await opts.probeLegacy('proxy', httpPort, signal)
      signal.throwIfAborted()
      if (mode === 'tun') {
        await tunManager.start(endpoint, socksPort, {
          dataDir, signal, bypassRu: opts.bypassRu, bypassDomains: opts.bypassDomains, directDomains: opts.directDomains,
          onExit: () => unexpectedExit(session, opts),
        })
        await opts.probeLegacy('tun', httpPort, signal)
      } else {
        session.proxySet = setProxy('127.0.0.1', httpPort, { bypassRu: opts.bypassRu !== false })
        if (!session.proxySet) throw new Error('Не удалось установить системный прокси Windows')
      }
      signal.throwIfAborted()
      if (proc.exitCode !== null || proc.signalCode !== null) throw new Error('Xray остановился во время подключения')
      status = 'connected'
      console.log(`[VPN] Подключено (${mode})`)
      return { success: true }
    } catch (error) {
      await tearDown()
      console.error('[VPN] Ошибка подключения:', error.message)
      return { success: false, error: error.message }
    } finally {
      if (pending === controller) pending = null
    }
  })
}

function disconnect() {
  pending?.abort(new Error('Подключение отменено'))
  return enqueue(tearDown)
}

function emergencyCleanupSync() {
  if (active?.mode === 'tun') tunManager.emergencyCleanupSync()
  if (active?.proxySet || killSwitchEngaged) clearOwnedProxy(active?.httpPort)
  active?.proc.kill()
}

module.exports = {
  connect, disconnect, getStatus: () => status, getMode: () => active?.mode,
  isKillSwitchEngaged: () => killSwitchEngaged,
  clearProxy, setKillSwitch: enabled => { killSwitchEnabled = enabled }, emergencyCleanupSync,
}
