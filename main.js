const { app, BrowserWindow, ipcMain, Tray, Menu, shell, nativeImage, nativeTheme, screen, session } = require('electron')
const path = require('path')
const fs = require('fs')

// Logger must be required first so it patches console before anything else logs
const logger = require('./electron/logger')

const settingsManager = require('./electron/settings-manager')
const subscriptionManager = require('./electron/subscription-manager')
const legacyCore = require('./electron/vpn-manager')
const singboxCore = require('./electron/singbox-manager')
const apiClient = require('./electron/api-client')
const connectionCheck = require('./electron/connection-check')
const windowState = require('./electron/window-state')
const { makeLogoPng } = require('./electron/tray-icon')
const { createStats } = require('./electron/vpn-stats')
const guestTrial = require('./electron/guest-trial')
const bypassDomains = require('./electron/bypass-domains')
const { setupAutoUpdater } = require('./electron/auto-updater')

const isDev = process.env.ELECTRON_IS_DEV === '1'

// ─── Ядро VPN ─────────────────────────────────────────────────────────────────
// Основное — sing-box (singbox-manager). Старое xray+tun2socks (vpn-manager) —
// скрытый запасной вариант по настройке coreLegacy, на один релиз.

let activeCore = null

function pickCore() {
  return settingsManager.get('coreLegacy') === true ? legacyCore : singboxCore
}

const vpnManager = {
  async connect(server, opts) {
    const next = pickCore()
    if (activeCore && activeCore !== next) await activeCore.disconnect()
    activeCore = next
    return next.connect(server, opts)
  },
  async disconnect() {
    cancelAutoConnectRetry()
    await (activeCore || pickCore()).disconnect()
  },
  getStatus() {
    return (activeCore || pickCore()).getStatus()
  },
  // Режим работающего ядра: 'tun' | 'proxy'. У старого ядра — по настройке.
  getMode() {
    if ((activeCore || pickCore()) === singboxCore && singboxCore.getMode()) return singboxCore.getMode()
    return settingsManager.get('tunMode') !== false ? 'tun' : 'proxy'
  },
  isKillSwitchEngaged() {
    return (activeCore || pickCore()) === singboxCore && singboxCore.isKillSwitchEngaged()
  },
  setKillSwitch(enabled) {
    legacyCore.setKillSwitch(enabled)
    singboxCore.setKillSwitch(enabled)
  },
  clearProxy() {
    singboxCore.clearProxy()
    if (activeCore === legacyCore) legacyCore.clearProxy()
  },
  // Запрос приложения не прошёл при «подключено» — проверить, жив ли туннель.
  checkTunnel() {
    if (activeCore === singboxCore && singboxCore.getStatus() === 'connected') {
      singboxCore.checkTunnel().catch(e => console.warn('[VPN] Проверка туннеля:', e.message))
    }
  },
}

// Служебные хосты приложения (API, ссылки подписки и тест-доступа) — в обход
// туннеля: обновить подписку и оплатить можно, даже если туннель не работает.
function serviceHosts(subs) {
  const hosts = new Set()
  const add = u => { try { hosts.add(new URL(u).hostname) } catch {} }
  add(apiClient.API_BASE)
  add(TRIAL_URL)
  for (const s of subs || []) if (s.managed || s.isTrial) add(s.url)
  return [...hosts]
}

// ─── Сессия VPN: таймер, статистика, «что видят сайты» ───────────────────────
// Все события vpn:status-update идут через sendVpnStatus: он ведёт начало сессии
// (connectedAt — для таймера на главной), запускает и останавливает статистику
// ядра (скорость, пинг, итоги дня) и обновляет «что видят сайты».

const vpnStats = createStats({
  load: () => settingsManager.get('trafficDaily'),
  save: daily => settingsManager.set('trafficDaily', daily),
})
let vpnConnectedAt = null
let statsStopStream = null
let statsPingTimer = null
let statsPingKick = null

function startSessionStats(at) {
  stopSessionStats()
  const live = activeCore === singboxCore // у запасного ядра xray нет clash_api
  vpnStats.start(at, { live })
  if (!live) return
  statsStopStream = singboxCore.trafficStream((up, down) => vpnStats.addTraffic(up, down))
  const ping = async () => {
    const ms = await singboxCore.pingDelay().catch(() => null)
    if (vpnConnectedAt) vpnStats.addPing(ms)
  }
  statsPingKick = setTimeout(ping, 3000)
  statsPingTimer = setInterval(ping, 60_000)
}

function stopSessionStats() {
  statsStopStream?.()
  statsStopStream = null
  clearTimeout(statsPingKick)
  clearInterval(statsPingTimer)
  statsPingKick = null
  statsPingTimer = null
  vpnStats.stop()
}

function sendVpnStatus(data) {
  const status = data?.status
  if (status === 'connected') {
    if (!vpnConnectedAt) {
      vpnConnectedAt = Date.now()
      startSessionStats(vpnConnectedAt)
    }
    scheduleExposure('connected')
  } else if (status !== 'reconnecting') {
    // отключено, kill switch или новое подключение — сессия закончилась
    if (vpnConnectedAt) {
      vpnConnectedAt = null
      stopSessionStats()
    }
    if (status === 'disconnected') scheduleExposure('disconnected')
  }
  sendToWindow('vpn:status-update', { ...data, connectedAt: vpnConnectedAt })
}

// «Что видят сайты» для плиток главной: после подключения — облегчённая
// «Проверка соединения» через VPN (IPv6, DNS, страна), при выключенном VPN —
// настоящий IP напрямую. Результат хранится в памяти и уходит в окно.
let lastExposure = null
let exposureTimer = null
let exposureRunning = null
let manualCheckRunning = null // ручная «Проверка соединения» — та же сессия, не пересекаемся

function scheduleExposure(expected, delay) {
  clearTimeout(exposureTimer)
  exposureTimer = setTimeout(() => {
    exposureTimer = null
    refreshExposure(expected).catch(e => console.warn('[Check] Фоновая проверка:', e.message))
  }, delay ?? (expected === 'connected' ? 2500 : 1500))
}

async function directCheck() {
  const ses = session.fromPartition('lipton-connection-check')
  await ses.setProxy({ mode: 'direct' })
  await ses.closeAllConnections()
  return connectionCheck.runDirectCheck({
    fetchText: async (url, timeoutMs) => {
      const res = await ses.fetch(url, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(timeoutMs) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.text()).slice(0, 4096)
    },
  })
}

function rememberExposure(result, status) {
  lastExposure = { ...result, status, serverId: settingsManager.get('activeServerId'), at: Date.now() }
  sendToWindow('vpn:check-result', lastExposure)
  return lastExposure
}

