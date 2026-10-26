const fs = require('fs')
const path = require('path')
const os = require('os')

const MAX = 500
const entries = []

const LOG_DIR = path.join(os.homedir(), 'AppData', 'Local', 'LiptonVPN')
const LOG_FILE = path.join(LOG_DIR, 'app.log')

// Ротация: при 5 МБ текущий файл становится app.log.1 (прежний .1 удаляется).
// Итого на диске не больше ~10 МБ логов.
const MAX_FILE_BYTES = 5 * 1024 * 1024
const OLD_FILE = LOG_FILE + '.1'

try { fs.mkdirSync(LOG_DIR, { recursive: true }) } catch {}

let fileBytes = 0
try { fileBytes = fs.statSync(LOG_FILE).size } catch {}

function rotate() {
  try { fs.rmSync(OLD_FILE, { force: true }) } catch {}
  try { fs.renameSync(LOG_FILE, OLD_FILE) } catch {
    // переименовать не вышло (файл держат) — просто начинаем заново
    try { fs.writeFileSync(LOG_FILE, '', 'utf-8') } catch {}
  }
  fileBytes = 0
}

function writeToFile(line) {
  if (fileBytes >= MAX_FILE_BYTES) rotate()
  const data = line + '\n'
  try {
    fs.appendFileSync(LOG_FILE, data, 'utf-8')
    fileBytes += Buffer.byteLength(data, 'utf-8')
  } catch {}
}

function add(level, args) {
  const msg = args.map(a =>
    typeof a === 'object' ? JSON.stringify(a, null, 0) : String(a)
  ).join(' ')
  entries.push({ t: Date.now(), level, msg })
  if (entries.length > MAX) entries.shift()
  const d = new Date()
  const hms = d.toTimeString().slice(0, 8)
  writeToFile(`[${hms}] [${level.toUpperCase()}] ${msg}`)
}

// Patch console
const _log   = console.log.bind(console)
const _warn  = console.warn.bind(console)
const _error = console.error.bind(console)

console.log   = (...a) => { add('info',  a); _log(...a)   }
console.warn  = (...a) => { add('warn',  a); _warn(...a)  }
console.error = (...a) => { add('error', a); _error(...a) }

function getLogs() {
  return entries.map(e => {
    const d = new Date(e.t)
    const hms = d.toTimeString().slice(0, 8)
    return `[${hms}] [${e.level.toUpperCase()}] ${e.msg}`
  })
}

function getLogFilePath() { return LOG_FILE }

function clearLogs() {
  entries.length = 0
}

// Verbose: writes only to file, not shown in UI log panel
function verbose(...args) {
  const msg = args.map(a =>
    typeof a === 'object' ? JSON.stringify(a, null, 0) : String(a)
  ).join(' ')
  const d = new Date()
  const hms = d.toTimeString().slice(0, 8)
  writeToFile(`[${hms}] [VERBOSE] ${msg}`)
}

module.exports = { getLogs, clearLogs, getLogFilePath, verbose, _internal: { MAX_FILE_BYTES, OLD_FILE } }
