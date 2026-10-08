// Подэкраны настроек (макеты new-scr-*): история платежей, логи, домены,
// способ оплаты, промокод. Чистые функции — проверяются node --test.

import { plural, rub, daysWord } from './plan.mjs'

function toMs(v) {
  if (v == null || v === '') return null
  const t = typeof v === 'number' ? v : new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

const dayMonth = t => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const hhmm = t => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

// ─── История платежей ───────────────────────────────────────────────────────

// Статус платежа: подпись и тон пилюли.
export function txStatus(status) {
  switch (status) {
    case 'succeeded':
    case 'success': return { label: 'Оплачено', tone: 'ok' }
    case 'refunded': return { label: 'Возврат', tone: 'info' }
    case 'failed':
    case 'canceled': return { label: 'Не прошёл', tone: 'warn' }
    case 'pending': return { label: 'В обработке', tone: 'muted' }
    default: return { label: String(status || '—'), tone: 'muted' }
  }
}

const KIND_TITLE = {
  initial: 'Первая оплата',
  subscription: 'Продление подписки',
  change: 'Смена тарифа',
  overlay: 'Временный тариф',
  manual: 'Оплата',
  service: 'Сервисный платёж',
  imported: 'Оплата (из старого бота)',
  refund: 'Возврат',
}

// Заголовок: «Базовый · 30 дней», «Смена тарифа: Обход»; без данных о тарифе —
// по виду платежа.
export function txTitle(t) {
  const title = String(t?.tariff_title || '').trim()
  const days = Number(t?.period_days)
  if (t?.kind === 'change' && title) return `Смена тарифа: ${title}`
  if (t?.kind === 'overlay' && title) return `Временный тариф: ${title}`
  if (title) return days > 0 ? `${title} · ${days} ${daysWord(days)}` : title
  return KIND_TITLE[t?.kind] || 'Платёж'
}

// Иконка строки по виду: смена тарифа — стрелки, не прошёл — предупреждение.
export function txIcon(t) {
  if (t?.status === 'failed' || t?.status === 'canceled') return 'warning'
  if (t?.status === 'refunded') return 'refresh'
  if (t?.kind === 'change' || t?.kind === 'overlay') return 'updown'
  return 'crown'
}

// «карта •••• 4242» / «СБП» / ''.
export function txMethod(t) {
  if (t?.method === 'sbp') return 'СБП'
  if (t?.card_last4) return `карта •••• ${t.card_last4}`
  if (t?.method === 'card') return 'карта'
  return ''
}

// Подпись под заголовком: «8 октября · карта •••• 4242» (+ « · доплата» у смены).
export function txMeta(t) {
  const at = toMs(t?.created_at)
  return [at ? dayMonth(at) : '', t?.kind === 'change' ? 'доплата' : '', txMethod(t)].filter(Boolean).join(' · ')
}

// Итоги: сколько оплачено (успешные минус возвраты), с какой даты, счётчики.
export function txSummary(list) {
  const items = Array.isArray(list) ? list : []
  let paid = 0
  let ok = 0
  let refunds = 0
  let failed = 0
  let first = null
  for (const t of items) {
    const amount = Number(t?.amount_kopeks) || 0
    const at = toMs(t?.created_at)
    if (t?.status === 'succeeded' || t?.status === 'success') {
      paid += amount
      ok += 1
      if (at && (first == null || at < first)) first = at
    } else if (t?.status === 'refunded') {
      refunds += 1
    } else if (t?.status === 'failed' || t?.status === 'canceled') {
      failed += 1
    }
  }
  return {
    paidKopeks: paid,
    since: first,
    sinceLabel: first ? `с ${new Date(first).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s?г\.$/, '')}` : '',
    chips: [
      ok ? `${ok} ${plural(ok, 'оплата', 'оплаты', 'оплат')}` : '',
      refunds ? `${refunds} ${plural(refunds, 'возврат', 'возврата', 'возвратов')}` : '',
      failed ? `${failed} не ${plural(failed, 'прошёл', 'прошли', 'прошли')}` : '',
    ].filter(Boolean),
    counts: { ok, refunds, failed },
  }
}

// Группы по месяцам (новые сверху): [{ key, label: 'Октябрь' | 'Октябрь 2025', items }].
export function txGroups(list, now = Date.now()) {
  const items = (Array.isArray(list) ? list : [])
    .map(t => ({ t, at: toMs(t?.created_at) || 0 }))
    .sort((a, b) => b.at - a.at)
  const thisYear = new Date(now).getFullYear()
  const groups = []
  for (const { t, at } of items) {
    const d = new Date(at)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) {
      const month = d.toLocaleDateString('ru-RU', { month: 'long' })
      const label = month.charAt(0).toUpperCase() + month.slice(1) + (d.getFullYear() !== thisYear ? ` ${d.getFullYear()}` : '')
      g = { key, label, items: [] }
      groups.push(g)
    }
    g.items.push(t)
  }
  return groups
}

