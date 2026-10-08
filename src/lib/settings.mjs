// Настройки: подписи устройств и аккаунта. Чистые функции — node --test.

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN

function toMs(v) {
  if (v == null || v === '') return null
  const t = typeof v === 'number' ? v : new Date(v).getTime()
  return Number.isNaN(t) ? null : t
}

const hhmm = d => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

// Последняя активность устройства: «в сети» / «сегодня в 14:02» / «вчера в 22:14» / «3 октября».
export function lastSeenLabel(value, now = Date.now()) {
  const t = toMs(value)
  if (t == null) return ''
  if (now - t < 15 * MIN) return 'в сети'
  const d = new Date(t)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (t >= start.getTime()) return `сегодня в ${hhmm(d)}`
  if (t >= start.getTime() - DAY) return `вчера в ${hhmm(d)}`
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString('ru-RU', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' })
}

// Устройство из /me/devices → { title, platform, desktop }.
export function deviceInfo(dev) {
  const platform = String(dev?.platform || '').trim()
  const model = String(dev?.model || '').trim()
  const app = String(dev?.app || '').trim()
  const desktop = /windows|mac|linux|desktop/i.test(platform)
  const name = [platform, model].filter(Boolean).join(' · ') || app || 'Устройство'
  return { title: app && !desktop && model ? `${model} · ${app}` : name, platform: platform || 'Устройство', desktop }
}

// «с марта 2026».
export function sinceLabel(value) {
  const t = toMs(value)
  if (t == null) return ''
  const d = new Date(t)
  const month = d.toLocaleDateString('ru-RU', { month: 'long' })
  // родительный падеж месяца: «марта», «мая» — берём из полной даты
  const gen = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(/^\d+\s/, '')
  return `с ${gen || month} ${d.getFullYear()}`
}

// Первая буква для аватара-заглушки.
export function initialOf(text) {
  const s = String(text || '').trim()
  return s ? s[0].toUpperCase() : 'L'
}

// Склонение «домен»: 1 домен, 3 домена, 5 доменов.
export function domainsWord(n) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return 'доменов'
  if (b > 1 && b < 5) return 'домена'
  if (b === 1) return 'домен'
  return 'доменов'
}

// Свои домены приходят строками (старый формат) или { domain, addedAt } (после миграции).
export const domainName = d => (d && typeof d === 'object' ? String(d.domain || '') : String(d || ''))

// Текст подтверждения отмены подписки (как на сайте): что сгорит и что отключится.
export function cancelWarning({ daysLeft = 0, untilLabel = '', hasCard = false } = {}) {
  const parts = ['Подписка закончится сразу.']
  parts.push(daysLeft > 0
    ? `Оставшиеся ${daysLeft} дн.${untilLabel ? ` (${untilLabel})` : ''} сгорят — деньги не возвращаются.`
    : 'Деньги не возвращаются.')
  parts.push(hasCard ? 'Привязанная карта будет удалена, автопродление отключится.' : 'Автопродление отключится.')
  parts.push('VPN перестанет работать на всех устройствах. Купить подписку снова можно в любой момент.')
  return parts.join(' ')
}
