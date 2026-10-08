// Гостевой доступ «15 минут без регистрации раз в день» и «15 минут бесплатно»
// для вошедших без подписки. Чистые функции — без electron, проверяются node --test.
//
// settings.guest — состояние гостя на этом ПК (переживает перезапуск):
//   { session, startedAt, expiresAt, retryAt, source: 'server'|'local', serverName, minutes }
//   session   — гость сейчас в приложении (true с запуска пробного доступа до входа
//               в аккаунт или выхода); после окончания срока остаётся true —
//               показываем экран «15 минут прошли».
//   retryAt   — когда можно попробовать снова (сервер отдаёт retry_at; без сервера
//               считаем сами: сутки от начала прошлой попытки).
//   source    — 'server' (POST /guest/trial) или 'local' (прежний тест-доступ по
//               общей ссылке, если на сервере гостевой доступ выключен).

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN
const DEFAULT_MINUTES = 15

function toMs(v) {
  if (v == null || v === '') return null
  const t = typeof v === 'number' ? v : new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

// Длительность гостевого доступа из /config (guest_trial.minutes или trial_guest_minutes).
function guestMinutes(cfg) {
  const m = Number(cfg?.guest_trial?.minutes ?? cfg?.trial_guest_minutes)
  return Number.isFinite(m) && m > 0 && m <= 24 * 60 ? Math.round(m) : DEFAULT_MINUTES
}

// Сервер выдаёт гостевой доступ сам (B2), только если это включено в админке.
function serverGuestEnabled(cfg) {
  return !!(cfg?.guest_trial?.enabled ?? cfg?.trial_guest_enabled)
}

// Нормализованное состояние гостя (мусор в settings.json → null-поля).
function normalizeGuest(raw) {
  const g = raw && typeof raw === 'object' ? raw : {}
  return {
    session: g.session === true,
    startedAt: toMs(g.startedAt),
    expiresAt: toMs(g.expiresAt),
    retryAt: toMs(g.retryAt),
    source: g.source === 'server' ? 'server' : g.source === 'local' ? 'local' : null,
    serverName: typeof g.serverName === 'string' ? g.serverName.slice(0, 80) : '',
    minutes: Number(g.minutes) > 0 ? Number(g.minutes) : DEFAULT_MINUTES,
  }
}

// Когда снова можно взять пробный доступ без сервера: сутки от начала прошлой
// попытки. null — можно сейчас.
function localRetryAt(guest, now = Date.now()) {
  const g = normalizeGuest(guest)
  const fromStart = g.startedAt ? g.startedAt + DAY : null
  const at = Math.max(fromStart || 0, g.retryAt || 0)
  return at > now ? at : null
}

// retry_at из ответа 429 (строка ISO или секунды/мс); нет — сутки от сейчас.
function retryFromResponse(data, now = Date.now()) {
  const raw = data?.retry_at ?? data?.error?.retry_at ?? data?.next_available_at ?? data?.retryAt
  let t = toMs(raw)
  if (t != null && t < 1e12) t *= 1000 // секунды
  return t && t > now ? t : now + DAY
}

// Срок из ответа сервера: expires_at; если его нет — minutes от начала.
function expiryFromResponse(data, now = Date.now(), minutes = DEFAULT_MINUTES) {
  const t = toMs(data?.expires_at)
  return t && t > now ? t : now + minutes * MIN
}

// Подписка пробного доступа (лежит в settings.subscriptions рядом с прочими).
//   kind: 'guest' — гость без аккаунта, 'daily' — «15 минут бесплатно» у вошедшего.
function buildTrialSub({ kind = 'guest', url, servers, userInfo, expiresAt, now = Date.now() }) {
  return {
    id: `${kind}-${now}`,
    name: kind === 'daily' ? '15 минут бесплатно' : 'Пробный доступ',
    url,
    isTrial: true,
    ...(kind === 'daily' ? { daily: true } : { guest: true }),
    addedAt: now,
    expiresAt,
    lastUpdated: now,
    servers: servers || [],
    userInfo: userInfo || null,
  }
}

// Истёкшие пробные подписки (не подписка аккаунта): { kept, expired }.
function splitExpiredTrials(subs, now = Date.now()) {
  const kept = []
  const expired = []
  for (const s of Array.isArray(subs) ? subs : []) {
    const exp = toMs(s?.expiresAt)
    if (s && s.isTrial && !s.managed && exp != null && exp <= now) expired.push(s)
    else kept.push(s)
  }
  return { kept, expired }
}

// Ближайшее окончание пробной подписки (для точного таймера), null — нет.
function nextTrialExpiry(subs, now = Date.now()) {
  let next = null
  for (const s of Array.isArray(subs) ? subs : []) {
    const exp = toMs(s?.expiresAt)
    if (s && s.isTrial && !s.managed && exp != null && exp > now && (next == null || exp < next)) next = exp
  }
  return next
}

// Что оставить при синхронизации с аккаунтом: свои подписки (не аккаунта, не
// гостевые) и «15 минут бесплатно», пока у аккаунта нет своей ссылки.
function keepOnSync(subs, accountHasLink) {
  return (Array.isArray(subs) ? subs : []).filter(s => {
    if (!s || s.managed) return false
    if (s.isTrial) return !!s.daily && !accountHasLink
    return true
  })
}

module.exports = {
  DAY, DEFAULT_MINUTES,
  guestMinutes, serverGuestEnabled, normalizeGuest, localRetryAt, retryFromResponse,
  expiryFromResponse, buildTrialSub, splitExpiredTrials, nextTrialExpiry, keepOnSync,
}
