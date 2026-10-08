// Плитки главной: форматирование статистики (ГБ, Мбит/с, пинг), спарклайн,
// столбики недели и «что видят сайты» из «Проверки соединения».
// Чистые функции — проверяются node --test (tests/renderer-lib.test.mjs).

const GB = 1024 ** 3
const MB = 1024 ** 2
const KB = 1024

// Число по-русски: 1.8 → «1,8». digits — знаков после запятой (лишние нули убираем).
export function fmtNum(v, digits = 1) {
  const n = Number(v) || 0
  return n.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

// Байты → { value: '1,8', unit: 'ГБ' }.
export function fmtBytes(bytes) {
  const b = Math.max(0, Number(bytes) || 0)
  if (b >= GB) return { value: fmtNum(b / GB, b >= 100 * GB ? 0 : 1), unit: 'ГБ' }
  if (b >= MB) return { value: fmtNum(b / MB, b >= 100 * MB ? 0 : 1), unit: 'МБ' }
  if (b >= KB) return { value: fmtNum(b / KB, 0), unit: 'КБ' }
  return { value: '0', unit: 'МБ' }
}

export function fmtBytesText(bytes) {
  const f = fmtBytes(bytes)
  return `${f.value} ${f.unit}`
}

// Байт в секунду → мегабит в секунду.
export const toMbps = bps => (Math.max(0, Number(bps) || 0) * 8) / 1e6

// Скорость: «186,4» Мбит/с; меньше 0,1 — две цифры после запятой.
export function fmtMbps(bps) {
  const m = toMbps(bps)
  if (m <= 0) return '0'
  if (m < 0.1) return fmtNum(m, 2)
  return fmtNum(m, m >= 1000 ? 0 : 1)
}

// Стабильность пинга по истории замеров (null — нет ответа).
// → { label, tone: 'ok' | 'warn' | 'bad' } или null, если данных мало.
export function pingStability(history) {
  const list = (Array.isArray(history) ? history : []).slice(-15)
  const vals = list.map(p => (p && typeof p === 'object' ? p.ms : p)).filter(v => v != null)
  const lost = list.length - vals.length
  if (lost >= 2) return { label: 'есть потери', tone: 'bad' }
  if (vals.length < 3) return null
  let sum = 0
  for (let i = 1; i < vals.length; i++) sum += Math.abs(vals[i] - vals[i - 1])
  const jitter = sum / (vals.length - 1)
  if (jitter <= 12) return { label: 'стабильно', tone: 'ok' }
  if (jitter <= 40) return { label: 'колеблется', tone: 'warn' }
  return { label: 'нестабильно', tone: 'bad' }
}

// Точки спарклайна в прямоугольнике w×h (отступ pad по краям). Пропуски (null)
// не рисуются, но место по оси X за ними сохраняется.
// → { line: 'x,y x,y', area: 'x,y … x,h x0,h', last: { x, y } } или null.
export function sparkline(values, w, h, pad = 4) {
  const v = (Array.isArray(values) ? values : []).map(x => (x == null || !Number.isFinite(Number(x)) ? null : Number(x)))
  const real = v.filter(x => x != null)
  if (real.length < 2) return null
  const min = Math.min(...real)
  const max = Math.max(...real)
  const span = max - min || 1
  const stepX = (w - pad * 2) / Math.max(1, v.length - 1)
  const pts = []
  v.forEach((x, i) => {
    if (x == null) return
    const px = pad + i * stepX
    // чем больше пинг, тем выше точка; ровная линия — посередине
    const py = max === min ? h / 2 : pad + (1 - (x - min) / span) * (h - pad * 2)
    pts.push([Math.round(px * 100) / 100, Math.round(py * 100) / 100])
  })
  const line = pts.map(p => p.join(',')).join(' ')
  const first = pts[0]
  const last = pts[pts.length - 1]
  return { line, area: `${line} ${last[0]},${h} ${first[0]},${h}`, last: { x: last[0], y: last[1] } }
}

// Высоты столбиков: максимум — maxH, ненулевые не ниже minH, нули — zeroH.
export function barHeights(values, maxH, minH = 3, zeroH = 3) {
  const v = (Array.isArray(values) ? values : []).map(x => Math.max(0, Number(x) || 0))
  const max = Math.max(0, ...v)
  return v.map(x => (x <= 0 || max <= 0 ? zeroH : Math.max(minH, Math.round((x / max) * maxH))))
}

// Высоты по размаху (минимум → minH, максимум → maxH): для пинга, где все
// значения близки и «от нуля» столбики вышли бы одинаковыми. 0/null — zeroH.
export function rangeHeights(values, maxH, minH = 8, zeroH = 4) {
  const v = (Array.isArray(values) ? values : []).map(x => (x == null ? 0 : Math.max(0, Number(x) || 0)))
  const real = v.filter(x => x > 0)
  if (!real.length) return v.map(() => zeroH)
  const lo = Math.min(...real)
  const hi = Math.max(...real)
  return v.map(x => {
    if (x <= 0) return zeroH
    if (hi === lo) return Math.round((minH + maxH) / 2)
    return Math.round(minH + ((x - lo) / (hi - lo)) * (maxH - minH))
  })
}

// Последние n значений, слева дополненные нулями (для столбиков фиксированной ширины).
export function lastN(values, n) {
  const v = (Array.isArray(values) ? values : []).slice(-n)
  return [...Array(Math.max(0, n - v.length)).fill(0), ...v]
}

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

// Подписи столбиков недели: «Пт Сб … Чт», последний — сегодня.
export function weekLabels(week) {
  return (Array.isArray(week) ? week : []).map(d => WEEKDAYS[new Date(d.date).getDay()])
}

// «2–8 октября» или «28 сентября – 4 октября»; short — «2–8 окт.».
export function weekRange(week, short = false) {
  const w = Array.isArray(week) ? week : []
  if (!w.length) return ''
  const a = new Date(w[0].date)
  const b = new Date(w[w.length - 1].date)
  const month = d => short
    ? d.toLocaleDateString('ru-RU', { month: 'short' })
    : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(/^\d+\s/, '')
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${month(b)}`
  return `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)}`
}

// Сегодня против среднего за прошлые дни с трафиком: +28 (процентов) или null.
export function vsAverage(week) {
  const w = Array.isArray(week) ? week : []
  if (w.length < 2) return null
  const today = w[w.length - 1].total
  const prev = w.slice(0, -1).map(d => d.total).filter(t => t > 0)
  if (!prev.length || today <= 0) return null
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length
  return Math.round((today / avg - 1) * 100)
}

// Среднее за день по дням с трафиком (для пунктира «ср.»).
export function weekAverage(week) {
  const days = (Array.isArray(week) ? week : []).map(d => d.total).filter(t => t > 0)
  if (!days.length) return 0
  return days.reduce((a, b) => a + b, 0) / days.length
}

// «Что видят сайты» и «Защита» из результата проверки.
//   check — полная «Проверка соединения» через VPN (items) или проверка без VPN (kind: 'direct')
//   on    — VPN включён
// → { state: 'unknown'|'checking'|'ok', country, countryName, ip, exposed, leaks, items: [{ ok, label }], active }
export function exposureView(check, { on = false } = {}) {
  if (!check) {
    return { state: on ? 'checking' : 'unknown', country: '', countryName: '', ip: '', exposed: !on, leaks: 0, items: [], active: false }
  }
  if (check.kind === 'direct') {
    const items = [
      { ok: false, label: check.ipv6 ? 'IPv6 открыт' : 'IP открыт' },
      { ok: false, label: 'DNS провайдера' },
    ]
    return {
      state: check.ok ? 'ok' : 'unknown',
      country: check.country || '',
      countryName: check.countryName || '',
      ip: check.ip || '',
      exposed: true,
      leaks: items.length,
      items,
      active: false,
    }
  }
  const byId = id => (check.items || []).find(i => i.id === id)
  const site = byId('cloudflare') && byId('cloudflare').country ? byId('cloudflare') : byId('chatgpt')
  const ipv6 = byId('ipv6')
  const dns = byId('dns')
  const items = []
  if (ipv6) items.push({ ok: ipv6.status === 'ok', label: ipv6.status === 'ok' ? 'IPv6 закрыт' : 'IPv6 открыт' })
  if (dns) {
    const label = dns.status === 'ok' ? 'DNS через VPN'
      : dns.value === 'Провайдера' ? 'DNS провайдера'
        : dns.status === 'warn' && dns.value === 'Мимо VPN' ? 'DNS мимо VPN'
          : 'DNS не проверен'
    items.push({ ok: dns.status === 'ok', label })
  }
  const siteRu = site && site.country === 'RU'
  const leaks = items.filter(i => !i.ok && i.label !== 'DNS не проверен').length + (siteRu ? 1 : 0)
  return {
    state: site || items.length ? 'ok' : 'unknown',
    country: (site && site.country) || '',
    countryName: (site && site.country && site.value) || '',
    ip: (site && (site.ip || String(site.detail || '').replace(/^IP\s+/, ''))) || '',
    exposed: !!siteRu,
    leaks,
    items,
    active: on && !siteRu,
  }
}
