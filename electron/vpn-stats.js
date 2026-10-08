// Статистика VPN для плиток главной (на этом компьютере):
//   • скорость и байты текущей сессии — поток clash_api /traffic ядра sing-box
//     (раз в секунду «сколько байт прошло за секунду»);
//   • пинг через ядро раз в минуту — спарклайн «Пинг за час»;
//   • итоги по дням (settings.trafficDaily, последние 7 дней) — «Сегодня» и «За неделю».
//
// Модуль без Electron и сети: время, загрузка и сохранение передаются снаружи,
// поэтому логика покрыта юнит-тестами (tests/vpn-stats.test.js).

const KEEP_DAYS = 7
const SPEED_POINTS = 30     // секунд в истории скорости (столбики «Скорость»)
const PING_POINTS = 60      // замеров пинга — раз в минуту, то есть час
const FLUSH_MS = 60_000     // как часто сохранять итоги дня на диск
const DAY_MS = 24 * 60 * 60 * 1000

const pad = n => String(n).padStart(2, '0')

// Ключ дня по местному времени: «2026-10-08».
function dayKey(t) {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Начало местного дня (полночь) со сдвигом на offset дней.
function dayStart(t, offset = 0) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d.getTime()
}

const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0)

// Итоги по дням из settings: только корректные записи { 'YYYY-MM-DD': { up, down } }.
function normalizeDaily(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== 'object') continue
    const up = num(v.up)
    const down = num(v.down)
    if (up || down) out[k] = { up, down }
  }
  return out
}

function addToDaily(daily, key, up, down) {
  const cur = daily[key] || { up: 0, down: 0 }
  return { ...daily, [key]: { up: cur.up + num(up), down: cur.down + num(down) } }
}

// Оставляет только последние keep дней (включая сегодня).
function pruneDaily(daily, now, keep = KEEP_DAYS) {
  const keys = new Set()
  for (let i = 0; i < keep; i++) keys.add(dayKey(dayStart(now, -i)))
  const out = {}
  for (const [k, v] of Object.entries(daily || {})) if (keys.has(k)) out[k] = v
  return out
}

// Последние days дней от старого к сегодняшнему: [{ key, date, up, down, total }].
function weekSeries(daily, now, days = KEEP_DAYS) {
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const date = dayStart(now, -i)
    const key = dayKey(date)
    const v = (daily && daily[key]) || { up: 0, down: 0 }
    out.push({ key, date, up: v.up, down: v.down, total: v.up + v.down })
  }
  return out
}

// Разбор потока /traffic: JSON-объекты, каждый на своей строке. Куски приходят
// как попало — незаконченная строка остаётся в rest до следующего куска.
function parseTrafficChunk(rest, chunk) {
  let buf = String(rest || '') + String(chunk || '')
  const samples = []
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    try {
      const j = JSON.parse(line)
      samples.push({ up: num(j.up), down: num(j.down) })
    } catch { /* обрывок или мусор — пропускаем */ }
  }
  if (buf.length > 64 * 1024) buf = '' // защита от бесконечной строки
  return { samples, rest: buf }
}

/**
 * @param {object} [o]
 * @param {() => number} [o.now]       текущее время
 * @param {() => object} [o.load]      итоги по дням из settings
 * @param {(daily: object) => void} [o.save]
 * @param {number} [o.flushMs]
 */
function createStats({ now = Date.now, load = () => null, save = () => {}, flushMs = FLUSH_MS } = {}) {
  let daily = null
  let dirty = false
  let lastFlush = now()
  let connectedAt = null
  let live = false
  let session = { up: 0, down: 0 }
  let speed = []
  let ping = []

  const ensureDaily = () => {
    if (!daily) {
      try { daily = normalizeDaily(load()) } catch { daily = {} }
    }
    return daily
  }

  function flush() {
    if (!dirty) return
    const t = now()
    daily = pruneDaily(ensureDaily(), t)
    dirty = false
    lastFlush = t
    try { save(daily) } catch { /* диск занят — сохраним в следующий раз */ }
  }

  return {
    // Новая сессия VPN: таймер, байты, история скорости и пинга — с нуля.
    start(at = now(), { live: isLive = true } = {}) {
      connectedAt = at
      live = !!isLive
      session = { up: 0, down: 0 }
      speed = []
      ping = []
    },

    stop() {
      flush()
      connectedAt = null
      live = false
      speed = []
    },

    // Сэмпл потока /traffic: байт за последнюю секунду.
    addTraffic(up, down) {
      if (connectedAt == null) return
      const u = num(up)
      const d = num(down)
      const t = now()
      session = { up: session.up + u, down: session.down + d }
      speed.push({ t, up: u, down: d })
      if (speed.length > SPEED_POINTS) speed = speed.slice(-SPEED_POINTS)
      if (u || d) {
        daily = addToDaily(ensureDaily(), dayKey(t), u, d)
        dirty = true
      }
      if (t - lastFlush >= flushMs) flush()
    },

    // Замер пинга через ядро; null — сервер не ответил.
    addPing(ms) {
      if (connectedAt == null) return
      const v = Number.isFinite(Number(ms)) && ms != null && Number(ms) > 0 ? Math.round(Number(ms)) : null
      ping.push({ t: now(), ms: v })
      if (ping.length > PING_POINTS) ping = ping.slice(-PING_POINTS)
    },

    flush,

    snapshot() {
      const t = now()
      const d = ensureDaily()
      const last = speed[speed.length - 1]
      const lastPing = [...ping].reverse().find(p => p.ms != null)
      const week = weekSeries(d, t)
      const today = week[week.length - 1]
      return {
        connectedAt,
        live: live && connectedAt != null,
        session: { ...session },
        // скорость «сейчас» — если сэмпл свежий (поток не оборвался)
        speed: last && t - last.t < 3000 ? { up: last.up, down: last.down } : { up: 0, down: 0 },
        speedHistory: speed.map(s => ({ up: s.up, down: s.down })),
        ping: lastPing ? lastPing.ms : null,
        pingHistory: ping.map(p => ({ t: p.t, ms: p.ms })),
        today: { up: today.up, down: today.down },
        week,
      }
    },
  }
}

module.exports = {
  createStats,
  dayKey,
  dayStart,
  normalizeDaily,
  addToDaily,
  pruneDaily,
  weekSeries,
  parseTrafficChunk,
  KEEP_DAYS,
  SPEED_POINTS,
  PING_POINTS,
  DAY_MS,
}
