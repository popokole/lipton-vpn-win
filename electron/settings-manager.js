const fs = require('fs')
const path = require('path')
const os = require('os')
const { DEFAULT_THEME } = require('./window-state')

// В dev можно указать отдельную папку (LIPTON_DATA_DIR), чтобы dev-копия не
// делила настройки/токены с установленной версией.
const DATA_DIR = process.env.LIPTON_DATA_DIR || path.join(os.homedir(), 'AppData', 'Local', 'LiptonVPN')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')
// Копия последнего удачно прочитанного/записанного файла: если основной побился
// (обрыв записи при обновлении, антивирус держит файл), берём её, а не «пустые»
// настройки — иначе вход в аккаунт и подписки терялись после обновления.
const BACKUP_FILE = SETTINGS_FILE + '.bak'

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
  // Тема интерфейса: 'dark' | 'light' | 'system'. Новый ключ — версия схемы не меняется:
  // у старых settings.json его просто нет, и берётся значение по умолчанию.
  theme: DEFAULT_THEME,
  // Размер и положение окна { x, y, width, height, maximized } или null — по центру.
  windowBounds: null,
}

// Версия схемы настроек. 2 — новое ядро sing-box и TUN по умолчанию.
const SETTINGS_VERSION = 2

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// Синхронная короткая пауза между попытками чтения (файл держит антивирус
// или установщик сразу после обновления).
function pauseSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch {}
}

function readJson(file) {
  const raw = fs.readFileSync(file, 'utf-8')
  const data = JSON.parse(raw)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('settings: не объект')
  return data
}

// readStored — сохранённые настройки: основной файл (до 3 попыток), иначе
// резервная копия. ok=false — ни то ни другое не прочиталось, но файл есть:
// тогда запись не должна молча затирать его «пустыми» настройками.
function readStored() {
  const exists = fs.existsSync(SETTINGS_FILE)
  if (exists) {
    for (let i = 0; i < 3; i++) {
      try { return { data: readJson(SETTINGS_FILE), ok: true } } catch (e) {
        if (i === 2) console.error('[settings] settings.json не прочитан:', e.message)
        else pauseSync(120)
      }
    }
  }
  try {
    if (fs.existsSync(BACKUP_FILE)) {
      const data = readJson(BACKUP_FILE)
      if (exists) console.warn('[settings] взята резервная копия settings.json.bak')
      return { data, ok: true }
    }
  } catch (e) {
    console.error('[settings] settings.json.bak не прочитан:', e.message)
  }
  return { data: {}, ok: !exists }
}

// Атомарная запись: во временный файл, затем переименование поверх. Обрыв
// посреди записи (установщик обновления убил процесс) больше не оставляет
// обрезанный JSON. Удачная запись обновляет и резервную копию.
function writeStored(data) {
  const json = JSON.stringify(data, null, 2)
  const tmp = SETTINGS_FILE + '.tmp'
  fs.writeFileSync(tmp, json, 'utf-8')
  try {
    fs.renameSync(tmp, SETTINGS_FILE)
  } catch {
    // Windows: целевой файл занят — пишем напрямую (как раньше).
    fs.writeFileSync(SETTINGS_FILE, json, 'utf-8')
    try { fs.unlinkSync(tmp) } catch {}
  }
  try { fs.writeFileSync(BACKUP_FILE, json, 'utf-8') } catch {}
}

function getAll() {
  ensure()
  return { ...DEFAULTS, ...readStored().data }
}

function get(key) {
  return getAll()[key]
}

function set(key, value) {
  ensure()
  const { data, ok } = readStored()
  if (!ok) {
    // Ни основной файл, ни копия не читаются: не перезаписываем — иначе
    // затрём токены входа и подписки настройками по умолчанию.
    console.error(`[settings] запись «${key}» пропущена: settings.json недоступен`)
    return
  }
  writeStored({ ...DEFAULTS, ...data, [key]: value })
}

// Одноразовые миграции при обновлении. Возвращает список применённых.
function migrate() {
  ensure()
  let raw = {}
  try {
    if (fs.existsSync(SETTINGS_FILE)) raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
  } catch (e) {
    // Файл не прочитался (занят антивирусом, битый) — не перезаписываем: в нём токены входа
    // и подписки. Миграция повторится при следующем запуске.
    console.error('[settings] миграция пропущена, settings.json не прочитан:', e.message)
    return []
  }
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
  writeStored({ ...DEFAULTS, ...raw })
  return applied
}

function getDataDir() {
  return DATA_DIR
}

module.exports = { getAll, get, set, getDataDir, migrate, SETTINGS_VERSION }
