const { spawn, execFile, execFileSync } = require('child_process')
const { lookup } = require('dns').promises
const { existsSync } = require('fs')
const { isIPv4 } = require('net')
const path = require('path')
const { promisify } = require('util')
const { once } = require('events')
const { setTimeout: delay } = require('timers/promises')

const TUN_NAME = 'LiptonVPN'
const TUN_IP = '198.18.7.2'
const TUN_PREFIXES = ['0.0.0.0/1', '128.0.0.0/1']
const COMMAND_OPTIONS = { windowsHide: true, timeout: 5000 }
const runFile = promisify(execFile)
let active = null

function findTun2socks() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'resources', 'xray', 'tun2socks.exe'),
    path.join(__dirname, '..', 'resources', 'xray', 'tun2socks.exe'),
  ]
  const binary = candidates.find(candidate => candidate && existsSync(candidate))
  if (!binary) throw new Error('Не найден tun2socks.exe. Переустановите Lipton VPN.')
  return binary
}

async function powershell(script) {
  const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], COMMAND_OPTIONS)
  return stdout.trim()
}

async function resolveEndpoint(address) {
  if (isIPv4(address)) return address
  try {
    return (await lookup(address, { family: 4 })).address
  } catch {
    throw new Error('Не удалось определить IPv4-адрес сервера VPN. Проверьте DNS и обновите подписку.')
  }
}

async function routeTo(address) {
  if (!isIPv4(address)) throw new Error('Для маршрута нужен адрес IPv4')
  const json = await powershell(`Find-NetRoute -RemoteIPAddress '${address}' -ErrorAction Stop | Where-Object DestinationPrefix | Select-Object -First 1 InterfaceIndex,NextHop,DestinationPrefix | ConvertTo-Json -Compress`)
  return JSON.parse(json || 'null')
}

async function waitForAddress(index, signal) {
  const until = Date.now() + 5000
  while (Date.now() < until) {
    signal?.throwIfAborted()
    const state = await powershell(`(Get-NetIPAddress -InterfaceIndex ${index} -IPAddress '${TUN_IP}' -ErrorAction SilentlyContinue).AddressState`)
    if (state === 'Preferred') return
    await delay(250, undefined, { signal })
  }
  throw new Error('Windows не активировала IPv4-адрес VPN-адаптера')
}

function routeArgs(action, prefix, index, nextHop) {
  return ['interface', 'ipv4', action, 'route', prefix, `interface=${index}`, `nexthop=${nextHop}`, 'store=active']
}

async function configure(args, description) {
  try {
    await runFile('netsh.exe', ['interface', 'ipv4', ...args], COMMAND_OPTIONS)
  } catch (error) {
    console.warn('[TUN]', description, (error.stdout || error.stderr || error.message).trim())
    throw new Error(description + '. Проверьте права администратора и другие VPN.')
  }
}

async function addRoute(session, prefix, index, nextHop) {
  await configure(routeArgs('add', prefix, index, nextHop).slice(2), 'Не удалось добавить маршрут ' + prefix)
  session.routes.push(routeArgs('delete', prefix, index, nextHop))
}

async function waitForAdapter(session, signal) {
  const until = Date.now() + 10000
  while (Date.now() < until) {
    signal?.throwIfAborted()
    if (session.failure || session.proc.exitCode !== null || session.proc.signalCode !== null) {
      throw new Error(session.failure || 'Драйвер VPN остановился. Проверьте, не заблокирован ли tun2socks.')
    }
    const output = await powershell(`(Get-NetAdapter -Name '${TUN_NAME}' -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up').ifIndex`)
    const index = Number(output)
    if (Number.isInteger(index) && index > 0) return index
    await delay(250, undefined, { signal })
  }
  throw new Error('Виртуальный адаптер VPN не появился. Проверьте запуск от администратора и журнал антивируса.')
}

async function start(endpoint, socksPort, { signal, onExit } = {}) {
  await stop()
  signal?.throwIfAborted()
  const binary = findTun2socks()
  const gateway = await routeTo(endpoint)
  if (!gateway || !Number.isInteger(gateway.InterfaceIndex) || !isIPv4(gateway.NextHop)) {
    throw new Error('Не найден сетевой маршрут до VPN-сервера')
  }

  const session = { proc: null, routes: [], failure: null, ready: false }
  active = session
  try {
    if (gateway.DestinationPrefix !== endpoint + '/32') {
      await addRoute(session, endpoint + '/32', gateway.InterfaceIndex, gateway.NextHop)
    }
    signal?.throwIfAborted()
    const proc = spawn(binary, ['-device', `tun://${TUN_NAME}`, '-proxy', `socks5://127.0.0.1:${socksPort}`, '-loglevel', 'warning'], {
      cwd: path.dirname(binary), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    session.proc = proc
    for (const stream of [proc.stdout, proc.stderr]) {
      stream.on('data', chunk => console.log('[tun2socks]', chunk.toString().trim()))
    }
    proc.once('error', error => { session.failure = 'Не удалось запустить tun2socks: ' + error.message })
    proc.once('exit', () => { if (active === session && session.ready) onExit?.() })

    const index = await waitForAdapter(session, signal)
    await configure(['set', 'address', `name=${index}`, 'source=static', `address=${TUN_IP}/30`, 'gateway=none', 'store=active'], 'Не удалось настроить адрес VPN-адаптера')
    await configure(['set', 'subinterface', String(index), 'mtu=1380', 'store=active'], 'Не удалось настроить MTU VPN-адаптера')
    await waitForAddress(index, signal)
    for (const prefix of TUN_PREFIXES) {
      signal?.throwIfAborted()
      await addRoute(session, prefix, index, '0.0.0.0')
    }

    for (const destination of ['8.8.8.8', '149.112.112.112']) {
      const selected = await routeTo(destination).catch(() => null)
      if (selected?.InterfaceIndex !== index) throw new Error('Windows отправляет трафик мимо VPN-адаптера')
    }
    if (proc.exitCode !== null || proc.signalCode !== null || session.failure) {
      throw new Error(session.failure || 'Виртуальный адаптер VPN отключился')
    }
    session.ready = true
    console.log(`[TUN] Интерфейс ${index}, маршруты установлены, MTU=1380`)
  } catch (error) {
    await stop()
    throw error
  }
}

async function stop() {
  const session = active
  active = null
  if (!session) return
  for (const args of session.routes.reverse()) {
    try { await runFile('netsh.exe', args, COMMAND_OPTIONS) } catch (error) {
      console.warn('[TUN] Не удалось удалить маршрут:', error.message)
    }
  }
  const proc = session.proc
  if (proc?.pid && proc.exitCode === null && proc.signalCode === null) {
    const exited = once(proc, 'exit', { signal: AbortSignal.timeout(2000) }).catch(() => {})
    proc.kill()
    await exited
  }
}

function emergencyCleanupSync() {
  const session = active
  active = null
  if (!session) return
  for (const args of session.routes.reverse()) {
    try { execFileSync('netsh.exe', args, { ...COMMAND_OPTIONS, stdio: 'ignore' }) } catch {}
  }
  session.proc?.kill()
}

module.exports = { start, stop, resolveEndpoint, emergencyCleanupSync }
