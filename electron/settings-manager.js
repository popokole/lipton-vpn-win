const fs = require('fs')
const path = require('path')
const os = require('os')

// В dev можно указать отдельную папку (LIPTON_DATA_DIR), чтобы dev-копия не
// делила настройки/токены с установленной версией.
const DATA_DIR = process.env.LIPTON_DATA_DIR || path.join(os.homedir(), 'AppData', 'Local', 'LiptonVPN')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

const DEFAULTS = {
  firstLaunch: true,
  trialAdded: false,
  subscriptions: [],
  activeServerId: null,
  socksPort: 10808,
  httpPort: 10809,
  // Режим «весь трафик» (TUN через sing-box) — по умолчанию. false = только браузеры (системный прокси).
  tunMode: true,
  // Скрытый запасной вариант: старое ядро xray (+tun2socks). Уберём через релиз.
  coreLegacy: false,
}

// Версия схемы настроек. 2 — новое ядро sing-box и TUN по умолчанию.
const SETTINGS_VERSION = 2

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

// Одноразовые миграции при обновлении. Возвращает список применённых.
function migrate() {
  ensure()
  let raw = {}
  try {
    if (fs.existsSync(SETTINGS_FILE)) raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
  } catch {}
  const from = Number(raw.settingsVersion) || 1
  if (from >= SETTINGS_VERSION) return []
  const applied = []
  if (from < 2) {
    // До 2.1 по умолчанию был системный прокси — UDP/WebRTC и часть программ шли мимо VPN.
    // Один раз переводим всех на «весь трафик»; дальнейший выбор пользователя уважаем.
    raw.tunMode = true
    if (raw.coreLegacy === undefined) raw.coreLegacy = false
    applied.push('tunMode→true')
  }
  raw.settingsVersion = SETTINGS_VERSION
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ ...DEFAULTS, ...raw }, null, 2), 'utf-8')
  return applied
}

function getDataDir() {
  return DATA_DIR
}

module.exports = { getAll, get, set, getDataDir, migrate, SETTINGS_VERSION }
