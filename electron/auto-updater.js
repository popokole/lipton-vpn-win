function setupAutoUpdater(mainWindow) {
  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  const send = (event, data) => mainWindow?.webContents.send('updater:' + event, data)

  autoUpdater.on('checking-for-update', () => send('status', { event: 'checking' }))
  autoUpdater.on('update-not-available', () => send('status', { event: 'latest' }))
  autoUpdater.on('error', err => {
    if (err.message?.includes('null byte') || err.message?.includes('YAML')) return
    send('status', { event: 'error', message: err.message })
  })
  autoUpdater.on('update-available', info => send('status', { event: 'available', version: info.version }))
  autoUpdater.on('download-progress', p => send('progress', { percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', info => send('status', { event: 'downloaded', version: info.version }))

  // Start checking after 5 seconds
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)

  // Re-check every 2 hours
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 2 * 60 * 60 * 1000)
}

module.exports = { setupAutoUpdater }
