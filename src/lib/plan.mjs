// Сводка по подписке для карточки тарифа в меню и плиток: название, сколько
// дней осталось, «до 1 ноября», прогресс, статус словами бота.
// Чистые функции — проверяются node --test (tests/renderer-lib.test.mjs).

const DAY = 24 * 60 * 60 * 1000

// Статусы — как в боте: «активна», «пробный период», «истекла».
export const STATUS_LABEL = {
  active: 'активна',
  grace: 'активна',
  trial: 'пробный период',
  expired: 'истекла',
  inactive: 'нет подписки',
  guest: 'пробный доступ',
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

export const daysWord = n => plural(n, 'день', 'дня', 'дней')

export function fmtDayMonth(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

export function fmtClock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

export function fmtMinSec(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

// Тариф «Обход глушилок»: код задаётся в админке, поэтому смотрим и на название.
export function isBypassTariff(title, code) {
  return /обход/i.test(String(title || '')) || /bypass|obhod/i.test(String(code || ''))
}

// Длина оплаченного периода для полосы «24 из 30 дней»: самый короткий период
// тарифа, в который помещается остаток (купленный период сервер не отдаёт).
export function guessPeriodDays(tariff, daysLeft = 0) {
  const fixed = Number(tariff?.period_days)
  if (fixed > 0) return fixed
  const days = (Array.isArray(tariff?.periods) ? tariff.periods : [])
    .map(p => Number(p?.days))
    .filter(d => d > 0)
    .sort((a, b) => a - b)
  return days.find(d => d >= daysLeft) || days[days.length - 1] || 30
}

function toMs(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? null : t
}

// planSummary — что показать в карточке тарифа.
//   subscriptions — из settings (managed — подписка аккаунта, isTrial без managed — гостевой тест-доступ)
//   view — ответ /me/subscription (может быть ещё не загружен)
//   config — /config (тарифы с code/title/period_days)
// Результат: { kind, title, statusLabel, daysLeft, until, untilLabel, progress, msLeft, totalMs, bypass }
//   kind: 'active' | 'trial' | 'expired' | 'none' | 'guest'
export function planSummary({ subscriptions = [], view = null, config = null, guest = false, now = Date.now() } = {}) {
  const subs = Array.isArray(subscriptions) ? subscriptions : []
  const managed = subs.find(s => s && s.managed)
  const testSub = subs.find(s => s && s.isTrial && !s.managed)
  const tariffs = (config && Array.isArray(config.tariffs)) ? config.tariffs : []

  // Гостевой тест-доступ (без аккаунта)
  if (!managed && testSub && (guest || !view)) {
    const until = toMs(testSub.expiresAt)
    const total = until && testSub.addedAt ? Math.max(until - toMs(testSub.addedAt), 1) : null
    const msLeft = until ? Math.max(0, until - now) : 0
    return {
      kind: 'guest', title: 'Пробный доступ', statusLabel: STATUS_LABEL.guest,
      daysLeft: 0, until, untilLabel: '', msLeft, totalMs: total,
      progress: total ? Math.max(0, Math.min(1, msLeft / total)) : 0, bypass: false,
      code: null, periodDays: 0, priceKopeks: null, canceled: false,
    }
  }

  const status = view?.status || managed?.status || (managed ? 'active' : 'inactive')
  const hasAccess = !!(view ? view.subscription_url || ['active', 'grace', 'trial'].includes(view.status) : managed)
  const overlay = view?.overlay || managed?.overlay || null
  const code = view?.tariff_code || null
  const tariff = code ? tariffs.find(t => t && t.code === code) : null
  const until = toMs(view?.current_period_end) ?? toMs(managed?.expiresAt)
  const msLeft = until ? Math.max(0, until - now) : 0
  const daysLeft = until ? Math.max(0, Math.ceil((until - now) / DAY)) : 0
  const periodDays = guessPeriodDays(tariff, daysLeft)
  const title = overlay?.tariff_title || tariff?.title || (status === 'trial' ? 'Пробный период' : 'Подписка')

  let kind
  if (!hasAccess || status === 'inactive') kind = 'none'
  else if (status === 'expired' || (until && until <= now)) kind = 'expired'
  else if (status === 'trial') kind = 'trial'
  else kind = 'active'

  return {
    kind,
    title: kind === 'none' ? 'Нет подписки' : title,
    statusLabel: kind === 'none' ? STATUS_LABEL.inactive : (STATUS_LABEL[kind] || STATUS_LABEL.active),
    daysLeft,
    until,
    untilLabel: until ? `до ${fmtDayMonth(until)}` : '',
    msLeft,
    totalMs: periodDays * DAY,
    progress: kind === 'active' || kind === 'trial' ? Math.max(0, Math.min(1, daysLeft / periodDays)) : 0,
    bypass: (kind === 'active' || kind === 'trial') && isBypassTariff(title, code),
    code,
    periodDays,
    // цена текущего срока из /config (купленный срок сервер не отдаёт — берём подходящий)
    priceKopeks: tariffInfo(config, code, periodDays).priceKopeks,
    canceled: !!view?.canceled,
  }
}

// Палитра свечения и цвета состояния: подключено — изумруд (или сине-фиолетовая
// у тарифа «Обход глушилок»), всё остальное — рыжая «не защищено».
export function glowPalette(vpnStatus, plan) {
  const on = vpnStatus === 'connected' || vpnStatus === 'reconnecting'
  if (!on) return 'off'
  return plan?.bypass ? 'bypass' : 'active'
}

// Подпись состояния в hero (капсом, как в макетах).
export const CONNECTION_LABEL = {
  connected: 'Защищено',
  connecting: 'Подключение',
  reconnecting: 'Переподключение',
  disconnecting: 'Отключение',
  disconnected: 'Не защищено',
  error: 'Ошибка подключения',
  'kill-switch': 'Kill Switch активен',
}

export function connectionLabel(status) {
  return CONNECTION_LABEL[status] || CONNECTION_LABEL.disconnected
}

// Рубли из копеек: 15900 → «159 ₽», 19950 → «199,5 ₽».
export function rub(kopeks) {
  const v = (Number(kopeks) || 0) / 100
  return `${v.toLocaleString('ru-RU', { maximumFractionDigits: v % 1 ? 2 : 0 })} ₽`
}

// Тариф подписки и цена текущего срока: { tariff, periodDays, priceKopeks }.
export function tariffInfo(config, code, periodDays) {
  const tariffs = (config && Array.isArray(config.tariffs)) ? config.tariffs : []
  const tariff = code ? tariffs.find(t => t && t.code === code) || null : null
  const periods = Array.isArray(tariff?.periods) ? tariff.periods : []
  const period = periods.find(p => Number(p?.days) === Number(periodDays)) || null
  const priceKopeks = period?.price_kopeks ?? (Number(tariff?.period_days) === Number(periodDays) ? tariff?.price_kopeks : null) ?? null
  return { tariff, periodDays, priceKopeks: priceKopeks == null ? null : Number(priceKopeks) }
}

// Предложение «Обход глушилок» для баннера в Серверах: самый короткий срок тарифа.
// → { code, title, days, priceKopeks } или null, если такого тарифа нет.
export function bypassOffer(config) {
  const tariffs = (config && Array.isArray(config.tariffs)) ? config.tariffs : []
  const t = tariffs.find(x => x && isBypassTariff(x.title, x.code))
  if (!t) return null
  const periods = (Array.isArray(t.periods) ? t.periods : []).filter(p => Number(p?.days) > 0)
    .sort((a, b) => a.days - b.days)
  const p = periods[0]
  const days = p ? Number(p.days) : Number(t.period_days) || 30
  const priceKopeks = p ? Number(p.price_kopeks) : Number(t.price_kopeks) || null
  return { code: t.code, title: t.title || 'Обход глушилок', days, priceKopeks }
}

// Самая дешёвая месячная подписка (для «от 159 ₽/мес»): срок 28–31 день;
// если месячных сроков нет — самый дешёвый срок в пересчёте на 30 дней.
export function cheapestMonthly(config) {
  const tariffs = (config && Array.isArray(config.tariffs)) ? config.tariffs : []
  let month = null
  let perMonth = null
  for (const t of tariffs) {
    for (const p of (Array.isArray(t?.periods) ? t.periods : [])) {
      const d = Number(p?.days)
      const k = Number(p?.price_kopeks)
      if (!(d > 0 && k > 0)) continue
      if (d >= 28 && d <= 31 && (month == null || k < month)) month = k
      const m = Math.round((k / d) * 30 / 100) * 100
      if (perMonth == null || m < perMonth) perMonth = m
    }
  }
  return month ?? perMonth
}
