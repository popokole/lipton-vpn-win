// Серверы из подписки: флаг страны и название без эмодзи-флага.
// Чистые функции — проверяются node --test (tests/renderer-lib.test.mjs).

const FLAG_RE = /[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/
const FLAG_RE_ALL = /[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]\s*/g

// «🇩🇪 Германия · Франкфурт» → 'de' (для flag-icons) или null, если флага нет.
export function flagCode(remark) {
  const m = String(remark || '').match(FLAG_RE)
  if (!m) return null
  const code = [...m[0]]
    .map(c => String.fromCharCode(c.codePointAt(0) - 0x1F1E6 + 65))
    .join('')
    .toLowerCase()
  return /^[a-z]{2}$/.test(code) ? code : null
}

// «🇩🇪 Германия · Франкфурт» → «Германия · Франкфурт».
export function cleanRemark(remark) {
  const r = String(remark || '')
  return r.replace(FLAG_RE_ALL, '').trim() || r
}

// Все серверы всех подписок одним списком (как раньше в App).
export function flattenServers(subscriptions) {
  return (Array.isArray(subscriptions) ? subscriptions : []).flatMap(sub =>
    (sub?.servers || []).map(s => ({ ...s, subId: sub.id, isTrial: sub.isTrial })),
  )
}
