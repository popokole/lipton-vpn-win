const { spawn } = require('child_process')
const path = require('path')
const os = require('os')

const electronExe = require('electron')
const projectRoot = path.join(__dirname, '..')

console.log('[launcher] Starting:', electronExe)

// Отдельная папка данных для dev — чтобы dev-копия не делила настройки/токены
// и single-instance lock с установленной версией (можно запускать параллельно).
const env = {
  ...process.env,
  ELECTRON_IS_DEV: '1',
  LIPTON_DATA_DIR: path.join(os.homedir(), 'AppData', 'Local', 'LiptonVPN-dev'),
}
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronExe, [projectRoot], {
  stdio: 'inherit',
  windowsHide: false,
  env,
})

child.on('close', code => {
  console.log('[launcher] Electron exited with code', code)
  process.exit(code || 0)
})

child.on('error', err => {
  console.error('[launcher] Failed to start electron:', err.message)
  process.exit(1)
})
