const { spawn, execFile } = require('child_process')
const { lookup } = require('dns').promises
const { writeFile } = require('fs').promises
const { isIPv4 } = require('net')
const path = require('path')
const { promisify } = require('util')
const { once } = require('events')
const { setTimeout: delay } = require('timers/promises')
const { findSingbox } = require('./singbox-manager')
const { generateSingboxConfig } = require('./singbox-config')
const logger = require('./logger')

const runFile = promisify(execFile)
let active = null

async function resolveEndpoint(address) {
  if (isIPv4(address)) return address
  try {
    return (await lookup(address, { family: 4 })).address
  } catch {
    throw new Error('Не удалось определить IPv4-адрес сервера VPN. Проверьте DNS и обновите подписку.')
  }
}

async function waitForTun(session, signal) {
  const until = Date.now() + 10000
  while (Date.now() < until) {
    signal?.throwIfAborted()
    if (session.failure) throw session.failure
    if (session.started) return
    await delay(100, undefined, { signal })
  }
  throw new Error('Не удалось запустить VPN-адаптер. Проверьте права администратора и журнал антивируса.')
}

async function start(endpoint, socksPort, opts) {
  await stop()
  const { signal, onExit, dataDir } = opts
  signal?.throwIfAborted()
  const binary = findSingbox()
  const { config } = generateSingboxConfig([], {
    ...opts, mode: 'tun', endpoint, localSocksPort: socksPort, mtu: 1380,
    rulesDir: path.join(path.dirname(binary), 'rules'), logLevel: 'info',
  })
  const configPath = path.join(dataDir, 'xray', 'tun.json')
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
  try {
    await runFile(binary, ['check', '-c', configPath], { windowsHide: true, timeout: 8000, signal })
  } catch (error) {
    signal?.throwIfAborted()
    logger.verbose('[TUN]', error.stderr || error.message)
    throw new Error('Не удалось проверить конфигурацию VPN-адаптера')
  }
  signal?.throwIfAborted()

  const proc = spawn(binary, ['run', '--disable-color', '-c', configPath], {
    cwd: path.dirname(binary), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  const session = { proc, failure: null, started: false, ready: false }
  active = session
  let tail = ''
  for (const stream of [proc.stdout, proc.stderr]) {
    stream.on('data', chunk => {
      const message = chunk.toString()
      for (const line of message.split(/\r?\n/)) {
        if (/\b(?:WARN|ERROR|FATAL)\b/.test(line)) logger.verbose('[TUN]', line)
      }
      if (session.started) return
      tail = (tail + message).slice(-2048)
      session.started = /sing-box started/.test(tail)
    })
  }
  proc.once('error', error => { session.failure = new Error('Не удалось запустить VPN-адаптер: ' + error.message) })
  proc.once('exit', code => {
    session.failure = new Error('VPN-адаптер остановился, код: ' + code)
    if (active === session && session.ready) onExit?.()
  })
  try {
    await waitForTun(session, signal)
    session.ready = true
  } catch (error) {
    await stop()
    throw error
  }
}

async function stop() {
  const proc = active?.proc
  active = null
  if (!proc?.pid || proc.exitCode !== null || proc.signalCode !== null) return
  const exited = once(proc, 'exit', { signal: AbortSignal.timeout(2000) }).catch(() => {})
  proc.kill()
  await exited
}

function emergencyCleanupSync() {
  active?.proc.kill()
  active = null
}

module.exports = { start, stop, resolveEndpoint, emergencyCleanupSync }
