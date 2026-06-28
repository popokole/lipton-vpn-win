const { app, BrowserWindow, ipcMain, Tray, Menu, shell, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const zlib = require('zlib')

// Logger must be required first so it patches console before anything else logs
const logger = require('./electron/logger')

const settingsManager = require('./electron/settings-manager')
const subscriptionManager = require('./electron/subscription-manager')
const vpnManager = require('./electron/vpn-manager')
const apiClient = require('./electron/api-client')
const { setupAutoUpdater } = require('./electron/auto-updater')

const isDev = process.env.ELECTRON_IS_DEV === '1'

// В dev — отдельный userData, чтобы single-instance lock не конфликтовал с
// установленной версией (dev и прод можно держать запущенными параллельно).
if (isDev) {
  app.setPath('userData', path.join(app.getPath('appData'), 'LiptonVPN-dev'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let mainWindow = null
let tray = null

// ─── Tray icon generator ──────────────────────────────────────────────────────

const POLY = 0xEDB88320
let _crcTable = null
function getCrcTable() {
  if (_crcTable) return _crcTable
  _crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (POLY ^ (c >>> 1)) : (c >>> 1)
    _crcTable[n] = c
  }
  return _crcTable
}
function crc32(buf) {
  const table = getCrcTable()
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF]
  return (crc ^ 0xFFFFFFFF) >>> 0
}
function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const crcVal = crc32(Buffer.concat([t, data]))
  const out = Buffer.alloc(4 + 4 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  t.copy(out, 4)
  data.copy(out, 8)
  out.writeUInt32BE(crcVal, 8 + data.length)
  return out
}
function makeTrayIconPng(r, g, b) {
  const S = 16
  const cx = (S - 1) / 2, cy = (S - 1) / 2, radius = S / 2 - 1.5
  const rows = []
  for (let y = 0; y < S; y++) {
    const row = [0]
    for (let x = 0; x < S; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (d <= radius) row.push(r, g, b, 255)
      else row.push(0, 0, 0, 0)
    }
    rows.push(Buffer.from(row))
  }
  const raw = Buffer.concat(rows)
  const compressed = zlib.deflateSync(raw, { level: 1 })
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4)
  ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

let _iconConnected = null
let _iconDisconnected = null
function getTrayIcon(status) {
  try {
    if (status === 'connected') {
      if (!_iconConnected) _iconConnected = nativeImage.createFromBuffer(makeTrayIconPng(52, 208, 88))
      return _iconConnected
    }
    if (!_iconDisconnected) _iconDisconnected = nativeImage.createFromBuffer(makeTrayIconPng(100, 120, 110))
    return _iconDisconnected
  } catch {
    return nativeImage.createEmpty()
  }
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 390,
    height: 620,
    minWidth: 390,
    minHeight: 620,
    maxWidth: 390,
    maxHeight: 620,
    frame: false,
    transparent: false,
    backgroundColor: '#08080f',
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
    show: false,
    icon: getIconPath(),
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow.hide()
  })
}

function getIconPath() {
  const candidates = [
    path.join(__dirname, 'assets', 'icon.ico'),
    path.join(__dirname, 'assets', 'icon.png'),
    path.join(process.resourcesPath || '', 'resources', 'icons', 'icon.ico'),
  ]
  return candidates.find(p => fs.existsSync(p)) || undefined
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function createTray() {
  tray = new Tray(getTrayIcon('disconnected'))
  tray.setToolTip('Lipton VPN — Отключено')
  refreshTray('disconnected')

  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.hide()
    else { mainWindow.show(); mainWindow.focus() }
  })
}