async function refreshExposure(expected) {
  if (exposureRunning) return exposureRunning
  const status = vpnManager.getStatus()
  if (expected && status !== expected) return null
  if (status !== 'connected' && (status !== 'disconnected' || vpnManager.isKillSwitchEngaged())) return null
  // IP без VPN не меняется часто — не дёргаем сеть на каждое «отключено» (повторы автоподключения)
  if (status === 'disconnected' && lastExposure?.status === 'disconnected' && Date.now() - lastExposure.at < 60_000) return lastExposure
  exposureRunning = (async () => {
    if (manualCheckRunning) await manualCheckRunning.catch(() => {})
    const result = status === 'connected' ? await runConnectionCheck() : await directCheck()
    // пока шла проверка, статус сменился — результат уже не про текущее состояние
    if (vpnManager.getStatus() !== status) return null
    return rememberExposure(result, status)
  })().finally(() => { exposureRunning = null })
  return exposureRunning
}

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

// ─── Tray icon ────────────────────────────────────────────────────────────────
// Фирменный знак в цвете состояния: 16 px и 32 px (для экранов с масштабом 200%).

const _trayIcons = {}
function getTrayIcon(status) {
  const key = status === 'connected' || status === 'kill-switch' ? status : 'disconnected'
  if (_trayIcons[key]) return _trayIcons[key]
  try {
    const img = nativeImage.createFromBuffer(makeLogoPng(16, key), { scaleFactor: 1 })
    img.addRepresentation({ scaleFactor: 2, buffer: makeLogoPng(32, key) })
    _trayIcons[key] = img
  } catch {
    _trayIcons[key] = nativeImage.createEmpty()
  }
  return _trayIcons[key]
}

// ─── Window ──────────────────────────────────────────────────────────────────

// Тема: 'dark' | 'light' | 'system'. Системную отслеживает nativeTheme.
function effectiveTheme() {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

function applyTheme(theme) {
  nativeTheme.themeSource = windowState.normalizeTheme(theme)
}

function themeState() {
  return { theme: windowState.normalizeTheme(settingsManager.get('theme')), effective: effectiveTheme() }
}

function sendToWindow(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data)
}

