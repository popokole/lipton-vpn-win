import { useId } from 'react'
import { sparkline, barHeights } from '../../lib/stats.mjs'

// Мини-графики плиток: спарклайн пинга, столбики скорости и недели,
// «палочки сигнала», кольцо. Цвета — от состояния (--st-fill-1/2) через CSS.

// Спарклайн w×h. values — числа или null (пропуск). Пусто — пунктирная линия-заглушка.
export function Sparkline({ values, width = 158, height = 34, idle = false, className = '' }) {
  const gid = `sp${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const s = idle ? null : sparkline(values, width, height, 4)
  if (!s) {
    // заглушка «нет подключения»: ровная тусклая линия и пустая точка на конце
    return (
      <svg className={`ui-spark ui-spark--idle ${className}`} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <polyline points={`4,19 ${width / 4},20 ${width / 2},21 ${(width * 3) / 4},20 ${width - 7},20.5`} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }
  return (
    <svg className={`ui-spark ${className}`} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="ui-spark-stop1" />
          <stop offset="1" className="ui-spark-stop2" />
        </linearGradient>
      </defs>
      <line className="ui-spark-mid" x1="0" y1={height / 2 + 1} x2={width} y2={height / 2 + 1} vectorEffect="non-scaling-stroke" />
      <polygon points={s.area} fill={`url(#${gid})`} />
      <polyline className="ui-spark-line" points={s.line} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// Точка на конце спарклайна рисуется HTML-элементом (не растягивается вместе с SVG).
export function SparkDot({ values, width = 158, height = 34 }) {
  const s = sparkline(values, width, height, 4)
  if (!s) return null
  return <span className="ui-spark-dot" style={{ left: `${(s.last.x / width) * 100}%`, top: s.last.y }} aria-hidden="true" />
}

// Столбики: values — числа; последний подсвечен. idle — серые низкие столбики.
export function Bars({ values, height = 34, idle = false, className = '' }) {
  const hs = barHeights(values, height, 4, idle ? 5 : 3)
  const n = hs.length
  return (
    <div className={`ui-bars${idle ? ' ui-bars--idle' : ''} ${className}`} style={{ height }} aria-hidden="true">
      {hs.map((h, i) => (
        <i
          key={i}
          className={i === n - 1 ? 'is-last' : ''}
          style={{ height: idle ? [6, 8, 5, 8, 6, 9, 6, 8, 6, 8, 5, 3][i % 12] : h, opacity: idle || i === n - 1 ? undefined : 0.35 + (0.6 * i) / Math.max(1, n - 1) }}
        />
      ))}
    </div>
  )
}

// «Палочки сигнала» (4, в легенде — 3): level 0..4, tone ok | warn | bad | muted | none.
export function Signal({ level = 0, tone = 'ok', size = 'md', className = '' }) {
  const hs = size === 'xs' ? [4, 7, 10] : size === 'sm' ? [4, 7, 10, 13] : [6, 9, 12, 15]
  return (
    <span className={`ui-signal ui-signal--${tone} ui-signal--${size} ${className}`} aria-hidden="true">
      {hs.map((h, i) => <i key={i} className={i < level ? 'on' : ''} style={{ height: h }} />)}
    </span>
  )
}

// Кольцо 36×36 со стрелкой тренда (плитка «Сегодня»).
export function TrendRing({ up = true }) {
  const gid = `rg${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <span className="ui-ring" aria-hidden="true">
      <svg width="36" height="36" viewBox="0 0 36 36">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="ui-ring-stop1" />
            <stop offset="1" className="ui-ring-stop2" />
          </linearGradient>
        </defs>
        <circle className="ui-ring-track" cx="18" cy="18" r="14" fill="none" strokeWidth="4" stroke={`url(#${gid})`} />
      </svg>
      <svg className="ui-ring-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={up ? undefined : { transform: 'scaleY(-1)' }}>
        <path d="m4 16 5-5 4 4 7-7" /><path d="M15 8h5v5" />
      </svg>
    </span>
  )
}