function refreshTray(status) {
  if (!tray) return
  tray.setImage(getTrayIcon(status))
  tray.setToolTip(`Lipton VPN — ${status === 'connected' ? 'Подключено' : 'Отключено'}`)
  const menu = Menu.buildFromTemplate([
    { label: status === 'connected' ? '● Подключено' : '○ Отключено', enabled: false },
    { type: 'separator' },
    { label: 'Открыть', click: () => { mainWindow.show(); mainWindow.focus() } },
    {
      label: status === 'connected' ? 'Отключиться' : 'Подключиться',
      click: () => {
        if (status === 'connected') vpnManager.disconnect()
        mainWindow.show(); mainWindow.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: async () => {
        await vpnManager.disconnect()
        mainWindow.removeAllListeners('close')
        app.quit()
      },
    },
  ])
  tray.setContextMenu(menu)
}

// ─── Deep link ────────────────────────────────────────────────────────────────

async function handleDeepLink(rawUrl) {
  let subUrl
  if (/^liptonvpn:\/\/add\//i.test(rawUrl)) {
    subUrl = rawUrl.replace(/^liptonvpn:\/\/add\//i, '')
  } else if (/^lipton:\/\/add\//i.test(rawUrl)) {
    subUrl = rawUrl.replace(/^lipton:\/\/add\//i, '')
  } else {
    subUrl = rawUrl.replace(/^liptonapp:\/{0,2}/, '')
  }
  if (!subUrl.startsWith('http')) {
    console.warn('[DeepLink] Неверный URL:', rawUrl)
    mainWindow?.show()
    mainWindow?.focus()
    mainWindow?.webContents.send('sub:add-result', { success: false, error: 'Неверная ссылка подписки' })
    return
  }
  console.log('[DeepLink] Добавление подписки:', subUrl)
  try {
    const result = await subscriptionManager.add(subUrl)
    if (result.success) {
      settingsManager.set('subscriptions', result.subscriptions)
      mainWindow?.webContents.send('sub:updated', result.subscriptions)
      mainWindow?.webContents.send('sub:add-result', { success: true })
      mainWindow?.show()
      mainWindow?.focus()
      console.log('[DeepLink] Подписка добавлена успешно')
    } else {
      console.warn('[DeepLink] Ошибка:', result.error)
      mainWindow?.show()
      mainWindow?.focus()
      mainWindow?.webContents.send('sub:add-result', { success: false, error: result.error })
    }
  } catch (err) {
    console.error('[DeepLink] Исключение:', err.message)
    mainWindow?.show()
    mainWindow?.focus()
    mainWindow?.webContents.send('sub:add-result', { success: false, error: err.message })
  }
}

// ─── Синхронизация подписки из аккаунта ────────────────────────────────────
// Тянет /me/subscription и кладёт подписку как единственную управляемую запись.
// Сервера парсятся из subscription_url (ссылку больше не вводят вручную).
async function syncSubscription() {
  if (!apiClient.isAuthed()) return { success: false, error: 'not-authed' }

  let view
  try {
    view = await apiClient.getSubscription()
  } catch (e) {
    console.error('[Sync] /me/subscription:', e.message)
    return { success: false, error: e.message, status: e.status }
  }

  const settings = settingsManager.getAll()
  const others = (settings.subscriptions || []).filter(s => !s.managed)
  const url = view?.subscription_url

  if (!url) {
    settingsManager.set('subscriptions', others)
    mainWindow?.webContents.send('sub:updated', others)
    mainWindow?.webContents.send('account:subscription', view || null)
    return { success: true, hasAccess: false, view: view || null }
  }

  try {
    const { servers, userInfo } = await subscriptionManager.fetchAndParse(url)
    const prev = (settings.subscriptions || []).find(s => s.managed)
    const managed = {
      id: prev?.id || 'managed',
      name: 'Lipton VPN',
      url,
      managed: true,
      isTrial: view.status === 'trial',
      addedAt: prev?.addedAt || Date.now(),
      expiresAt: view.current_period_end ? new Date(view.current_period_end).getTime() : null,
      lastUpdated: Date.now(),
      servers,
      userInfo,
      status: view.status,
    }
    const subs = [managed, ...others]
    settingsManager.set('subscriptions', subs)
    mainWindow?.webContents.send('sub:updated', subs)
    mainWindow?.webContents.send('account:subscription', view)
    return { success: true, hasAccess: true, view }
  } catch (e) {
    console.error('[Sync] fetch subscription_url:', e.message)
    return { success: false, error: e.message }
  }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

function setupIPC() {
  // App
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:minimize', () => mainWindow?.minimize())
  ipcMain.handle('app:close', () => mainWindow?.hide())
  ipcMain.handle('app:open-external', (_, url) => shell.openExternal(url))

  // Settings
  // Autostart: cached in settings JSON for instant reads — no PowerShell on open
  ipcMain.handle('settings:get-autostart', () => {
    if (isDev) return false
    return settingsManager.get('autostart') === true
  })

  ipcMain.handle('settings:set-autostart', (_, enabled) => {
    if (isDev) return
    settingsManager.set('autostart', enabled)
    console.log(`[Settings] Автозапуск: ${enabled ? 'вкл' : 'выкл'}`)

    // Task Scheduler work is async — returns immediately, doesn't block UI
    const { exec } = require('child_process')
    const os = require('os')

    if (enabled) {
      const exePath  = process.execPath
      const username = os.userInfo().username
      const safePath = exePath.replace(/'/g, "''")
      const script = [
        `$ErrorActionPreference = 'Stop'`,
        `$action    = New-ScheduledTaskAction -Execute '${safePath}'`,
        `$trigger   = New-ScheduledTaskTrigger -AtLogOn -User '${username}'`,
        `$principal = New-ScheduledTaskPrincipal -UserId '${username}' -RunLevel Highest -LogonType Interactive`,
        `$settings  = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan)`,
        `$task = Register-ScheduledTask -TaskName 'LiptonVPN Autostart' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force`,
        `Write-Output "OK state=$($task.State)"`,
      ].join('\r\n')
      const scriptPath = path.join(os.tmpdir(), 'lipton-autostart.ps1')
      try { fs.writeFileSync(scriptPath, script, 'utf-8') } catch {}
      exec(
        `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`,
        { timeout: 15000, windowsHide: true },
        (err, stdout) => {
          try { fs.unlinkSync(scriptPath) } catch {}
          if (err) { console.error('[Autostart] Ошибка:', err.message); settingsManager.set('autostart', false) }
          else console.log('[Autostart] Задача создана:', stdout.trim())
        }
      )
    } else {
      exec(
        `powershell -NoProfile -NonInteractive -Command "try { Unregister-ScheduledTask -TaskName 'LiptonVPN Autostart' -Confirm:$false -ErrorAction Stop } catch {}"`,
        { timeout: 8000, windowsHide: true },
        (err) => { if (err) console.warn('[Autostart] Unregister:', err.message) }
      )
      try { app.setLoginItemSettings({ openAtLogin: false }) } catch {}
    }
  })

  ipcMain.handle('settings:get-bypass-ru', () => {
    const v = settingsManager.get('bypassRu')
    return v !== false // default: true
  })

  ipcMain.handle('settings:set-bypass-ru', (_, enabled) => {
    settingsManager.set('bypassRu', enabled)
    console.log(`[Settings] Обход РФ: ${enabled ? 'вкл' : 'выкл'}`)
  })

  ipcMain.handle('settings:get-logs', () => logger.getLogs())
  ipcMain.handle('settings:clear-logs', () => { logger.clearLogs(); return true })
  ipcMain.handle('settings:open-log-file', () => shell.openPath(logger.getLogFilePath()))

  ipcMain.handle('settings:get-kill-switch', () => settingsManager.get('killSwitch') === true)
  ipcMain.handle('settings:set-kill-switch', (_, enabled) => {
    settingsManager.set('killSwitch', enabled)
    vpnManager.setKillSwitch(enabled)
    if (!enabled && vpnManager.getStatus() === 'disconnected') {
      vpnManager.clearProxy()
      mainWindow?.webContents.send('vpn:status-update', { status: 'disconnected', serverId: null })
    }
    console.log(`[Settings] Kill Switch: ${enabled ? 'вкл' : 'выкл'}`)
  })

  ipcMain.handle('settings:get-auto-connect', () => settingsManager.get('autoConnect') === true)
  ipcMain.handle('settings:set-auto-connect', (_, enabled) => {
    settingsManager.set('autoConnect', enabled)
    console.log(`[Settings] Автоподключение: ${enabled ? 'вкл' : 'выкл'}`)
  })

  ipcMain.handle('settings:get-tun-mode', () => settingsManager.get('tunMode') === true)
  ipcMain.handle('settings:set-tun-mode', (_, enabled) => {
    settingsManager.set('tunMode', enabled)
    console.log(`[Settings] TUN mode: ${enabled ? 'вкл' : 'выкл'}`)
  })

  ipcMain.handle('settings:flush-dns', async () => {
    try {
      const { execSync } = require('child_process')
      execSync('ipconfig /flushdns', { stdio: 'ignore' })
      console.log('[Settings] DNS кэш очищен')
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('settings:reset-dns', async () => {
    try {
      const { execSync } = require('child_process')

      // Flush DNS cache
      try { execSync('ipconfig /flushdns', { stdio: 'ignore', timeout: 5000 }) } catch {}

      // Get all connected adapters except our TUN interface
      let adapters = []
      try {
        const out = execSync(
          `powershell -NoProfile -NonInteractive -Command "Get-NetAdapter | Where-Object {$_.Status -eq 'Up' -and $_.Name -ne 'LiptonVPN'} | Select-Object -ExpandProperty Name"`,
          { encoding: 'utf8', timeout: 8000, windowsHide: true }
        )
        adapters = out.split('\n').map(s => s.trim()).filter(Boolean)
      } catch {}

      // Reset DNS to DHCP on each adapter
      for (const name of adapters) {
        try { execSync(`netsh interface ip set dns name="${name}" source=dhcp`, { stdio: 'ignore', timeout: 4000, windowsHide: true }) } catch {}
        try { execSync(`netsh interface ipv6 set dns name="${name}" source=dhcp`, { stdio: 'ignore', timeout: 4000, windowsHide: true }) } catch {}
      }

      console.log(`[Settings] DNS сброшен на DHCP (${adapters.length} адаптеров), кэш очищен`)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('settings:reset-network', async () => {
    try {
      const { execSync } = require('child_process')

      // 1. Disconnect VPN and clean up TUN/proxy
      await vpnManager.disconnect()
      settingsManager.set('activeServerId', null)
      refreshTray('disconnected')
      mainWindow?.webContents.send('vpn:status-update', { status: 'disconnected' })

      // 2. Force-clear proxy in registry (in case clearProxy was already called but other VPN left garbage)
      const REG_NET = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
      try { execSync(`reg add "${REG_NET}" /v ProxyEnable /t REG_DWORD /d 0 /f`, { stdio: 'ignore' }) } catch {}
      try { execSync(`reg delete "${REG_NET}" /v ProxyServer /f`, { stdio: 'ignore' }) } catch {}
      try { execSync(`reg delete "${REG_NET}" /v AutoConfigURL /f`, { stdio: 'ignore' }) } catch {}

      // 3. Remove TUN split-routes (ours and leftovers from other VPNs)
      try { execSync('route delete 0.0.0.0 mask 128.0.0.0', { stdio: 'ignore', timeout: 3000 }) } catch {}
      try { execSync('route delete 128.0.0.0 mask 128.0.0.0', { stdio: 'ignore', timeout: 3000 }) } catch {}

      // 4. Flush DNS + reset to DHCP
      try { execSync('ipconfig /flushdns', { stdio: 'ignore', timeout: 5000 }) } catch {}
      let adapters = []
      try {
        const out = execSync(
          `powershell -NoProfile -NonInteractive -Command "Get-NetAdapter | Where-Object {$_.Status -eq 'Up' -and $_.Name -ne 'LiptonVPN'} | Select-Object -ExpandProperty Name"`,
          { encoding: 'utf8', timeout: 8000, windowsHide: true }
        )
        adapters = out.split('\n').map(s => s.trim()).filter(Boolean)
      } catch {}
      for (const name of adapters) {
        try { execSync(`netsh interface ip set dns name="${name}" source=dhcp`, { stdio: 'ignore', timeout: 4000, windowsHide: true }) } catch {}
        try { execSync(`netsh interface ipv6 set dns name="${name}" source=dhcp`, { stdio: 'ignore', timeout: 4000, windowsHide: true }) } catch {}
      }

      // 5. Reset Winsock and TCP/IP stack (requires restart to fully apply)
      try { execSync('netsh winsock reset', { stdio: 'ignore', timeout: 10000, windowsHide: true }) } catch {}
      try { execSync('netsh int ip reset', { stdio: 'ignore', timeout: 10000, windowsHide: true }) } catch {}
      try { execSync('netsh int ipv6 reset', { stdio: 'ignore', timeout: 10000, windowsHide: true }) } catch {}

      console.log('[Settings] Полный сброс сети выполнен')
      return { success: true, needsRestart: true }
    } catch (e) {
      console.error('[Settings] Ошибка сброса сети:', e.message)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('settings:is-first-launch', () => settingsManager.get('firstLaunch') !== false)
  ipcMain.handle('settings:complete-onboarding', () => {
    settingsManager.set('firstLaunch', false)
    console.log('[Onboarding] Завершён')
  })

  ipcMain.handle('settings:get-bypass-domains', () => {
    return settingsManager.get('bypassDomains') || []
  })

  ipcMain.handle('settings:add-bypass-domain', (_, domain) => {
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!d) return { success: false, error: 'Пустой домен' }
    const domains = settingsManager.get('bypassDomains') || []
    if (domains.includes(d)) return { success: false, error: 'Уже добавлен' }
    const updated = [...domains, d]
    settingsManager.set('bypassDomains', updated)
    console.log(`[Bypass] Добавлен домен: ${d}`)
    return { success: true, domains: updated }
  })

  ipcMain.handle('settings:remove-bypass-domain', (_, domain) => {
    const domains = settingsManager.get('bypassDomains') || []
    const updated = domains.filter(d => d !== domain)
    settingsManager.set('bypassDomains', updated)
    console.log(`[Bypass] Удалён домен: ${domain}`)
    return { success: true, domains: updated }
  })

  ipcMain.handle('settings:reset-profile', async () => {
    try {
      console.log('[Settings] Сброс прокси Windows...')
      await vpnManager.disconnect()
      settingsManager.set('activeServerId', null)
      refreshTray('disconnected')
      mainWindow?.webContents.send('vpn:status-update', { status: 'disconnected' })
      console.log('[Settings] Прокси Windows сброшен')
      return { success: true }
    } catch (err) {
      console.error('[Settings] Ошибка сброса:', err.message)
      return { success: false, error: err.message }
    }
  })

  // VPN
  ipcMain.handle('vpn:status', () => ({
    status: vpnManager.getStatus(),
    serverId: settingsManager.get('activeServerId'),
  }))

  ipcMain.handle('vpn:connect', async (_, serverId) => {
    try {
      const settings = settingsManager.getAll()
      let server = null
      for (const sub of (settings.subscriptions || [])) {
        server = (sub.servers || []).find(s => s.id === serverId)
        if (server) break
      }
      if (!server) return { success: false, error: 'Сервер не найден' }

      const result = await vpnManager.connect(server, {
        socksPort: settings.socksPort || 10808,
        httpPort: settings.httpPort || 10809,
        dataDir: settingsManager.getDataDir(),
        bypassRu: settings.bypassRu !== false,
        bypassDomains: settings.bypassDomains || [],
        tunMode: settings.tunMode === true,

        onUnexpectedDisconnect: () => {
          settingsManager.set('activeServerId', null)
          refreshTray('disconnected')
          mainWindow?.webContents.send('vpn:status-update', { status: 'disconnected', serverId: null })
        },
        onKillSwitch: () => {
          refreshTray('disconnected')
          mainWindow?.webContents.send('vpn:status-update', { status: 'kill-switch', serverId: null })
        },
      })

      if (result.success) {
        settingsManager.set('activeServerId', serverId)
        refreshTray('connected')
        mainWindow?.webContents.send('vpn:status-update', { status: 'connected', serverId })
      } else {
        console.error('[VPN:Connect] Подключение не удалось:', result.error || '(нет деталей)')
      }
      return result
    } catch (err) {
      console.error('[VPN:Connect] Исключение:', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('vpn:disconnect', async () => {
    try {
      await vpnManager.disconnect()
      settingsManager.set('activeServerId', null)
      refreshTray('disconnected')
      mainWindow?.webContents.send('vpn:status-update', { status: 'disconnected' })
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // Auth
  ipcMain.handle('auth:state', () => ({ authed: apiClient.isAuthed() }))

  ipcMain.handle('auth:email-request', async (_, email) => {
    try { await apiClient.emailRequest(email); return { success: true } }
    catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('auth:email-verify', async (_, { email, code }) => {
    try {
      await apiClient.emailVerify(email, code)
      const sync = await syncSubscription()
      return { success: true, sync }
    } catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('auth:tg-init', async () => {
    try { const r = await apiClient.tgInit(); return { success: true, ...r } }
    catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('auth:tg-verify', async (_, { linkToken, code }) => {
    try {
      await apiClient.tgVerify(linkToken, code)
      const sync = await syncSubscription()
      return { success: true, sync }
    } catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('auth:device-exchange', async (_, code) => {
    try {
      await apiClient.deviceExchange(code)
      const sync = await syncSubscription()
      return { success: true, sync }
    } catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('auth:logout', async () => {
    try { await vpnManager.disconnect() } catch {}
    settingsManager.set('activeServerId', null)
    settingsManager.set('subscriptions', [])
    await apiClient.logout()
    refreshTray('disconnected')
    mainWindow?.webContents.send('vpn:status-update', { status: 'disconnected' })
    mainWindow?.webContents.send('sub:updated', [])
    return { success: true }
  })

  ipcMain.handle('account:sync', () => syncSubscription())

  // Subscriptions
  ipcMain.handle('sub:list', () => settingsManager.get('subscriptions') || [])

  ipcMain.handle('sub:add', async (_, url) => {
    try {
      const result = await subscriptionManager.add(url)
      if (result.success) {
        settingsManager.set('subscriptions', result.subscriptions)
        mainWindow?.webContents.send('sub:updated', result.subscriptions)
      }
      return result
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('sub:remove', async (_, id) => {
    try {
      const settings = settingsManager.getAll()
      const subscriptions = (settings.subscriptions || []).filter(s => s.id !== id)
      settingsManager.set('subscriptions', subscriptions)

      if (settings.activeServerId) {
        const removed = (settings.subscriptions || []).find(s => s.id === id)
        const wasActive = (removed?.servers || []).some(s => s.id === settings.activeServerId)
        if (wasActive) {
          await vpnManager.disconnect()
          settingsManager.set('activeServerId', null)
          refreshTray('disconnected')
          mainWindow?.webContents.send('vpn:status-update', { status: 'disconnected' })
        }
      }

      mainWindow?.webContents.send('sub:updated', subscriptions)
      return { success: true, subscriptions }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('sub:refresh', async (_, id) => {
    try {
      const settings = settingsManager.getAll()
      const sub = (settings.subscriptions || []).find(s => s.id === id)
      if (!sub) return { success: false, error: 'Подписка не найдена' }

      const result = await subscriptionManager.refresh(sub, settings.subscriptions || [])
      if (result.success) {
        settingsManager.set('subscriptions', result.subscriptions)
        mainWindow?.webContents.send('sub:updated', result.subscriptions)
      }
      return result
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('sub:ping', async (_, id) => {
    try {
      const settings = settingsManager.getAll()
      const sub = (settings.subscriptions || []).find(s => s.id === id)
      if (!sub) return { success: false, error: 'Подписка не найдена' }

      const result = await subscriptionManager.pingAll(sub, settings.subscriptions || [])
      if (result.success) {
        settingsManager.set('subscriptions', result.subscriptions)
        mainWindow?.webContents.send('sub:updated', result.subscriptions)
      }
      return result
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // Updater
  ipcMain.handle('updater:install', () => {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('trial:can-claim', () => {
    const settings = settingsManager.getAll()
    const last = settings.lastDailyTrial
    if (!last) return { canClaim: true }
    const today = new Date().toDateString()
    const lastDay = new Date(last).toDateString()
    if (today !== lastDay) return { canClaim: true }
    const midnight = new Date(); midnight.setHours(24, 0, 0, 0)
    return { canClaim: false, nextClaim: midnight.getTime() }
  })

  ipcMain.handle('trial:claim', async () => {
    const settings = settingsManager.getAll()
    const today = new Date().toDateString()
    if (settings.lastDailyTrial && new Date(settings.lastDailyTrial).toDateString() === today)
      return { success: false, error: 'Уже получена сегодня' }
    try {
      const { servers, userInfo } = await subscriptionManager.fetchAndParse(TRIAL_URL)
      const subs = settings.subscriptions || []
      const existing = subs.find(s => s.isTrial)
      const newExpiry = Date.now() + DAILY_TRIAL_DURATION
      let newSubs
      if (existing) {
        newSubs = subs.map(s => s.isTrial ? { ...s, servers, userInfo, expiresAt: newExpiry, lastUpdated: Date.now() } : s)
      } else {
        newSubs = [...subs, { id: 'trial-' + Date.now(), name: 'Пробная подписка', url: TRIAL_URL, isTrial: true, addedAt: Date.now(), expiresAt: newExpiry, lastUpdated: Date.now(), servers, userInfo }]
      }
      settingsManager.set('subscriptions', newSubs)
      settingsManager.set('lastDailyTrial', Date.now())
      mainWindow?.webContents.send('sub:updated', newSubs)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('updater:check', async () => {
    if (isDev) return { status: 'dev' }
    try {
      const { autoUpdater } = require('electron-updater')
      const { app } = require('electron')
      const result = await autoUpdater.checkForUpdates()
      if (!result) return { status: 'latest' }
      const remote = result.updateInfo?.version
      const current = app.getVersion()
      return remote && remote !== current
        ? { status: 'available', version: remote }
        : { status: 'latest' }
    } catch (e) {
      return { status: 'error', message: 'Ошибка проверки обновлений' }
    }
  })
}

// ─── Trial subscription ───────────────────────────────────────────────────────

const TRIAL_URL = 'https://sub.popokole.online/NcvZvQsDXeQ1TJZu'
const TRIAL_DURATION = 60 * 60 * 1000
const DAILY_TRIAL_DURATION = 15 * 60 * 1000

async function maybeAddTrial() {
  const settings = settingsManager.getAll()
  if (settings.trialAdded) return

  try {
    const { servers, userInfo } = await subscriptionManager.fetchAndParse(TRIAL_URL)
    const trialSub = {
      id: 'trial-' + Date.now(),
      name: 'Пробная подписка',
      url: TRIAL_URL,
      isTrial: true,
      addedAt: Date.now(),
      expiresAt: Date.now() + TRIAL_DURATION,
      lastUpdated: Date.now(),
      servers,
      userInfo,
    }
    const subscriptions = [...(settings.subscriptions || []), trialSub]
    settingsManager.set('subscriptions', subscriptions)
    settingsManager.set('trialAdded', true)
    console.log('[Trial] Пробная подписка добавлена')
  } catch (err) {
    console.error('[Trial] Ошибка:', err.message)
    settingsManager.set('trialAdded', true)
  }
}

function checkTrialExpiry() {
  const settings = settingsManager.getAll()
  const subs = settings.subscriptions || []
  // управляемая подписка живёт по данным аккаунта (account:sync), её не трогаем
  const trial = subs.find(s => s.isTrial && !s.managed)
  if (!trial) return

  if (Date.now() > trial.expiresAt) {
    const newSubs = subs.filter(s => !s.isTrial)
    settingsManager.set('subscriptions', newSubs)

    const wasActive = (trial.servers || []).some(s => s.id === settings.activeServerId)
    if (wasActive) {
      vpnManager.disconnect()
      settingsManager.set('activeServerId', null)
      refreshTray('disconnected')
      mainWindow?.webContents.send('vpn:status-update', { status: 'disconnected' })
    }

    mainWindow?.webContents.send('sub:updated', newSubs)
    console.log('[Trial] Пробная подписка истекла')
  }
}

// ─── Auto-connect ─────────────────────────────────────────────────────────────

async function doAutoConnect() {
  if (vpnManager.getStatus() !== 'disconnected') return
  const settings = settingsManager.getAll()
  const subs = settings.subscriptions || []
  const serverId = settings.activeServerId || subs.flatMap(s => s.servers || [])[0]?.id
  if (!serverId) return

  let server = null
  for (const sub of subs) {
    server = (sub.servers || []).find(s => s.id === serverId)
    if (server) break
  }
  if (!server) return

  console.log('[AutoConnect] Подключение к:', server.remark || server.address)
  mainWindow?.webContents.send('vpn:status-update', { status: 'connecting' })

  const result = await vpnManager.connect(server, {
    socksPort: settings.socksPort || 10808,
    httpPort: settings.httpPort || 10809,
    dataDir: settingsManager.getDataDir(),
    bypassRu: settings.bypassRu !== false,
    bypassDomains: settings.bypassDomains || [],
    adBlock: settings.adBlock === true,
    onUnexpectedDisconnect: () => {
      settingsManager.set('activeServerId', null)
      refreshTray('disconnected')
      mainWindow?.webContents.send('vpn:status-update', { status: 'disconnected', serverId: null })
    },
    onKillSwitch: () => {
      refreshTray('disconnected')
      mainWindow?.webContents.send('vpn:status-update', { status: 'kill-switch', serverId: null })
    },
  })

  if (result.success) {
    settingsManager.set('activeServerId', serverId)
    refreshTray('connected')
    mainWindow?.webContents.send('vpn:status-update', { status: 'connected', serverId })
  } else {
    mainWindow?.webContents.send('vpn:status-update', { status: 'disconnected' })
  }
}

// ─── Subscription expiry notifications ───────────────────────────────────────

const EXPIRY_THRESHOLDS = [
  { ms: 3 * 24 * 60 * 60 * 1000, key: '3d', label: '3 дня' },
  { ms: 1 * 24 * 60 * 60 * 1000, key: '1d', label: '1 день' },
  { ms: 3 * 60 * 60 * 1000,      key: '3h', label: '3 часа' },
  { ms: 1 * 60 * 60 * 1000,      key: '1h', label: '1 час'  },
]

function checkSubscriptionExpiry() {
  const settings = settingsManager.getAll()
  const subs = (settings.subscriptions || []).filter(s => !s.isTrial && s.userInfo?.expire > 0)
  const notified = settings.expiryNotified || {}
  let changed = false

  for (const sub of subs) {
    const msLeft = sub.userInfo.expire * 1000 - Date.now()
    if (msLeft <= 0) continue

    for (const t of EXPIRY_THRESHOLDS) {
      const key = `${sub.id}_${t.key}`
      if (notified[key]) continue
      if (msLeft > t.ms) continue

      // Show desktop notification
      try {
        const { Notification } = require('electron')
        new Notification({
          title: 'Lipton VPN — подписка заканчивается',
          body: `«${sub.name}» истекает через ${t.label}`,
        }).show()
      } catch {}

      mainWindow?.webContents.send('sub:expiry-warning', { subName: sub.name, label: t.label })
      notified[key] = Date.now()
      changed = true
      console.log(`[Expiry] Уведомление: ${sub.name} — через ${t.label}`)
    }
  }

  if (changed) settingsManager.set('expiryNotified', notified)
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.setAsDefaultProtocolClient('liptonapp')
app.setAsDefaultProtocolClient('lipton')
app.setAsDefaultProtocolClient('liptonvpn')

app.whenReady().then(async () => {
  createWindow()
  createTray()
  setupIPC()

  const deepLinkArg = process.argv.slice(1).find(a => a.startsWith('liptonapp:') || a.startsWith('lipton:') || a.startsWith('liptonvpn:'))
  if (deepLinkArg) await handleDeepLink(deepLinkArg)

  // Init kill switch from saved settings
  vpnManager.setKillSwitch(settingsManager.get('killSwitch') === true)

  // Подписка теперь приходит из аккаунта — тянем при старте, если вошли.
  if (apiClient.isAuthed()) {
    syncSubscription().catch(err => console.error('[Startup] sync:', err.message))
  }

  setInterval(checkTrialExpiry, 30_000)
  checkTrialExpiry()

  setInterval(checkSubscriptionExpiry, 30 * 60 * 1000)
  setTimeout(checkSubscriptionExpiry, 10_000)

  // Auto-connect after window loads
  if (settingsManager.get('autoConnect') === true) {
    setTimeout(doAutoConnect, 2500)
  }

  if (!isDev) {
    setupAutoUpdater(mainWindow)
  }
})

app.on('second-instance', (event, argv) => {
  const deepLink = argv.find(a => a.startsWith('liptonapp:') || a.startsWith('lipton:') || a.startsWith('liptonvpn:'))
  if (deepLink) handleDeepLink(deepLink)

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => { /* keep alive in tray */ })

app.on('before-quit', async () => {
  await vpnManager.disconnect()
})