function createWindow() {
  const workAreas = screen.getAllDisplays().map(d => d.workArea)
  const bounds = windowState.sanitizeBounds(settingsManager.get('windowBounds'), workAreas)

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    ...(bounds.x !== undefined ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: windowState.MIN_SIZE.width,
    minHeight: windowState.MIN_SIZE.height,
    frame: false,
    transparent: false,
    backgroundColor: windowState.themeBackground(effectiveTheme()),
    resizable: true,
    maximizable: true,
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
    if (bounds.maximized) mainWindow.maximize()
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.on('close', (e) => {
    e.preventDefault()
    saveWindowBounds()
    mainWindow.hide()
  })

  // Кнопка «Развернуть» в заголовке меняет иконку по состоянию окна.
  mainWindow.on('maximize', () => { sendToWindow('win:maximized', true); scheduleSaveBounds() })
  mainWindow.on('unmaximize', () => { sendToWindow('win:maximized', false); scheduleSaveBounds() })
  mainWindow.on('resize', scheduleSaveBounds)
  mainWindow.on('move', scheduleSaveBounds)

  // Окно скрыто в трей или свёрнуто — renderer ставит анимации на паузу.
  const sendVisibility = () => sendToWindow('win:visibility', mainWindow.isVisible() && !mainWindow.isMinimized())
  mainWindow.on('show', sendVisibility)
  mainWindow.on('hide', sendVisibility)
  mainWindow.on('minimize', sendVisibility)
  mainWindow.on('restore', sendVisibility)
}

// Размер и положение окна запоминаем с задержкой (resize/move сыплются пачками).
let saveBoundsTimer = null
function scheduleSaveBounds() {
  clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(saveWindowBounds, 600)
}
function saveWindowBounds() {
  clearTimeout(saveBoundsTimer)
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return
  try {
    const next = windowState.boundsToSave(mainWindow.getNormalBounds(), mainWindow.isMaximized())
    const prev = settingsManager.get('windowBounds')
    if (JSON.stringify(prev) !== JSON.stringify(next)) settingsManager.set('windowBounds', next)
  } catch (e) {
    console.warn('[Window] Не удалось сохранить размер окна:', e.message)
  }
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

const TRAY_LABEL = {
  connected: 'Подключено',
  disconnected: 'Отключено',
  'kill-switch': 'Kill Switch — интернет заблокирован',
}

function refreshTray(status) {
  if (!tray) return
  const label = TRAY_LABEL[status] || TRAY_LABEL.disconnected
  tray.setImage(getTrayIcon(status))
  tray.setToolTip(`Lipton VPN — ${label}`)
  const menu = Menu.buildFromTemplate([
    { label: `${status === 'connected' ? '●' : '○'} ${label}`, enabled: false },
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
  const url = view?.subscription_url
  // Убираем и managed, и гостевой пробный доступ: после входа в аккаунт он больше
  // не нужен (иначе «висит» рядом с реальной подпиской). «15 минут бесплатно»
  // вошедшего оставляем, пока у аккаунта нет своей ссылки.
  const others = guestTrial.keepOnSync(settings.subscriptions, !!url)

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
      // «временный тариф» (overlay): { tariff_title, until, revert_tariff_title } или null
      overlay: view.overlay || null,
    }
    const subs = [managed, ...others]
    settingsManager.set('subscriptions', subs)
    mainWindow?.webContents.send('sub:updated', subs)
    mainWindow?.webContents.send('account:subscription', view)
    return { success: true, hasAccess: true, view }
  } catch (e) {
    console.error('[Sync] fetch subscription_url:', e.message)
    if (!e.status) vpnManager.checkTunnel()
    return { success: false, error: e.message }
  }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

function setupIPC() {
  // App
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:minimize', () => mainWindow?.minimize())
  ipcMain.handle('app:close', () => { saveWindowBounds(); mainWindow?.hide() }) // крестик — прячем в трей
  ipcMain.handle('app:maximize', () => {
    if (mainWindow && !mainWindow.isMaximized()) mainWindow.maximize()
    return !!mainWindow?.isMaximized()
  })
  ipcMain.handle('app:unmaximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    return !!mainWindow?.isMaximized()
  })
  ipcMain.handle('app:toggle-maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('app:is-maximized', () => !!mainWindow?.isMaximized())
  ipcMain.handle('win:is-visible', () => !!mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized())

  // Тема интерфейса: dark | light | system
  ipcMain.handle('settings:get-theme', () => themeState())
  ipcMain.handle('settings:set-theme', (_, theme) => {
    const t = windowState.normalizeTheme(theme)
    settingsManager.set('theme', t)
    applyTheme(t) // nativeTheme 'updated' сам разошлёт новое состояние
    console.log(`[Settings] Тема: ${t}`)
    return themeState()
  })
  ipcMain.handle('app:open-external', (_, url) => shell.openExternal(url))
  // Текст лицензии стороннего компонента, который лежит рядом с ним в resources.
  ipcMain.handle('app:license-text', (_, name) => {
    try {
      if (name !== 'sing-box') return ''
      return fs.readFileSync(path.join(path.dirname(singboxCore.findSingbox()), 'LICENSE'), 'utf-8')
    } catch {
      return ''
    }
  })

  // Статьи и гайды — открываем внутри приложения (отдельное окно Electron),
  // а не во внешнем браузере. Блог отдаёт X-Frame-Options, поэтому не iframe, а
  // полноценное дочернее окно в бренд-стиле.
  let articlesWin = null
  ipcMain.handle('articles:open', (_, slug) => {
    const base = process.env.LIPTON_API_BASE || 'https://liptonone.online'
    const page = base + '/blog' + (typeof slug === 'string' && /^[a-z0-9-]{1,120}$/i.test(slug) ? '/' + slug : '')
    if (articlesWin && !articlesWin.isDestroyed()) {
      if (slug) articlesWin.loadURL(page)
      articlesWin.focus()
      return
    }
    articlesWin = new BrowserWindow({
      width: 1040, height: 760, minWidth: 720, minHeight: 520,
      title: 'Lipton VPN — Статьи и гайды',
      autoHideMenuBar: true, backgroundColor: '#07100c',
      parent: mainWindow || undefined,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    })
    articlesWin.loadURL(page)
    // Внешние ссылки (t.me и пр.) — в системный браузер, чтобы окно оставалось блогом.
    articlesWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
    articlesWin.on('closed', () => { articlesWin = null })
  })

  // Открыть бота в Telegram. НАДЁЖНО: сразу открываем https-ссылку t.me — она
  // работает всегда (браузер сам предложит открыть в приложении Telegram, если
  // оно установлено). tg:// на Windows часто «молча» не открывается, если
  // протокол не зарегистрирован, поэтому его не используем. Логин всё равно
  // завершится авто-поллингом, как только пользователь нажмёт Start.
  ipcMain.handle('app:open-telegram', async (_, link) => {
    const url = String(link || '')
    if (!/^https?:\/\//.test(url)) return { success: false, error: 'bad link' }
    try {
      await shell.openExternal(url)
      console.log('[TG] opened:', url)
      return { success: true, via: 'web' }
    } catch (e) {
      console.error('[TG] open failed:', e.message)
      return { success: false, error: e.message }
    }
  })

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
      sendVpnStatus({ status: 'disconnected', serverId: null })
    }
    console.log(`[Settings] Kill Switch: ${enabled ? 'вкл' : 'выкл'}`)
  })

  ipcMain.handle('settings:get-auto-connect', () => settingsManager.get('autoConnect') === true)
  ipcMain.handle('settings:set-auto-connect', (_, enabled) => {
    settingsManager.set('autoConnect', enabled)
    console.log(`[Settings] Автоподключение: ${enabled ? 'вкл' : 'выкл'}`)
  })

  ipcMain.handle('settings:get-tun-mode', () => settingsManager.get('tunMode') !== false)
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
          `powershell -NoProfile -NonInteractive -Command "Get-NetAdapter | Where-Object {$_.Status -eq 'Up' -and $_.Name -ne 'LiptonVPN' -and $_.Name -ne 'LiptonTUN'} | Select-Object -ExpandProperty Name"`,
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
      sendVpnStatus({ status: 'disconnected' })

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
          `powershell -NoProfile -NonInteractive -Command "Get-NetAdapter | Where-Object {$_.Status -eq 'Up' -and $_.Name -ne 'LiptonVPN' -and $_.Name -ne 'LiptonTUN'} | Select-Object -ExpandProperty Name"`,
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

  // Даты добавления — рядом, в bypassDomainsAddedAt (сам список — строки, как раньше).
  ipcMain.handle('settings:get-bypass-domains-meta', () => ({
    items: bypassDomains.withDates(settingsManager.get('bypassDomains'), settingsManager.get('bypassDomainsAddedAt')),
    limit: bypassDomains.MAX_DOMAINS,
  }))

  ipcMain.handle('settings:add-bypass-domain', (_, domain) => {
    const r = bypassDomains.addDomain(settingsManager.get('bypassDomains'), settingsManager.get('bypassDomainsAddedAt'), domain)
    if (!r.success) return { success: false, error: r.error }
    settingsManager.set('bypassDomains', r.domains)
    settingsManager.set('bypassDomainsAddedAt', r.meta)
    console.log(`[Bypass] Добавлен домен: ${r.domain}`)
    return { success: true, domains: r.domains, items: bypassDomains.withDates(r.domains, r.meta) }
  })

  ipcMain.handle('settings:remove-bypass-domain', (_, domain) => {
    const r = bypassDomains.removeDomain(settingsManager.get('bypassDomains'), settingsManager.get('bypassDomainsAddedAt'), domain)
    settingsManager.set('bypassDomains', r.domains)
    settingsManager.set('bypassDomainsAddedAt', r.meta)
    console.log(`[Bypass] Удалён домен: ${domain}`)
    return { success: true, domains: r.domains, items: bypassDomains.withDates(r.domains, r.meta) }
  })

  ipcMain.handle('settings:reset-profile', async () => {
    try {
      console.log('[Settings] Сброс прокси Windows...')
      await vpnManager.disconnect()
      settingsManager.set('activeServerId', null)
      refreshTray('disconnected')
      sendVpnStatus({ status: 'disconnected' })
      console.log('[Settings] Прокси Windows сброшен')
      return { success: true }
    } catch (err) {
      console.error('[Settings] Ошибка сброса:', err.message)
      return { success: false, error: err.message }
    }
  })

  // VPN
  ipcMain.handle('vpn:status', () => ({
    status: vpnManager.isKillSwitchEngaged() ? 'kill-switch' : vpnManager.getStatus(),
    serverId: settingsManager.get('activeServerId'),
    connectedAt: vpnConnectedAt,
  }))

  // Статистика для главной: таймер, скорость, байты сессии, пинг, итоги дня и недели.
  ipcMain.handle('vpn:stats', () => vpnStats.snapshot())

  // Последний результат «что видят сайты» (полная проверка через VPN или IP без VPN).
  // Нет результата или он про другое состояние — запускаем фоновую проверку.
  ipcMain.handle('vpn:last-check', () => {
    const status = vpnManager.getStatus()
    const stale = !lastExposure || lastExposure.status !== status ||
      (status === 'disconnected' && Date.now() - lastExposure.at > 10 * 60_000)
    if (stale && !exposureTimer && !exposureRunning) scheduleExposure(status, 300)
    return lastExposure && lastExposure.status === status ? lastExposure : null
  })

  ipcMain.handle('vpn:connect', async (_, serverId) => {
    cancelAutoConnectRetry()
    try {
      const settings = settingsManager.getAll()
      let server = null
      for (const sub of (settings.subscriptions || [])) {
        server = (sub.servers || []).find(s => s.id === serverId)
        if (server) break
      }
      if (!server) return { success: false, error: 'Сервер не найден' }

      const result = await vpnManager.connect(server, buildConnectOptions(settings))

      if (result.success) {
        settingsManager.set('activeServerId', serverId)
        refreshTray('connected')
        sendVpnStatus({ status: 'connected', serverId })
      } else {
        console.error('[VPN:Connect] Подключение не удалось:', result.error || '(нет деталей)')
        if (!result.keptPrevious && vpnManager.getStatus() === 'disconnected') refreshTray('disconnected')
      }
      return result
    } catch (err) {
      console.error('[VPN:Connect] Исключение:', err.message)
      return { success: false, error: err.message }
    }
  })

  // Проверка соединения: что видят сайты через VPN. Запросы идут тем же путём,
  // что и обычный трафик; результаты остаются на ПК (никуда не отправляются).
  let checkRunning = null
  ipcMain.handle('vpn:check-connection', () => {
    if (!checkRunning) {
      const status = vpnManager.getStatus()
      // фоновая проверка после подключения идёт той же сессией — дождёмся её,
      // иначе одна сбросит соединения другой
      checkRunning = Promise.resolve(exposureRunning).catch(() => {})
        .then(() => runConnectionCheck())
        .then(r => {
          // ручная проверка обновляет и плитки главной
          if (status === 'connected' && vpnManager.getStatus() === 'connected' && r.items?.length) rememberExposure(r, status)
          return r
        })
        .finally(() => { checkRunning = null; manualCheckRunning = null })
      manualCheckRunning = checkRunning
    }
    return checkRunning
  })

  ipcMain.handle('vpn:disconnect', async () => {
    try {
      await vpnManager.disconnect()
      settingsManager.set('activeServerId', null)
      refreshTray('disconnected')
      sendVpnStatus({ status: 'disconnected' })
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
      endGuestSession()
      const sync = await syncSubscription()
      return { success: true, sync }
    } catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('auth:tg-init', async () => {
    try { const r = await apiClient.tgInit(); return { success: true, ...r } }
    catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('auth:tg-poll', async (_, linkToken) => {
    try {
      const r = await apiClient.tgPoll(linkToken)
      if (r.done) { endGuestSession(); const sync = await syncSubscription(); return { success: true, done: true, sync } }
      return { success: true, done: false }
    } catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('auth:tg-verify', async (_, { linkToken, code }) => {
    try {
      await apiClient.tgVerify(linkToken, code)
      endGuestSession()
      const sync = await syncSubscription()
      return { success: true, sync }
    } catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('auth:device-exchange', async (_, code) => {
    try {
      await apiClient.deviceExchange(code)
      endGuestSession()
      const sync = await syncSubscription()
      return { success: true, sync }
    } catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('auth:logout', async () => {
    try { await vpnManager.disconnect() } catch {}
    settingsManager.set('activeServerId', null)
    settingsManager.set('subscriptions', [])
    await apiClient.logout()
    endGuestSession()
    refreshTray('disconnected')
    sendVpnStatus({ status: 'disconnected' })
    mainWindow?.webContents.send('sub:updated', [])
    return { success: true }
  })

  ipcMain.handle('account:sync', () => syncSubscription())

  ipcMain.handle('account:profile', async () => {
    try { return { success: true, profile: await apiClient.getProfile() } }
    catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('account:transactions', async () => {
    try { return { success: true, ...(await apiClient.getTransactions()) } }
    catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('account:config', async () => {
    try { return { success: true, config: await apiClient.getConfig() } }
    catch (e) { return { success: false, error: e.message } }
  })
  // Отвязка карты. После новой привязки сервер 24 ч отвечает 409
  // card_unlink_cooldown с available_at — отдаём их окну.
  ipcMain.handle('account:delete-card', async () => {
    try { await apiClient.deleteCard(); return { success: true } }
    catch (e) {
      return {
        success: false, error: e.message, httpStatus: e.status, code: e.code,
        availableAt: e.data?.available_at || e.data?.error?.available_at || null,
      }
    }
  })

  // Устройства на подписке: список, отвязка одного и всех.
  ipcMain.handle('account:devices', async () => {
    try { return { success: true, hwid: subscriptionManager.getHwid(), ...(await apiClient.getDevices()) } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })
  ipcMain.handle('account:revoke-device', async (_, hwid) => {
    try { await apiClient.revokeDevice(String(hwid || '')); return { success: true } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })
  ipcMain.handle('account:revoke-all-devices', async () => {
    try { await apiClient.revokeAllDevices(); return { success: true } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })

  // «Обновить ссылку»: старая ссылка и все устройства на ней отключатся. После —
  // свежая подписка и, если VPN был включён, переподключение к тому же серверу.
  ipcMain.handle('account:relink', async (_, expectedVersion) => {
    const prevRemark = activeServerRemark()
    try {
      const view = await apiClient.relink(expectedVersion)
      const sync = await syncSubscription()
      reconnectAfterRelink(prevRemark).catch(e => console.error('[Relink] Переподключение:', e.message))
      console.log('[Relink] Ссылка подписки обновлена')
      return { success: true, view: sync?.view || view }
    } catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })

  // Способы входа (почта, Telegram) и отвязка одного из них.
  ipcMain.handle('account:identities', async () => {
    try { return { success: true, ...(await apiClient.getIdentities()) } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })
  ipcMain.handle('account:unlink-identity', async (_, id) => {
    try { await apiClient.deleteIdentity(id); return { success: true } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })

  // Отмена подписки: сразу, без возврата; затем подтягиваем новое состояние.
  ipcMain.handle('account:cancel-subscription', async () => {
    try {
      const res = await apiClient.cancelSubscription()
      console.log('[Account] Подписка отменена')
      syncSubscription().catch(() => {})
      return { success: true, ...res }
    } catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })

  // Статус серверов (публичный) — полоса «Статус серверов» в Новостях.
  ipcMain.handle('status:servers', async () => {
    try { return { success: true, ...(await apiClient.getServerStatus()) } }
    catch (e) { return { success: false, error: e.message } }
  })

  // Прочитанные новости — локально, только на этом компьютере.
  ipcMain.handle('news:get-read', () => {
    const ids = settingsManager.get('newsReadIds')
    return Array.isArray(ids) ? ids : []
  })
  ipcMain.handle('news:set-read', (_, ids) => {
    const list = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean).slice(-300)
    settingsManager.set('newsReadIds', list)
    return list
  })

  // Уведомления о подписке на рабочем столе (по умолчанию включены).
  ipcMain.handle('settings:get-notifications', () => settingsManager.get('notifications') !== false)
  ipcMain.handle('settings:set-notifications', (_, enabled) => {
    settingsManager.set('notifications', !!enabled)
    console.log(`[Settings] Уведомления: ${enabled ? 'вкл' : 'выкл'}`)
    return !!enabled
  })

  // Пробный доступ без аккаунта — 15 минут раз в день (экран «15 минут без
  // регистрации»). Прежний вызов тест-доступа ведёт туда же.
  ipcMain.handle('trial:test-access', () => startGuestTrial())
  ipcMain.handle('guest:state', () => guestState())
  ipcMain.handle('guest:start', () => startGuestTrial())
  ipcMain.handle('guest:leave', () => { endGuestSession(); return guestState() })

  // «15 минут бесплатно» для вошедших без подписки (раз в день, решает сервер).
  ipcMain.handle('trial:daily-state', () => ({ retryAt: Number(settingsManager.get('dailyTrialRetryAt')) || null }))
  ipcMain.handle('trial:daily', () => startDailyTrial())

  // Баннеры и экраны из админки (таргетинг по платформе, версии и аудитории).
  // Закрытые пользователем id помним локально.
  ipcMain.handle('banners:get', async () => {
    const dismissed = (settingsManager.get('bannersDismissed') || []).map(String)
    try {
      const r = await apiClient.getBanners(app.getVersion())
      return { success: true, banners: Array.isArray(r?.banners) ? r.banners : [], dismissed }
    } catch (e) {
      return { success: false, error: e.message, httpStatus: e.status, banners: [], dismissed }
    }
  })
  ipcMain.handle('banners:dismiss', (_, id) => {
    const key = String(id ?? '')
    const list = (settingsManager.get('bannersDismissed') || []).map(String).filter(x => x && x !== key)
    if (key) list.push(key)
    const next = list.slice(-200)
    settingsManager.set('bannersDismissed', next)
    return next
  })

  // Уведомления аккаунта: напоминания об оплате, новости, сообщения в Telegram.
  ipcMain.handle('account:notifications', async () => {
    try { return { success: true, prefs: await apiClient.getNotifications() } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })
  ipcMain.handle('account:set-notifications', async (_, prefs) => {
    const p = prefs || {}
    const body = { payment_reminders: !!p.payment_reminders, news: !!p.news, telegram_messages: !!p.telegram_messages }
    try {
      const r = await apiClient.setNotifications(body)
      return { success: true, prefs: r && typeof r === 'object' && 'news' in r ? r : body }
    } catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })

  // Смена (или привязка) почты: код на новый адрес → подтверждение.
  ipcMain.handle('account:email-request', async (_, email) => {
    try { await apiClient.emailChangeRequest(String(email || '').trim().toLowerCase()); return { success: true } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })
  ipcMain.handle('account:email-change', async (_, { email, code } = {}) => {
    try {
      const r = await apiClient.emailChange(String(email || '').trim().toLowerCase(), String(code || '').trim())
      // адрес был у другого аккаунта — сервер объединил их и выдал новые токены
      const merged = !!r?.access_token
      if (merged) syncSubscription().catch(() => {})
      console.log(`[Account] Почта изменена${merged ? ' (аккаунты объединены)' : ''}`)
      return { success: true, merged }
    } catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })

  // Промокод: проверяем и запоминаем — применится при следующей оплате.
  ipcMain.handle('promo:validate', async (_, code) => {
    const c = String(code || '').trim()
    if (!c) return { success: false, error: 'Введите промокод' }
    try {
      const r = await apiClient.promoValidate(c)
      if (!r?.valid) return { success: true, valid: false, reason: r?.reason || 'Промокод не подходит' }
      const promo = {
        code: c.toUpperCase(), kind: r.kind || null,
        percent_off: r.percent_off ?? null, bonus_days: r.bonus_days ?? null, at: Date.now(),
      }
      settingsManager.set('pendingPromo', promo)
      return { success: true, valid: true, promo }
    } catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })
  ipcMain.handle('promo:pending', () => settingsManager.get('pendingPromo') || null)
  ipcMain.handle('promo:clear', () => { settingsManager.set('pendingPromo', null); return true })

  // Чат поддержки: «Помогло / Не помогло» и «Позвать оператора».
  ipcMain.handle('ai:feedback', async (_, { messageId, helpful } = {}) => {
    try { await apiClient.supportFeedback(messageId, helpful); return { success: true } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })
  ipcMain.handle('ai:operator', async (_, dialogId) => {
    try { return { success: true, ...(await apiClient.supportOperator(dialogId)) } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })

  // База знаний: статьи блога (/content/articles), запасной вариант — /faq.
  ipcMain.handle('content:articles', async (_, category) => {
    try {
      const r = await apiClient.getArticles(category)
      const items = Array.isArray(r) ? r : (r?.articles || r?.items || [])
      return { success: true, items }
    } catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })
  ipcMain.handle('content:article', async (_, slug) => {
    try { return { success: true, article: await apiClient.getArticle(slug) } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })
  ipcMain.handle('content:faq', async () => {
    try { const r = await apiClient.getFaq(); return { success: true, items: Array.isArray(r?.items) ? r.items : [] } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })

  // Оплата: тарифы из /config, checkout → confirmation_url открываем в браузере
  ipcMain.handle('payment:checkout', async (_, opts) => {
    try {
      const res = await apiClient.checkout(opts || {})
      if (res?.confirmation_url) shell.openExternal(res.confirmation_url)
      return { success: true, ...res }
    } catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })
  ipcMain.handle('payment:status', async (_, txId) => {
    try { return { success: true, ...(await apiClient.paymentStatus(txId)) } }
    catch (e) { return { success: false, error: e.message } }
  })

  // Смена тарифа: варианты → предпросмотр → подтверждение. payment_url (СБП или
  // 3DS карты) открываем в браузере, как обычную оплату.
  ipcMain.handle('account:subscription-view', async () => {
    try { return { success: true, view: await apiClient.getSubscription() } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })
  ipcMain.handle('tariff:options', async () => {
    try { return { success: true, ...(await apiClient.changeOptions()) } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })
  ipcMain.handle('tariff:preview', async (_, opts) => {
    try { return { success: true, option: await apiClient.changePreview(opts || {}) } }
    catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })
  ipcMain.handle('tariff:change', async (_, opts) => {
    try {
      const res = await apiClient.changeTariff(opts || {})
      if (res?.status === 'payment_required' && /^https:\/\//i.test(res.payment_url || '')) shell.openExternal(res.payment_url)
      return { success: true, ...res }
    } catch (e) { return { success: false, error: e.message, httpStatus: e.status } }
  })

  // Support (чат с поддержкой; логи приложения цепляются при создании тикета)
  ipcMain.handle('support:get', async () => {
    try { return { success: true, ...(await apiClient.supportGet()) } }
    catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('support:send', async (_, body) => {
    try {
      // создаём тикет с логами (если ещё нет открытого), затем шлём сообщение
      const logs = (logger.getLogs() || []).slice(-200)
      await apiClient.supportCreate(
        { app: 'windows', version: app.getVersion(), os: require('os').release() },
        logs,
      )
      await apiClient.supportSend(body)
      return { success: true }
    } catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('news:get', async () => {
    try { return { success: true, ...(await apiClient.getNews()) } }
    catch (e) { return { success: false, error: e.message } }
  })

  // Единый чат поддержки (тот же AI-диалог, что и на сайте)
  ipcMain.handle('ai:dialog', async () => {
    try { return { success: true, ...(await apiClient.getAiDialog()) } }
    catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('ai:send', async (_, message) => {
    try { return { success: true, ...(await apiClient.aiChat(message)) } }
    catch (e) { return { success: false, error: e.message } }
  })
  // Логи приложения → в чат поддержки (ИИ/оператор видят полную расшифровку)
  ipcMain.handle('ai:logs', async () => {
    try {
      const logs = (logger.getLogs() || []).slice(-400).join('\n')
      if (!logs.trim()) return { success: false, error: 'Логи пусты — подключитесь к VPN и повторите' }
      const note = `Windows ${require('os').release()}, app ${app.getVersion()}`
      return { success: true, ...(await apiClient.sendLogs(logs, note)) }
    } catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('support:attach-logs', async () => {
    try {
      const logs = (logger.getLogs() || []).slice(-300)
      await apiClient.supportCreate(
        { app: 'windows', version: app.getVersion(), os: require('os').release(), manual_logs: true },
        logs,
      )
      return { success: true }
    } catch (e) { return { success: false, error: e.message } }
  })

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
          sendVpnStatus({ status: 'disconnected' })
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

      // В TUN прямое соединение из приложения попадает в туннель — меряем через ядро.
      const viaCore = activeCore === singboxCore && singboxCore.getStatus() === 'connected' && singboxCore.getMode() === 'tun'
        ? list => singboxCore.serverDelays(list.map(s => s.id))
        : null
      const result = await subscriptionManager.pingAll(sub, settings.subscriptions || [], viaCore)
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

// ─── «Обновить ссылку»: переподключение ──────────────────────────────────────

function activeServerRemark() {
  const settings = settingsManager.getAll()
  const id = settings.activeServerId
  for (const sub of settings.subscriptions || []) {
    const s = (sub.servers || []).find(x => x.id === id)
    if (s) return s.remark
  }
  return null
}

// Старая ссылка отозвана — прежний туннель больше не пустят. Если VPN был
// включён, подключаемся заново к серверу с тем же названием (или к первому).
async function reconnectAfterRelink(prevRemark) {
  const status = vpnManager.getStatus()
  if (status !== 'connected' && status !== 'reconnecting') return
  const settings = settingsManager.getAll()
  const servers = (settings.subscriptions || []).flatMap(s => s.servers || [])
  const server = servers.find(s => s.remark === prevRemark) || servers[0]
  if (!server) {
    await vpnManager.disconnect()
    settingsManager.set('activeServerId', null)
    refreshTray('disconnected')
    sendVpnStatus({ status: 'disconnected', serverId: null })
    return
  }
  sendVpnStatus({ status: 'connecting', serverId: server.id })
  const r = await vpnManager.connect(server, buildConnectOptions(settings))
  if (r.success) {
    settingsManager.set('activeServerId', server.id)
    refreshTray('connected')
    sendVpnStatus({ status: 'connected', serverId: server.id })
  } else if (vpnManager.getStatus() === 'disconnected') {
    const ks = vpnManager.isKillSwitchEngaged()
    refreshTray(ks ? 'kill-switch' : 'disconnected')
    sendVpnStatus({ status: ks ? 'kill-switch' : 'disconnected', serverId: null })
  }
}

// ─── Trial subscription ───────────────────────────────────────────────────────

const TRIAL_URL = 'https://sub.popokole.online/NcvZvQsDXeQ1TJZu'
const TRIAL_DURATION = 60 * 60 * 1000
const DAILY_TRIAL_DURATION = 15 * 60 * 1000
// Прежний тест-доступ по общей ссылке (если на сервере гостевой доступ выключен):
// столько же, сколько гостевой, — по умолчанию 15 минут.
const TEST_ACCESS_DURATION = guestTrial.DEFAULT_MINUTES * 60 * 1000

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

// Пробный доступ закончился: убираем его подписку и, если VPN шёл через неё,
// отключаемся. Подписку аккаунта (managed) не трогаем — она живёт по account:sync.
function checkTrialExpiry() {
  const settings = settingsManager.getAll()
  const { kept, expired } = guestTrial.splitExpiredTrials(settings.subscriptions, Date.now())
  if (expired.length) {
    settingsManager.set('subscriptions', kept)
    const wasActive = expired.some(t => (t.servers || []).some(s => s.id === settings.activeServerId))
    if (wasActive) {
      vpnManager.disconnect()
      settingsManager.set('activeServerId', null)
      refreshTray('disconnected')
      sendVpnStatus({ status: 'disconnected' })
    }
    mainWindow?.webContents.send('sub:updated', kept)
    console.log('[Trial] Пробный доступ закончился')
  }
  scheduleTrialExpiry()
}

// Точный таймер на конец пробного доступа (раз в 30 с — запасная проверка).
let trialExpiryTimer = null
function scheduleTrialExpiry() {
  clearTimeout(trialExpiryTimer)
  trialExpiryTimer = null
  const next = guestTrial.nextTrialExpiry(settingsManager.get('subscriptions'), Date.now())
  if (next) trialExpiryTimer = setTimeout(checkTrialExpiry, Math.min(Math.max(next - Date.now() + 300, 500), 0x7fffffff))
}

// ─── Гостевой доступ и «15 минут бесплатно» ───────────────────────────────────

function guestState() {
  return guestTrial.normalizeGuest(settingsManager.get('guest'))
}

function saveGuest(patch) {
  const next = { ...guestState(), ...patch }
  settingsManager.set('guest', next)
  sendToWindow('guest:updated', next)
  return next
}

// Вошли в аккаунт или вышли — гостевой режим закончился (retryAt помним).
function endGuestSession() {
  if (guestState().session) saveGuest({ session: false })
}

// Пробная подписка — одна: новая заменяет прежнюю пробную (не подписку аккаунта).
function putTrialSub(sub) {
  const subs = (settingsManager.get('subscriptions') || []).filter(s => !(s.isTrial && !s.managed))
  const next = [sub, ...subs]
  settingsManager.set('subscriptions', next)
  sendToWindow('sub:updated', next)
  scheduleTrialExpiry()
  return next
}

// Гость: если сервер выдаёт гостевой доступ (/config.guest_trial.enabled) —
// POST /guest/trial с HWID приложения; иначе (или ручки ещё нет) — прежний
// тест-доступ по общей ссылке. В обоих случаях — раз в сутки.
async function startGuestTrial() {
  const now = Date.now()
  let cfg = null
  try { cfg = await apiClient.getConfig() } catch {}
  const minutes = guestTrial.guestMinutes(cfg)

  if (guestTrial.serverGuestEnabled(cfg)) {
    try {
      const r = await apiClient.guestTrial({ deviceId: subscriptionManager.getHwid(), version: app.getVersion() })
      const url = r?.subscription_url
      if (!url) throw new Error('Сервер не выдал ссылку пробного доступа')
      const { servers, userInfo } = await subscriptionManager.fetchAndParse(url)
      const expiresAt = guestTrial.expiryFromResponse(r, now, minutes)
      putTrialSub(guestTrial.buildTrialSub({ kind: 'guest', url, servers, userInfo, expiresAt, now }))
      const guest = saveGuest({
        session: true, startedAt: now, expiresAt, retryAt: now + guestTrial.DAY,
        source: 'server', serverName: String(r.server_name || ''), minutes,
      })
      console.log(`[Guest] Пробный доступ на ${minutes} мин (сервер)`)
      return { success: true, guest }
    } catch (e) {
      if (e.status === 429 || e.code === 'guest_trial_used') {
        const retryAt = guestTrial.retryFromResponse(e.data, now)
        return { success: false, code: 'guest_trial_used', retryAt, guest: saveGuest({ retryAt }) }
      }
      // Выключено на сервере или ручки ещё нет — прежний тест-доступ. Другие
      // ошибки (сеть, ссылка) показываем как есть.
      if (![403, 404, 405, 501].includes(e.status)) {
        console.error('[Guest] Пробный доступ:', e.message)
        return { success: false, error: e.message || 'Не удалось включить пробный доступ' }
      }
      console.warn(`[Guest] Сервер не выдаёт гостевой доступ (${e.status}) — общий тест-доступ`)
    }
  }
  return startLocalTrial(cfg, minutes)
}

async function startLocalTrial(cfg, minutes) {
  const now = Date.now()
  const retryAt = guestTrial.localRetryAt(settingsManager.get('guest'), now)
  if (retryAt) return { success: false, code: 'guest_trial_used', retryAt, guest: guestState() }
  // Ссылка бесплатной подписки настраивается в админке (/config → free_sub_url),
  // с фолбэком на встроенную TRIAL_URL.
  const trialUrl = cfg?.free_sub_url || TRIAL_URL
  try {
    const { servers, userInfo } = await subscriptionManager.fetchAndParse(trialUrl)
    const expiresAt = now + (minutes ? minutes * 60 * 1000 : TEST_ACCESS_DURATION)
    putTrialSub(guestTrial.buildTrialSub({ kind: 'guest', url: trialUrl, servers, userInfo, expiresAt, now }))
    const guest = saveGuest({
      session: true, startedAt: now, expiresAt, retryAt: now + guestTrial.DAY,
      source: 'local', serverName: '', minutes: minutes || guestTrial.DEFAULT_MINUTES,
    })
    console.log(`[Guest] Пробный доступ на ${guest.minutes} мин (общая ссылка)`)
    return { success: true, guest }
  } catch (e) {
    console.error('[Guest] Тест-доступ:', e.message)
    return { success: false, error: e.message || 'Не удалось включить пробный доступ' }
  }
}

// Вошедший без подписки: POST /me/daily-trial. Ссылку кладём рядом как пробную
// подписку; если сервер выдал доступ самой подписке аккаунта — просто синхронизируемся.
async function startDailyTrial() {
  const now = Date.now()
  try {
    const r = await apiClient.dailyTrial()
    settingsManager.set('dailyTrialRetryAt', now + guestTrial.DAY)
    const url = r?.subscription_url
    const expiresAt = guestTrial.expiryFromResponse(r, now)
    const sync = await syncSubscription().catch(() => null)
    if (!url || sync?.hasAccess) return { success: true, expiresAt }
    const { servers, userInfo } = await subscriptionManager.fetchAndParse(url)
    putTrialSub(guestTrial.buildTrialSub({ kind: 'daily', url, servers, userInfo, expiresAt, now }))
    console.log('[Trial] «15 минут бесплатно» включены')
    return { success: true, expiresAt }
  } catch (e) {
    if (e.status === 429 || e.code === 'daily_trial_used') {
      const retryAt = guestTrial.retryFromResponse(e.data, now)
      settingsManager.set('dailyTrialRetryAt', retryAt)
      return { success: false, code: 'daily_trial_used', retryAt, error: 'Сегодня бесплатные минуты уже использованы' }
    }
    if (e.status === 409 || e.code === 'has_subscription') {
      syncSubscription().catch(() => {})
      return { success: false, code: 'has_subscription', error: 'У вас уже есть подписка' }
    }
    if ([404, 405, 501].includes(e.status)) return { success: false, code: 'unsupported', error: 'Пока недоступно' }
    console.error('[Trial] «15 минут бесплатно»:', e.message)
    return { success: false, error: e.message || 'Не удалось включить бесплатные минуты' }
  }
}

// ─── Проверка соединения ──────────────────────────────────────────────────────

// Транспорт для проверки: отдельная сессия в памяти, без кэша и старых соединений.
// TUN — напрямую через систему (трафик сам уходит в туннель), прокси — через
// локальный вход ядра, как у браузеров.
async function makeCheckFetcher(mode) {
  const ses = session.fromPartition('lipton-connection-check')
  const httpPort = settingsManager.get('httpPort') || 10809
  if (mode === 'proxy') {
    await ses.setProxy({ mode: 'fixed_servers', proxyRules: `127.0.0.1:${httpPort}`, proxyBypassRules: '<-loopback>' })
  } else {
    await ses.setProxy({ mode: 'direct' })
  }
  await ses.closeAllConnections()
  await ses.clearHostResolverCache()
  await ses.clearCache()
  return async (url, timeoutMs) => {
    const res = await ses.fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.text()).slice(0, 4096)
  }
}

async function runConnectionCheck() {
  const status = vpnManager.getStatus()
  const mode = vpnManager.getMode()
  try {
    const fetchText = status === 'connected' ? await makeCheckFetcher(mode) : null
    const lookup = host => require('dns').promises.lookup(host, { family: 4 }).then(r => r.address)
    const result = await connectionCheck.runConnectionCheck({ status, mode, fetchText, lookup })
    // В лог — только статусы пунктов, без IP и стран (логи можно отправить в поддержку).
    console.log(`[Check] ${result.verdict.title} (${mode || '—'}): ` + result.items.map(i => `${i.id}=${i.status}`).join(', '))
    return result
  } catch (err) {
    console.error('[Check] Ошибка проверки:', err.message)
    return { mode, items: [], verdict: { level: 'fail', title: 'Проверка не удалась', hints: [err.message] } }
  }
}

// ─── Параметры подключения (одни и те же для ручного и автоподключения) ───────

function buildConnectOptions(settings) {
  const subs = settings.subscriptions || []
  return {
    socksPort: settings.socksPort || 10808,
    httpPort: settings.httpPort || 10809,
    dataDir: settingsManager.getDataDir(),
    bypassRu: settings.bypassRu !== false,
    bypassDomains: settings.bypassDomains || [],
    tunMode: settings.tunMode !== false,
    strictRoute: settings.tunStrictRoute !== false,
    // Все серверы подписок — для смены сервера без перезапуска ядра.
    servers: subs.flatMap(s => s.servers || []),
    directDomains: serviceHosts(subs),

    onUnexpectedDisconnect: () => {
      settingsManager.set('activeServerId', null)
      refreshTray('disconnected')
      sendVpnStatus({ status: 'disconnected', serverId: null })
    },
    onKillSwitch: () => {
      refreshTray('kill-switch')
      sendVpnStatus({ status: 'kill-switch', serverId: null })
    },
    onReconnecting: () => {
      sendVpnStatus({ status: 'reconnecting', serverId: settingsManager.get('activeServerId') })
    },
    onReconnected: () => {
      refreshTray('connected')
      sendVpnStatus({ status: 'connected', serverId: settingsManager.get('activeServerId') })
    },
  }
}

// ─── Auto-connect ─────────────────────────────────────────────────────────────

// При старте Windows сеть часто ещё не поднялась: если сервер не ответил,
// повторяем с нарастающей паузой (~2,5 мин в сумме). Ручное подключение или
// отключение пользователем отменяет повторы.
const AUTO_CONNECT_RETRY_MS = [5000, 10000, 20000, 40000, 60000]
let autoConnectTimer = null
let autoConnectGen = 0

function cancelAutoConnectRetry() {
  autoConnectGen++
  clearTimeout(autoConnectTimer)
  autoConnectTimer = null
}

function isRetryableConnectError(err) {
  const t = String(err || '').toLowerCase()
  return t.includes('сервер не отвечает') || t.includes('не ответило вовремя') ||
    t.includes('завершилось при запуске') || t.includes('enotfound') || t.includes('network')
}

async function doAutoConnect(attempt = 0) {
  autoConnectTimer = null
  if (vpnManager.getStatus() !== 'disconnected') return
  const myGen = autoConnectGen
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

  console.log(`[AutoConnect] Подключение к: ${server.remark || server.address}${attempt ? ` (повтор ${attempt}/${AUTO_CONNECT_RETRY_MS.length})` : ''}`)
  sendVpnStatus({ status: 'connecting' })

  const result = await vpnManager.connect(server, buildConnectOptions(settings))
  if (myGen !== autoConnectGen) return // пользователь сам подключился/отключился

  if (result.success) {
    settingsManager.set('activeServerId', serverId)
    refreshTray('connected')
    sendVpnStatus({ status: 'connected', serverId })
    return
  }
  if (vpnManager.getStatus() !== 'disconnected') return
  sendVpnStatus({ status: vpnManager.isKillSwitchEngaged() ? 'kill-switch' : 'disconnected' })
  if (attempt < AUTO_CONNECT_RETRY_MS.length && isRetryableConnectError(result.error)) {
    const delay = AUTO_CONNECT_RETRY_MS[attempt]
    console.warn(`[AutoConnect] Не удалось (${result.error}). Повтор через ${delay / 1000} с`)
    autoConnectTimer = setTimeout(() => doAutoConnect(attempt + 1), delay)
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

      // Уведомление на рабочем столе — если не выключено в настройках
      if (settings.notifications !== false) try {
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
  try {
    const applied = settingsManager.migrate()
    if (applied.length) console.log('[Settings] Миграция настроек:', applied.join(', '))
  } catch (e) {
    console.error('[Settings] Ошибка миграции:', e.message)
  }

  // Тема до создания окна — чтобы фон окна сразу был нужного цвета.
  applyTheme(settingsManager.get('theme'))
  nativeTheme.on('updated', () => {
    const st = themeState()
    try { mainWindow?.setBackgroundColor(windowState.themeBackground(st.effective)) } catch {}
    sendToWindow('theme:updated', st)
  })

  createWindow()
  createTray()
  setupIPC()

  const deepLinkArg = process.argv.slice(1).find(a => a.startsWith('liptonapp:') || a.startsWith('lipton:') || a.startsWith('liptonvpn:'))
  if (deepLinkArg) await handleDeepLink(deepLinkArg)

  // Запрос к API не прошёл (сеть/таймаут) при «подключено» — проверить туннель.
  apiClient.onNetworkError(() => vpnManager.checkTunnel())

  // Init kill switch from saved settings
  vpnManager.setKillSwitch(settingsManager.get('killSwitch') === true)

  // Следы прошлого запуска: осиротевшее ядро, блокировка, маршруты старого TUN, наш прокси.
  try {
    await singboxCore.cleanupStale({
      dataDir: settingsManager.getDataDir(),
      killSwitch: settingsManager.get('killSwitch') === true,
      httpPort: settingsManager.get('httpPort') || 10809,
    })
  } catch (e) {
    console.warn('[Startup] Очистка:', e.message)
  }

  // Подписка теперь приходит из аккаунта — тянем при старте, если вошли.
  if (apiClient.isAuthed()) {
    syncSubscription().catch(err => console.error('[Startup] sync:', err.message))
  }

  setInterval(checkTrialExpiry, 30_000)
  checkTrialExpiry() // и точный таймер на конец пробного доступа

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

let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  // Дожидаемся отключения (ядро, прокси, блокировка), потом выходим обычным quit —
  // чтобы сработали 'quit'-обработчики (в т.ч. установка обновления при выходе).
  event.preventDefault()
  quitting = true
  try { vpnStats.flush() } catch {}
  const done = () => app.quit()
  const timer = setTimeout(done, 8000)
  vpnManager.disconnect()
    .catch(e => console.error('[Quit] Ошибка отключения:', e.message))
    .finally(() => { clearTimeout(timer); done() })
})

// Аварийный выход процесса: не оставляем ядро, прокси и блокировку.
process.on('exit', () => {
  try { singboxCore.emergencyCleanupSync() } catch {}
})
