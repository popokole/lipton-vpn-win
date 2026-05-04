const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Window controls
  minimize: () => ipcRenderer.invoke('app:minimize'),
  close: () => ipcRenderer.invoke('app:close'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  getVersion: () => ipcRenderer.invoke('app:version'),

  // VPN
  vpnConnect: (serverId) => ipcRenderer.invoke('vpn:connect', serverId),
  vpnDisconnect: () => ipcRenderer.invoke('vpn:disconnect'),
  vpnStatus: () => ipcRenderer.invoke('vpn:status'),
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
  resetProfile:         ()       => ipcRenderer.invoke('settings:reset-profile'),
  getBypassDomains:     ()       => ipcRenderer.invoke('settings:get-bypass-domains'),
  addBypassDomain:      (domain) => ipcRenderer.invoke('settings:add-bypass-domain', domain),
  removeBypassDomain:   (domain) => ipcRenderer.invoke('settings:remove-bypass-domain', domain),
  getKillSwitch:        ()       => ipcRenderer.invoke('settings:get-kill-switch'),
  setKillSwitch:        (v)      => ipcRenderer.invoke('settings:set-kill-switch', v),
  getAutoConnect:       ()       => ipcRenderer.invoke('settings:get-auto-connect'),
  setAutoConnect:       (v)      => ipcRenderer.invoke('settings:set-auto-connect', v),
  getAdBlock:           ()       => ipcRenderer.invoke('settings:get-ad-block'),
  setAdBlock:           (v)      => ipcRenderer.invoke('settings:set-ad-block', v),
  flushDns:             ()       => ipcRenderer.invoke('settings:flush-dns'),
  isFirstLaunch:        ()       => ipcRenderer.invoke('settings:is-first-launch'),
  completeOnboarding:   ()       => ipcRenderer.invoke('settings:complete-onboarding'),
  onExpiryWarning: (cb) => {
    ipcRenderer.on('sub:expiry-warning', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('sub:expiry-warning')
  },
})
