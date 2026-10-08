import { useEffect, useRef, useState } from 'react'

// Живое свечение «Аврора»: 4 размытых пятна дрейфуют 17–31 с, ядро «дышит»,
// сверху зерно. Палитра по состоянию: active (изумруд + бирюза + синий),
// off (рыжая — выключено / нет подписки), bypass (синий + фиолетовый).
// Смена палитры — кросс-фейд двух слоёв за 1,6 с (анимируется только opacity).
// Пауза при скрытом окне и «уменьшить движение» — в base.css.

export const AURORA_PALETTES = ['active', 'off', 'bypass']

const FADE_MS = 1800

export default function Aurora({ palette = 'active', variant = 'page', className = '' }) {
  const p = AURORA_PALETTES.includes(palette) ? palette : 'off'
  const seq = useRef(0)
  const [layers, setLayers] = useState(() => [{ id: 0, palette: p, phase: 'shown' }])

  useEffect(() => {
    setLayers(prev => {
      const top = prev[prev.length - 1]
      if (top && top.palette === p) return prev
      seq.current += 1
      return [
        ...prev.filter(l => l.phase !== 'out').map(l => ({ ...l, phase: 'out' })),
        { id: seq.current, palette: p, phase: 'in' },
      ]
    })
  }, [p])

  // Когда кросс-фейд закончился — оставляем только верхний слой.
  useEffect(() => {
    if (layers.length < 2) return undefined
    const t = setTimeout(() => {
      setLayers(prev => {
        const top = prev[prev.length - 1]
        return [{ ...top, phase: 'shown' }]
      })
    }, FADE_MS)
    return () => clearTimeout(t)
  }, [layers])

  return (
    <div className={`aurora aurora--${variant} ${className}`} aria-hidden="true">
      {layers.map(l => (
        <div key={l.id} className={`aur-layer aur-p-${l.palette} is-${l.phase}`}>
          <i className="aur-b aur-b1" />
          <i className="aur-b aur-b2" />
          <i className="aur-b aur-b3" />
          <i className={`aur-b aur-b4${variant === 'hero' ? ' aur-core' : ''}`} />
        </div>
      ))}
      <div className="aurora-grain" />
    </div>
  )
}
