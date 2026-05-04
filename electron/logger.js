const MAX = 500

const entries = []

function add(level, args) {
  const msg = args.map(a =>
    typeof a === 'object' ? JSON.stringify(a, null, 0) : String(a)
  ).join(' ')
  entries.push({ t: Date.now(), level, msg })
  if (entries.length > MAX) entries.shift()
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

function clearLogs() {
  entries.length = 0
}

module.exports = { getLogs, clearLogs }
