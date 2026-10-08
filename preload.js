const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Window controls
  minimize: () => ipcRenderer.invoke('app:minimize'),
  close: () => ipcRenderer.invoke('app:close'),
  maximize: () => ipcRenderer.invoke('app:maximize'),
  unmaximize: () => ipcRenderer.invoke('app:unmaximize'),
  toggleMaximize: () => ipcRenderer.invoke('app:toggle-maximize'),
  isMaximized: () => ipcRenderer.invoke('app:is-maximized'),
  onMaximizedChange: (cb) => {
    const h = (_, v) => cb(!!v)
    ipcRenderer.on('win:maximized', h)
    return () => ipcRenderer.removeListener('win:maximized', h)
  },
  // Окно видно / скрыто в трей или свёрнуто — для паузы анимаций.
  isWindowVisible: () => ipcRenderer.invoke('win:is-visible'),
  onWindowVisibility: (cb) => {
    const h = (_, v) => cb(!!v)
    ipcRenderer.on('win:visibility', h)
    return () => ipcRenderer.removeListener('win:visibility', h)
  },

  // Theme: { theme: 'dark'|'light'|'system', effective: 'dark'|'light' }
  getTheme: () => ipcRenderer.invoke('settings:get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('settings:set-theme', theme),
  onThemeUpdate: (cb) => {
    const h = (_, data) => cb(data)
    ipcRenderer.on('theme:updated', h)
    return () => ipcRenderer.removeListener('theme:updated', h)
  },
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  openTelegram: (link) => ipcRenderer.invoke('app:open-telegram', link),
  openArticles: () => ipcRenderer.invoke('articles:open'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getLicenseText: (name) => ipcRenderer.invoke('app:license-text', name),

  // Auth
  authState: () => ipcRenderer.invoke('auth:state'),
  authEmailRequest: (email) => ipcRenderer.invoke('auth:email-request', email),
  authEmailVerify: (email, code) => ipcRenderer.invoke('auth:email-verify', { email, code }),
  authTgInit: () => ipcRenderer.invoke('auth:tg-init'),
  authTgPoll: (linkToken) => ipcRenderer.invoke('auth:tg-poll', linkToken),
  authTgVerify: (linkToken, code) => ipcRenderer.invoke('auth:tg-verify', { linkToken, code }),
  authDeviceExchange: (code) => ipcRenderer.invoke('auth:device-exchange', code),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
  accountSync: () => ipcRenderer.invoke('account:sync'),
  trialTestAccess: () => ipcRenderer.invoke('trial:test-access'),
  paymentCheckout: (opts) => ipcRenderer.invoke('payment:checkout', opts),
  paymentStatus: (txId) => ipcRenderer.invoke('payment:status', txId),
  accountSubscriptionView: () => ipcRenderer.invoke('account:subscription-view'),
  tariffChangeOptions: () => ipcRenderer.invoke('tariff:options'),
  tariffChangePreview: (opts) => ipcRenderer.invoke('tariff:preview', opts),
  tariffChange: (opts) => ipcRenderer.invoke('tariff:change', opts),
  supportGet: () => ipcRenderer.invoke('support:get'),
  supportSend: (body) => ipcRenderer.invoke('support:send', body),
  supportAttachLogs: () => ipcRenderer.invoke('support:attach-logs'),
  getAiDialog: () => ipcRenderer.invoke('ai:dialog'),
  aiChat: (message) => ipcRenderer.invoke('ai:send', message),
  sendAppLogs: () => ipcRenderer.invoke('ai:logs'),
  getNews: () => ipcRenderer.invoke('news:get'),
  accountProfile: () => ipcRenderer.invoke('account:profile'),
  accountTransactions: () => ipcRenderer.invoke('account:transactions'),
  accountConfig: () => ipcRenderer.invoke('account:config'),
  accountDeleteCard: () => ipcRenderer.invoke('account:delete-card'),
  accountDevices: () => ipcRenderer.invoke('account:devices'),
  accountRevokeDevice: (hwid) => ipcRenderer.invoke('account:revoke-device', hwid),
  accountRevokeAllDevices: () => ipcRenderer.invoke('account:revoke-all-devices'),
  accountRelink: (expectedVersion) => ipcRenderer.invoke('account:relink', expectedVersion),
  accountIdentities: () => ipcRenderer.invoke('account:identities'),
  accountUnlinkIdentity: (id) => ipcRenderer.invoke('account:unlink-identity', id),
  accountCancelSubscription: () => ipcRenderer.invoke('account:cancel-subscription'),
  serverStatus: () => ipcRenderer.invoke('status:servers'),
  getNewsRead: () => ipcRenderer.invoke('news:get-read'),
  setNewsRead: (ids) => ipcRenderer.invoke('news:set-read', ids),
  onAccountSubscription: (cb) => {
    ipcRenderer.on('account:subscription', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('account:subscription')
  },

  // VPN
  vpnConnect: (serverId) => ipcRenderer.invoke('vpn:connect', serverId),
  vpnDisconnect: () => ipcRenderer.invoke('vpn:disconnect'),
  vpnStatus: () => ipcRenderer.invoke('vpn:status'),
  vpnCheckConnection: () => ipcRenderer.invoke('vpn:check-connection'),
  // Статистика сессии (скорость, пинг, итоги дня и недели) и «что видят сайты»
  vpnStats: () => ipcRenderer.invoke('vpn:stats'),
  vpnLastCheck: () => ipcRenderer.invoke('vpn:last-check'),
  onCheckResult: (cb) => {
    const h = (_, data) => cb(data)
    ipcRenderer.on('vpn:check-result', h)
    return () => ipcRenderer.removeListener('vpn:check-result', h)
  },
  onVpnStatus: (cb) => {
    ipcRenderer.on('vpn:status-update', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('vpn:status-update')
  },

  // Subscriptions
  subList: () => ipcRenderer.invoke('sub:list'),
  subAdd: (url) => ipcRenderer.invoke('sub:add', url),
  subRemove: (id) => ipcRenderer.invoke('sub:remove', id),
  subRefresh: (id) => ipcRenderer.invoke('sub:refresh', id),
  subPing: (id) => ipcRenderer.invoke('sub:ping', id),
  onSubUpdate: (cb) => {
    ipcRenderer.on('sub:updated', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('sub:updated')
  },
  onSubAddResult: (cb) => {
    ipcRenderer.on('sub:add-result', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('sub:add-result')
  },

  // Updater
  onUpdateStatus: (cb) => {
    ipcRenderer.on('updater:status', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('updater:status')
  },
  onUpdateProgress: (cb) => {
    ipcRenderer.on('updater:progress', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('updater:progress')
  },
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  canClaimTrial: () => ipcRenderer.invoke('trial:can-claim'),
  claimTrial: () => ipcRenderer.invoke('trial:claim'),

  // Settings
  getAutostart:  ()        => ipcRenderer.invoke('settings:get-autostart'),
  setAutostart:  (enabled) => ipcRenderer.invoke('settings:set-autostart', enabled),
  getBypassRu:   ()        => ipcRenderer.invoke('settings:get-bypass-ru'),
  setBypassRu:   (enabled) => ipcRenderer.invoke('settings:set-bypass-ru', enabled),
  getLogs:              ()       => ipcRenderer.invoke('settings:get-logs'),
  clearLogs:            ()       => ipcRenderer.invoke('settings:clear-logs'),
  openLogFile:          ()       => ipcRenderer.invoke('settings:open-log-file'),
  resetProfile:         ()       => ipcRenderer.invoke('settings:reset-profile'),
  getBypassDomains:     ()       => ipcRenderer.invoke('settings:get-bypass-domains'),
  addBypassDomain:      (domain) => ipcRenderer.invoke('settings:add-bypass-domain', domain),
  removeBypassDomain:   (domain) => ipcRenderer.invoke('settings:remove-bypass-domain', domain),
  getKillSwitch:        ()       => ipcRenderer.invoke('settings:get-kill-switch'),
  setKillSwitch:        (v)      => ipcRenderer.invoke('settings:set-kill-switch', v),
  getAutoConnect:       ()       => ipcRenderer.invoke('settings:get-auto-connect'),
  setAutoConnect:       (v)      => ipcRenderer.invoke('settings:set-auto-connect', v),
  getTunMode:           ()       => ipcRenderer.invoke('settings:get-tun-mode'),
  getNotifications:     ()       => ipcRenderer.invoke('settings:get-notifications'),
  setNotifications:     (v)      => ipcRenderer.invoke('settings:set-notifications', v),
  setTunMode:           (v)      => ipcRenderer.invoke('settings:set-tun-mode', v),
  flushDns:             ()       => ipcRenderer.invoke('settings:flush-dns'),
  resetDns:             ()       => ipcRenderer.invoke('settings:reset-dns'),
  resetNetwork:         ()       => ipcRenderer.invoke('settings:reset-network'),
  isFirstLaunch:        ()       => ipcRenderer.invoke('settings:is-first-launch'),
  completeOnboarding:   ()       => ipcRenderer.invoke('settings:complete-onboarding'),
  onExpiryWarning: (cb) => {
    ipcRenderer.on('sub:expiry-warning', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('sub:expiry-warning')
  },
})
