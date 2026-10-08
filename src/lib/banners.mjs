// Баннеры и экраны из админки (GET /app/banners): что показать сейчас.
// Чистые функции — проверяются node --test.
//
// banner: { id, kind: 'banner'|'screen'|'update', style: 'info'|'promo'|'warning',
//           title, text, cta_text, cta_url, dismissible, priority, starts_at, ends_at }

function toMs(v) {
  if (v == null || v === '') return null
  const t = typeof v === 'number' ? v : new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

// Сравнение версий «2.1.0» < «2.10.0»; мусор → 0. -1 | 0 | 1.
export function compareVersions(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split(/[.-]/).map(n => parseInt(n, 10) || 0)
  const pb = String(b || '').replace(/^v/i, '').split(/[.-]/).map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

// Версия ниже минимальной из /config.min_app_versions.windows — нужно обновиться.
export function belowMinVersion(version, config) {
  const min = config?.min_app_versions?.windows
  if (!min || !version) return false
  return compareVersions(version, min) < 0
}

const KINDS = ['banner', 'screen', 'update']
const STYLES = ['info', 'promo', 'warning']

// Ссылка кнопки: только https (или пусто).
export function safeUrl(u) {
  const s = String(u || '').trim()
  return /^https:\/\/[^\s]+$/i.test(s) ? s : ''
}

// Нормализованные активные баннеры по приоритету (больше — выше).
// dismissed — закрытые пользователем id (только для dismissible).
export function activeBanners(list, { now = Date.now(), dismissed = [] } = {}) {
  const closed = new Set((dismissed || []).map(String))
  return (Array.isArray(list) ? list : [])
    .filter(b => b && b.id != null && (b.title || b.text))
    .map(b => ({
      id: String(b.id),
      kind: KINDS.includes(b.kind) ? b.kind : 'banner',
      style: STYLES.includes(b.style) ? b.style : 'info',
      title: String(b.title || ''),
      text: String(b.text || ''),
      ctaText: String(b.cta_text || ''),
      ctaUrl: safeUrl(b.cta_url),
      // обязательное обновление закрыть нельзя, остальное — по флагу (по умолчанию можно)
      dismissible: b.dismissible !== false,
      priority: Number(b.priority) || 0,
      startsAt: toMs(b.starts_at),
      endsAt: toMs(b.ends_at),
    }))
    .filter(b => (b.startsAt == null || b.startsAt <= now) && (b.endsAt == null || b.endsAt > now))
    .filter(b => !(b.dismissible && closed.has(b.id)))
    .sort((a, b) => b.priority - a.priority)
}

// Раскладка: blocking — обязательное обновление (на весь экран), screen — первый
// модальный экран, slot — баннеры над главной (в т.ч. необязательное обновление).
export function layoutBanners(list) {
  const items = Array.isArray(list) ? list : []
  const blocking = items.find(b => b.kind === 'update' && !b.dismissible) || null
  const screen = items.find(b => b.kind === 'screen') || null
  const slot = items.filter(b => b.kind === 'banner' || (b.kind === 'update' && b.dismissible))
  return { blocking, screen, slot }
}
