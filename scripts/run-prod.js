const { spawn } = require('child_process')
const path = require('path')

const electronExe = require('electron')
const projectRoot = path.join(__dirname, '..')

console.log('[launcher] Starting Electron (production mode):', electronExe)

const env = { ...process.env, ELECTRON_IS_DEV: '0' }
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
