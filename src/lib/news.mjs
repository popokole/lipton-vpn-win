// Новости: подпись-чип, дата, непрочитанные (хранятся локально, на этом ПК).
// Чистые функции — проверяются node --test (tests/renderer-lib.test.mjs).

const DAY = 24 * 60 * 60 * 1000

// Категории анонсов сервиса. TODO(redesign): у /news пока нет поля category
// (Обновление / Тариф / Совет) — когда бэкенд его отдаст, чип возьмётся отсюда.
const CATEGORY = {
  update: { label: 'Обновление', tone: 'emerald' },
  tariff: { label: 'Тариф', tone: 'violet' },
  tip: { label: 'Совет', tone: 'cyan' },
  incident: { label: 'Сбой', tone: 'orange' },
}

export const newsKey = item => String(item?.id ?? '')

// Чип карточки: категория, если бэкенд её отдал, иначе — источник новости.
export function newsTag(item) {
  const c = CATEGORY[String(item?.category || item?.kind || '').toLowerCase()]
  if (c) return c
  const src = String(item?.source_name || '').trim()
  if (!src || /lipton/i.test(src)) return { label: 'Lipton VPN', tone: 'emerald' }
  return { label: src, tone: 'cyan' }
}

function toMs(v) {
  if (v == null || v === '') return null
  const t = typeof v === 'number' ? v : new Date(v).getTime()
  return Number.isNaN(t) ? null : t
}

// «7 октября», в другом году — «7 октября 2025».
export function fmtNewsDate(value, now = Date.now()) {
  const t = toMs(value)
  if (t == null) return ''
  const d = new Date(t)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString('ru-RU', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' })
}

// Непрочитанные: не открывали и опубликованы за последние windowDays дней
// (старые новости при первом запуске не горят все разом).
export function unreadKeys(items, readIds, now = Date.now(), windowDays = 14) {
  const read = new Set((Array.isArray(readIds) ? readIds : []).map(String))
  return (Array.isArray(items) ? items : [])
    .filter(it => {
      const k = newsKey(it)
      if (!k || read.has(k)) return false
      const t = toMs(it.published_at)
      return t != null && now - t <= windowDays * DAY
    })
    .map(newsKey)
}

// Список прочитанных после «Прочитать всё» / открытия новости (без дублей, свежие — в конце).
export function markRead(readIds, keys) {
  const out = (Array.isArray(readIds) ? readIds : []).map(String)
  for (const k of (Array.isArray(keys) ? keys : [keys]).map(String)) {
    if (k && !out.includes(k)) out.push(k)
  }
  return out.slice(-300)
}

// «обновлено N мин назад».
export function agoLabel(value, now = Date.now()) {
  const t = toMs(value)
  if (t == null) return ''
  const m = Math.max(0, Math.round((now - t) / 60000))
  if (m < 1) return 'обновлено только что'
  if (m < 60) return `обновлено ${m} мин назад`
  const h = Math.round(m / 60)
  return `обновлено ${h} ч назад`
}
