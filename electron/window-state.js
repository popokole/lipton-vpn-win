// Состояние главного окна: тема и сохранённые размер/положение.
// Чистые функции — без electron, чтобы их можно было проверить node --test.

const THEMES = ['dark', 'light', 'system']
// По умолчанию — «Системная» (как в плане редизайна; ждёт подтверждения владельца).
const DEFAULT_THEME = 'system'

const DEFAULT_SIZE = { width: 960, height: 620 }
const MIN_SIZE = { width: 880, height: 580 }

// Фон окна до загрузки страницы — под тему, чтобы при старте не мигало.
const THEME_BG = { dark: '#050807', light: '#F3F1EC' }

function normalizeTheme(v) {
  return THEMES.includes(v) ? v : DEFAULT_THEME
}

function themeBackground(effective) {
  return effective === 'light' ? THEME_BG.light : THEME_BG.dark
}

const num = v => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)

// Пересечение прямоугольников (площадь), чтобы понять, видно ли окно на экране.
function overlap(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? { w, h } : null
}

// sanitizeBounds — что из сохранённого можно применить к окну.
// workAreas — рабочие области мониторов ({x, y, width, height}).
// Размер не меньше минимального и не больше самого большого монитора; положение —
// только если полоса заголовка окна (хотя бы 120×40) видна на каком-то мониторе,
// иначе окно откроется по центру (например, после отключения второго монитора).
function sanitizeBounds(saved, workAreas = []) {
  const out = { width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height, maximized: false }
  if (!saved || typeof saved !== 'object') return out

  const areas = (workAreas || []).filter(a => a && a.width > 0 && a.height > 0)
  const maxW = areas.length ? Math.max(...areas.map(a => a.width)) : Infinity
  const maxH = areas.length ? Math.max(...areas.map(a => a.height)) : Infinity

  const w = num(saved.width)
  const h = num(saved.height)
  if (w) out.width = Math.min(Math.max(w, MIN_SIZE.width), Math.max(maxW, MIN_SIZE.width))
  if (h) out.height = Math.min(Math.max(h, MIN_SIZE.height), Math.max(maxH, MIN_SIZE.height))
  out.maximized = saved.maximized === true

  const x = num(saved.x)
  const y = num(saved.y)
  if (x !== null && y !== null && areas.length) {
    const titleStrip = { x, y, width: out.width, height: 40 }
    const visible = areas.some(a => {
      const o = overlap(titleStrip, a)
      return o && o.w >= 120 && o.h >= 40
    })
    if (visible) { out.x = x; out.y = y }
  }
  return out
}

// Что сохраняем: нормальные (не развёрнутые) границы + флаг «развёрнуто».
function boundsToSave(normalBounds, maximized) {
  const b = normalBounds || {}
  return {
    x: num(b.x), y: num(b.y),
    width: num(b.width) || DEFAULT_SIZE.width,
    height: num(b.height) || DEFAULT_SIZE.height,
    maximized: maximized === true,
  }
}

module.exports = {
  THEMES, DEFAULT_THEME, DEFAULT_SIZE, MIN_SIZE, THEME_BG,
  normalizeTheme, themeBackground, sanitizeBounds, boundsToSave,
}
