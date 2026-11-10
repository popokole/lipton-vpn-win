const { spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const dns = require('dns').promises

const TUN_NAME = 'LiptonVPN'
const TUN_IP   = '10.0.0.2'
const TUN_MASK = '255.255.255.0'
const TUN_GW   = '10.0.0.1'

let tun2socksProc = null
let savedServerIp = null

function findTun2socks() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'resources', 'xray', 'tun2socks.exe'),
    path.join(__dirname, '..', 'resources', 'xray', 'tun2socks.exe'),
  ].filter(Boolean)
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error('tun2socks.exe не найден. Поместите tun2socks.exe в resources/xray/')
}

function getDefaultGateway() {
  // route print is instant (no PowerShell startup cost)
  try {
    const out = execSync('route print 0.0.0.0', { encoding: 'utf8', timeout: 3000, windowsHide: true })
    const match = out.match(/\s+0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/)
    if (match && match[1] !== '0.0.0.0') return match[1]
  } catch {}
  // fallback: PowerShell
  try {
    const out = execSync(
      `powershell -NoProfile -NonInteractive -Command "Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1 -ExpandProperty NextHop"`,
      { encoding: 'utf8', timeout: 8000, windowsHide: true }
    ).trim()
    if (out && out !== '0.0.0.0') return out
  } catch {}
  throw new Error('Не удалось определить шлюз по умолчанию')
}

async function resolveIp(hostname) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return hostname
  try {
    const r = await dns.lookup(hostname, { family: 4 })
    return r.address
  } catch {
    return hostname
  }
}

function cmd(c) {
  try { execSync(c, { stdio: 'ignore', timeout: 5000, windowsHide: true }) }
  catch (e) { console.warn('[TUN] cmd failed:', e.message, '|', c) }
}

// Индекс адаптера TUN: без IF Windows может привязать маршрут 10.0.0.1 к Ethernet,
// и «весь трафик через VPN» уходит мимо туннеля (было 10.11.2026 на v2.2.15).
function getTunIfIndex() {
  try {
    const out = execSync(
      `powershell -NoProfile -NonInteractive -Command "(Get-NetAdapter -Name '${TUN_NAME}' -ErrorAction Stop).ifIndex"`,
      { encoding: 'utf8', timeout: 4000, windowsHide: true }
    ).trim()
    const n = parseInt(out, 10)
    return Number.isInteger(n) && n > 0 ? n : null
  } catch { return null }
}

function waitForInterface(proc, timeout = 12000) {
  return new Promise((resolve, reject) => {
    let done = false

    const fail = (msg) => {
      if (done) return
      done = true
      proc.removeListener('exit', onExit)
      reject(new Error(msg))
    }

    const ok = () => {
      if (done) return
      done = true
      proc.removeListener('exit', onExit)
      resolve()
    }

    const onExit = (code) => fail(`tun2socks завершился (код ${code}) — возможно, wintun.dll не найден`)
    proc.once('exit', onExit)

    const start = Date.now()
    function check() {
      if (done) return
      try {
        const out = execSync(
          `powershell -NoProfile -NonInteractive -Command "Get-NetAdapter -Name '${TUN_NAME}' -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count"`,
          { encoding: 'utf8', timeout: 4000, windowsHide: true }
        ).trim()
        if (parseInt(out) > 0) { ok(); return }
      } catch {}
      if (Date.now() - start > timeout) {
        fail(`TUN интерфейс не появился (${timeout}мс)`)
        return
      }
      setTimeout(check, 700)
    }
    check()
  })
}

async function start(serverAddress, socksPort = 10808) {
  await stop()

  const tunPath = findTun2socks()
  const tunDir  = path.dirname(tunPath)

  const gateway = getDefaultGateway()
  savedServerIp = await resolveIp(serverAddress)
  console.log(`[TUN] Шлюз=${gateway}, сервер=${savedServerIp}`)

  // Bypass route for VPN server so it doesn't go through TUN
  cmd(`route add ${savedServerIp} mask 255.255.255.255 ${gateway} metric 1`)

  tun2socksProc = spawn(tunPath, [
    '-device', `tun://${TUN_NAME}`,
    '-proxy',  `socks5://127.0.0.1:${socksPort}`,
    '-loglevel', 'warning',
  ], {
    cwd: tunDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  tun2socksProc.stdout.on('data', d => console.log('[tun2socks]', d.toString().trim()))
  tun2socksProc.stderr.on('data', d => console.log('[tun2socks]', d.toString().trim()))
  tun2socksProc.on('exit', code => { console.log(`[TUN] tun2socks завершён, код ${code}`); tun2socksProc = null })
  tun2socksProc.on('error', e => console.error('[TUN] Ошибка tun2socks:', e.message))

  await waitForInterface(tun2socksProc)
  console.log('[TUN] Интерфейс появился, назначаем IP...')

  cmd(`netsh interface ip set address name="${TUN_NAME}" static ${TUN_IP} ${TUN_MASK}`)
  await new Promise(r => setTimeout(r, 600))

  // Reduce MTU to avoid fragmentation through VPN tunnel (fixes CS2/gaming UDP)
  cmd(`netsh interface ipv4 set subinterface "${TUN_NAME}" mtu=1380 store=active`)

  // Split default route through TUN (two /1 entries override default gateway)
  const ifIdx = getTunIfIndex()
  const ifArg = ifIdx ? ` IF ${ifIdx}` : ''
  console.log(`[TUN] Индекс адаптера: ${ifIdx || 'не найден'}`)
  cmd(`route add 0.0.0.0   mask 128.0.0.0 ${TUN_GW} metric 5${ifArg}`)
  cmd(`route add 128.0.0.0 mask 128.0.0.0 ${TUN_GW} metric 5${ifArg}`)

  console.log('[TUN] TUN mode активирован — весь трафик (TCP+UDP) через VPN, MTU=1380')
}

async function stop() {
  cmd(`route delete 0.0.0.0   mask 128.0.0.0 ${TUN_GW}`)
  cmd(`route delete 128.0.0.0 mask 128.0.0.0 ${TUN_GW}`)

  if (savedServerIp) {
    cmd(`route delete ${savedServerIp} mask 255.255.255.255`)
    savedServerIp = null
  }

  if (tun2socksProc) {
    const proc = tun2socksProc
    tun2socksProc = null
    await new Promise(resolve => {
      proc.once('exit', resolve)
      try { proc.kill() } catch { resolve() }
      setTimeout(resolve, 3000)
    })
  }

  console.log('[TUN] TUN mode остановлен')
}

module.exports = { start, stop }
