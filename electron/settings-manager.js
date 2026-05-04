const fs = require('fs')
const path = require('path')
const os = require('os')

const DATA_DIR = path.join(os.homedir(), 'AppData', 'Local', 'LiptonVPN')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

const DEFAULTS = {
  firstLaunch: true,
  trialAdded: false,
  subscriptions: [],
  activeServerId: null,
  socksPort: 10808,
  httpPort: 10809,
}

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function getAll() {
  ensure()
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8')
      return { ...DEFAULTS, ...JSON.parse(raw) }
    }
  } catch {}
  return { ...DEFAULTS }
}

function get(key) {
  return getAll()[key]
}

function set(key, value) {
  ensure()
  const current = getAll()
  current[key] = value
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(current, null, 2), 'utf-8')
}

function getDataDir() {
  return DATA_DIR
}

module.exports = { getAll, get, set, getDataDir }
