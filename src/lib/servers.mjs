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

// «Авто-баланс» — сервер подписки, который сам выбирает быстрый узел (по названию).
export function isAutoBalance(remark) {
  return /авто|auto|баланс|balanc/i.test(String(remark || ''))
}

// Сервер по умолчанию, когда человек сам ничего не выбирал: «Авто-баланс»
// (он сам ведёт на быстрый узел), иначе с наименьшим пингом, иначе первый.
export function defaultServer(servers) {
  const list = Array.isArray(servers) ? servers : []
  const auto = list.find(s => isAutoBalance(s.remark))
  if (auto) return auto
  const pinged = list.filter(s => typeof s.ping === 'number').sort((a, b) => a.ping - b.ping)
  return pinged[0] || list[0] || null
}

// Серверы тарифа «Обход глушилок» (с маскировкой трафика) — по названию.
export function isBypassServer(remark) {
  return /обход|bypass|глуш/i.test(String(remark || ''))
}

// «🇩🇪 Германия · Франкфурт» → { title: 'Германия', sub: 'Франкфурт' }.
export function splitRemark(remark) {
  const r = cleanRemark(remark)
  const parts = r.split(/\s+[·|—–-]\s+/).map(s => s.trim()).filter(Boolean)
  if (parts.length < 2) return { title: r, sub: '' }
  return { title: parts[0], sub: parts.slice(1).join(' · ') }
}

// Серверы, которые бэкенд (GET /status/servers) отметил «down», в списке не
// показываем; сопоставление — по названию без флага. «unknown», нет статуса
// или он устарел (stale) — показываем: не знаем — не прячем. Выбранный сервер
// оставляем, чтобы не потерять отметку; если спрятать пришлось бы всё — всё и показываем.
export function hideOffline(servers, status, keepId) {
  const list = Array.isArray(servers) ? servers : []
  if (!status || status.stale || !Array.isArray(status.servers)) return list
  const down = new Set(status.servers
    .filter(s => s && s.status === 'down')
    .map(s => String(s.name || '').trim().toLowerCase())
    .filter(Boolean))
  if (!down.size) return list
  const visible = list.filter(s => s.id === keepId || !down.has(splitRemark(s.remark).title.toLowerCase()))
  return visible.length ? visible : list
}

// Подпись по пингу: «низкий пинг» / «стабильный» / «высокий пинг».
export function pingTag(ms) {
  if (ms == null) return { label: 'пинг не измерен', tone: 'muted' }
  if (ms < 60) return { label: 'низкий пинг', tone: 'ok' }
  if (ms < 150) return { label: 'стабильный', tone: 'info' }
  return { label: 'высокий пинг', tone: 'warn' }
}

// Сколько «палочек сигнала» из 4 закрасить.
export function signalLevel(ms) {
  if (ms == null) return 0
  if (ms < 80) return 4
  if (ms < 150) return 3
  if (ms < 300) return 2
  return 1
}

// Цвет пинга: хороший / средний / плохой / нет данных.
export function pingTone(ms) {
  if (ms == null) return 'none'
  if (ms <= 250) return 'ok' // зелёный до 250 мс (решение владельца)
  if (ms < 400) return 'warn'
  return 'bad'
}

// Цветной акцент строки списка: по кругу изумруд → бирюза → синий,
// высокий пинг — рыжий, серверы «Обхода» — фиолетовый.
const ACCENTS = ['emerald', 'cyan', 'blue']
export function serverAccent(index, ms, bypass = false) {
  if (bypass) return 'violet'
  if (ms != null && ms > 250) return 'orange'
  return ACCENTS[Math.abs(index) % ACCENTS.length]
}

// Раскладка страницы «Серверы»: Авто-баланс отдельно, остальные — группами.
// bypassPlan — у пользователя тариф «Обход глушилок»: его серверы — первой группой.
export function groupServers(servers, { bypassPlan = false } = {}) {
  const list = Array.isArray(servers) ? servers : []
  const auto = list.find(s => isAutoBalance(s.remark)) || null
  const rest = list.filter(s => s !== auto)
  const bypass = bypassPlan ? rest.filter(s => isBypassServer(s.remark)) : []
  const regular = rest.filter(s => !bypass.includes(s))
  return { auto, bypass, regular }
}
