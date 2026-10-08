// Гостевой режим окна: пробный доступ идёт / закончился, «следующая попытка —
// завтра в 14:05». Чистые функции — проверяются node --test.

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN

function toMs(v) {
  if (v == null || v === '') return null
  const t = typeof v === 'number' ? v : new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

export const minutesWord = n => {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return 'минут'
  if (b > 1 && b < 5) return 'минуты'
  if (b === 1) return 'минута'
  return 'минут'
}

// Длительность гостевого доступа из /config; по умолчанию 15 минут.
export function trialMinutes(config) {
  const m = Number(config?.guest_trial?.minutes ?? config?.trial_guest_minutes)
  return Number.isFinite(m) && m > 0 && m <= 24 * 60 ? Math.round(m) : 15
}

// Сервер выдаёт гостевой доступ сам (и «15 минут бесплатно» вошедшим).
export function serverTrialEnabled(config) {
  return !!(config?.guest_trial?.enabled ?? config?.trial_guest_enabled)
}

// Режим гостя: 'none' — не гость (экран приветствия), 'active' — пробный доступ
// идёт, 'ended' — закончился. guest — settings.guest из main.
export function guestView({ guest, authed = false, now = Date.now(), minutes = 15 } = {}) {
  const g = guest && typeof guest === 'object' ? guest : {}
  const expiresAt = toMs(g.expiresAt)
  const startedAt = toMs(g.startedAt)
  const retryAt = toMs(g.retryAt)
  const totalMs = expiresAt && startedAt && expiresAt > startedAt ? expiresAt - startedAt : minutes * MIN
  const base = { expiresAt, retryAt: retryAt && retryAt > now ? retryAt : null, totalMs, serverName: g.serverName || '', source: g.source || null }
  if (authed || g.session !== true) return { ...base, mode: 'none', msLeft: 0, progress: 0 }
  const msLeft = expiresAt ? Math.max(0, expiresAt - now) : 0
  if (msLeft <= 0) return { ...base, mode: 'ended', msLeft: 0, progress: 0 }
  return { ...base, mode: 'active', msLeft, progress: Math.max(0, Math.min(1, msLeft / totalMs)) }
}

const hhmm = d => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

// «сегодня в 18:30» / «завтра в 14:05» / «9 октября в 14:05». Прошло — ''.
export function retryLabel(at, now = Date.now()) {
  const t = toMs(at)
  if (t == null || t <= now) return ''
  const d = new Date(t)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const s0 = start.getTime()
  if (t < s0 + DAY) return `сегодня в ${hhmm(d)}`
  if (t < s0 + 2 * DAY) return `завтра в ${hhmm(d)}`
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${hhmm(d)}`
}
