const { spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { generateConfig } = require('./xray-config')
const logger = require('./logger')
const tunManager = require('./tun-manager')

let xrayProc = null
let status = 'disconnected'
let killSwitchEnabled = false
let tunModeActive = false

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

// ─── System proxy ─────────────────────────────────────────────────────────────

const REG = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'

function setProxy(host, port) {
  try {
    execSync(`reg add "${REG}" /v ProxyEnable /t REG_DWORD /d 1 /f`, { stdio: 'ignore' })
    execSync(`reg add "${REG}" /v ProxyServer /t REG_SZ /d "${host}:${port}" /f`, { stdio: 'ignore' })
    execSync(
      `reg add "${REG}" /v ProxyOverride /t REG_SZ /d "localhost;127.*;10.*;172.16.*;192.168.*;*.ru;*.рф" /f`,
      { stdio: 'ignore' }
    )
    notifyWininet()
    console.log(`[VPN] Прокси установлен: ${host}:${port}`)
  } catch (e) {
    console.error('[VPN] Ошибка установки прокси:', e.message)
  }
}

function clearProxy() {
  try {
    execSync(`reg add "${REG}" /v ProxyEnable /t REG_DWORD /d 0 /f`, { stdio: 'ignore' })
    execSync(`reg delete "${REG}" /v ProxyServer /f`, { stdio: 'ignore' })
    notifyWininet()
    console.log('[VPN] Прокси очищен')
  } catch {
    // ignore if key didn't exist
  }
}

function notifyWininet() {
  try {
    const { spawn } = require('child_process')
    spawn('powershell', [
      '-WindowStyle', 'Hidden', '-Command',
      `$t=Add-Type -PassThru -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\\"wininet.dll\\")]public static extern bool InternetSetOption(IntPtr a,int b,IntPtr c,int d);}';$t::InternetSetOption([IntPtr]::Zero,39,[IntPtr]::Zero,0);$t::InternetSetOption([IntPtr]::Zero,37,[IntPtr]::Zero,0)`,
    ], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } catch { /* non-critical */ }
}

// ─── Kill Switch ──────────────────────────────────────────────────────────────

function setKillSwitch(enabled) {
  killSwitchEnabled = enabled
  console.log(`[Kill Switch] ${enabled ? 'включён' : 'выключен'}`)
}

// ─── Connect / Disconnect ─────────────────────────────────────────────────────

async function connect(server, opts = {}) {
  await disconnect()

  let xrayPath
  try {
    xrayPath = findXray()
    console.log('[VPN] xray найден:', xrayPath)
  } catch (e) {
    console.error('[VPN]', e.message)
    throw e
  }

  const geoDir = findGeoDir()
  const dataDir = opts.dataDir || path.join(os.homedir(), 'AppData', 'Local', 'LiptonVPN')
  const configPath = path.join(dataDir, 'xray', 'config.json')

  fs.mkdirSync(path.dirname(configPath), { recursive: true })

  const config = generateConfig(server, {
    socksPort: opts.socksPort || 10808,
    httpPort: opts.httpPort || 10809,
    bypassRu: opts.bypassRu !== false,
    bypassDomains: opts.bypassDomains || [],
    adBlock: opts.adBlock === true,
  })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

  console.log(`[VPN] Подключение к: ${server.remark || server.address} (${server.protocol})`)
  console.log(`[VPN] Сервер: ${server.address}:${server.port}, httpPort=${opts.httpPort || 10809}`)
  console.log(`[VPN] Обход РФ: ${opts.bypassRu !== false ? 'вкл' : 'выкл'}`)
  console.log(`[VPN] Конфиг: ${configPath}`)

  return new Promise((resolve) => {
    status = 'connecting'

    xrayProc = spawn(xrayPath, ['-config', configPath], {
      env: { ...process.env, XRAY_LOCATION_ASSET: geoDir },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let resolved = false

    const done = async (success, error) => {
      if (resolved) return
      resolved = true
      if (success) {
        status = 'connected'
        if (opts.tunMode) {
          try {
            await tunManager.start(server.address, opts.socksPort || 10808)
            tunModeActive = true
            console.log('[VPN] Подключено (TUN mode)')
          } catch (e) {
            console.error('[TUN] Ошибка запуска TUN, откат на proxy:', e.message)
            setProxy('127.0.0.1', opts.httpPort || 10809)
            tunModeActive = false
          }
        } else {
          setProxy('127.0.0.1', opts.httpPort || 10809)
          tunModeActive = false
          console.log('[VPN] Подключено (proxy mode)')
        }
        resolve({ success: true })
      } else {
        status = 'error'
        console.error('[VPN] Ошибка подключения:', error)
        resolve({ success: false, error })
      }
    }

    xrayProc.stdout.on('data', d => {
      const lines = d.toString().trim().split('\n')
      for (const line of lines) {
        const t = line.trim()
        if (t) logger.verbose('[xray stdout]', t)
        if (t.includes('started') || t.includes('Running') || t.includes('[Warning]')) done(true)
      }
    })

    xrayProc.stderr.on('data', d => {
      const lines = d.toString().trim().split('\n')
      for (const line of lines) {
        const t = line.trim()
        if (!t) continue
        logger.verbose('[xray stderr]', t)
        const low = t.toLowerCase()
        if (low.includes('failed') || low.includes('error') || (low.includes('dial') && low.includes('refused'))) {
          console.error('[VPN] Ошибка xray →', t)
          done(false, t)
        }
      }
    })

    xrayProc.on('error', err => {
      console.error('[VPN] Ошибка запуска xray:', err.message)
      done(false, err.message)
    })

    xrayProc.on('exit', (code) => {
      console.log(`[VPN] xray завершён, код ${code}, статус был: ${status}`)
      if (!resolved) {
        console.error(`[VPN] xray завершился до подключения, код: ${code}`)
        done(false, `xray завершился с кодом ${code}`)
      }
      xrayProc = null
      if (status === 'connected') {
        status = 'disconnected'
        if (tunModeActive) {
          tunModeActive = false
          tunManager.stop().catch(() => {})
          opts.onUnexpectedDisconnect?.()
        } else if (killSwitchEnabled) {
          setProxy('127.0.0.1', 1)
          console.log('[Kill Switch] Активирован — трафик заблокирован')
          opts.onKillSwitch?.()
        } else {
          clearProxy()
          opts.onUnexpectedDisconnect?.()
        }
      }
    })

    // Assume success after 6s if no error
    setTimeout(() => done(true), 6000)
  })
}

async function disconnect() {
  if (tunModeActive) {
    tunModeActive = false
    await tunManager.stop()
  } else {
    clearProxy()
  }
  if (!xrayProc) { status = 'disconnected'; return }
  status = 'disconnecting'
  console.log('[VPN] Отключение...')

  return new Promise(resolve => {
    const proc = xrayProc
    xrayProc = null

    const finish = () => {
      status = 'disconnected'
      console.log('[VPN] Отключено')
      resolve()
    }

    proc.once('exit', finish)
    try { proc.kill() } catch { finish() }
    setTimeout(() => { try { process.kill(proc.pid, 'SIGKILL') } catch {} finish() }, 3000)
  })
}

function getStatus() { return status }

module.exports = { connect, disconnect, getStatus, clearProxy, setKillSwitch }