// ─── Логи приложения ────────────────────────────────────────────────────────

// «[14:02:15] [INFO] [VPN] Подключено» → { time, level, tag, text }.
// Формат логгера: «[2026-10-08 14:02:15] [INFO] сообщение» — понимаем оба.
export function parseLogLine(line) {
  const s = String(line || '')
  const m = s.match(/^\[([^\]]+)\]\s*(?:\[(INFO|WARN|ERROR|DEBUG|LOG)\]\s*)?(?:\[([^\]]{1,24})\]\s*)?(.*)$/i)
  if (!m) return { time: '', level: 'info', tag: '', text: s }
  const time = (m[1].match(/(\d{1,2}:\d{2}:\d{2})/) || [m[1]])[0]
  const level = (m[2] || 'INFO').toLowerCase() === 'log' ? 'info' : (m[2] || 'INFO').toLowerCase()
  return { time, level, tag: m[3] || '', text: m[4] || '' }
}

export function logsCountLabel(n) {
  return `${n} ${plural(n, 'запись', 'записи', 'записей')}`
}

// ─── Свои домены ────────────────────────────────────────────────────────────

// «Добавлен 6 октября» / «Добавлен раньше» (домены до 2.2 — без даты).
export function addedLabel(at) {
  const t = toMs(at)
  return t ? `Добавлен ${dayMonth(t)}` : 'Добавлен раньше'
}

// ─── Способ оплаты ──────────────────────────────────────────────────────────

// Карта из /me: { last4, brand, exp, unlinkAt, canUnlink, next: { at, kopeks, days, title } }.
export function cardView(profile, now = Date.now()) {
  const p = profile || {}
  if (!p.has_card) return null
  const unlinkAt = toMs(p.card_unlink_available_at)
  const nextAt = toMs(p.next_charge_at)
  const brand = String(p.card_brand || '').trim()
  return {
    last4: p.card_last4 || '••••',
    brand: brand && !/unknown/i.test(brand) ? brand : '',
    exp: p.card_exp || '',
    autoRenew: p.auto_renew !== false,
    unlinkAt: unlinkAt && unlinkAt > now ? unlinkAt : null,
    next: nextAt ? {
      at: nextAt,
      kopeks: p.next_charge_kopeks != null ? Number(p.next_charge_kopeks) : null,
      days: Number(p.next_charge_period_days) || null,
      title: p.next_charge_tariff_title || '',
    } : null,
  }
}

// «через 24 дня» / «сегодня» / «завтра».
export function inDaysLabel(at, now = Date.now()) {
  const t = toMs(at)
  if (!t) return ''
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const days = Math.floor((t - start.getTime()) / 86400000)
  if (days <= 0) return 'сегодня'
  if (days === 1) return 'завтра'
  return `через ${days} ${daysWord(days)}`
}

// «9 октября в 14:05» — когда снова можно отвязать карту.
export function whenLabel(at) {
  const t = toMs(at)
  return t ? `${dayMonth(t)} в ${hhmm(t)}` : ''
}

// Текст подтверждения отвязки: что будет без отвязки и после неё.
export function unlinkText(card, untilLabel) {
  const next = card?.next
  const parts = []
  if (next?.at) {
    const sum = next.kopeks != null ? ` — ${rub(next.kopeks)}` : ''
    const period = next.days ? ` на ${next.days >= 28 && next.days <= 31 ? 'месяц' : `${next.days} ${daysWord(next.days)}`}` : ''
    parts.push(`Если не отвязать, ${dayMonth(next.at)} подписка продлится${period}${sum}.`)
  }
  parts.push(`После отвязки автопродление выключится, а карта исчезнет из способов оплаты.${untilLabel ? ` Подписка будет работать ${untilLabel}.` : ''}`)
  return parts.join(' ')
}

// ─── Промокод ───────────────────────────────────────────────────────────────

// Что даёт промокод: «−10% на следующую оплату» / «+7 дней к следующей оплате».
export function promoBenefit(p) {
  if (!p) return ''
  if (p.kind === 'percent' && p.percent_off) return `−${p.percent_off}% на следующую оплату`
  if (p.kind === 'days' && p.bonus_days) return `+${p.bonus_days} ${daysWord(p.bonus_days)} к следующей оплате`
  return 'применится при следующей оплате'
}

// Крупно на билете: «−10%» / «+7 дней».
export function promoHeadline(p) {
  if (p?.kind === 'percent' && p.percent_off) return `−${p.percent_off}%`
  if (p?.kind === 'days' && p.bonus_days) return `+${p.bonus_days} ${daysWord(p.bonus_days)}`
  return ''
}
