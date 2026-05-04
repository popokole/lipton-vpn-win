const fs = require('fs')
const path = require('path')
const os = require('os')

const MAX = 500
const entries = []

const LOG_DIR = path.join(os.homedir(), 'AppData', 'Local', 'LiptonVPN')
const LOG_FILE = path.join(LOG_DIR, 'app.log')

try { fs.mkdirSync(LOG_DIR, { recursive: true }) } catch {}

function writeToFile(line) {
  try { fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8') } catch {}
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

module.exports = { getLogs, clearLogs, getLogFilePath }
