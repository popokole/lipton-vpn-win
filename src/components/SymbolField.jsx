import { useEffect, useRef } from 'react'

// Лёгкий «символьный фон»: плоская волна из символов, перетекающая со временем.
// Тот же визуал, что в карточках на сайте. Заполняет родителя (position:relative).
export default function SymbolField({ opacity = 0.12, color = '34,229,138' }) {
  const ref = useRef(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const chars = ' .`,:-=+*oxX#'
    const LN = chars.length
    const G = 15
    const minDt = 42
    let W = 0, H = 0, DPR = 1, raf = 0, lastT = 0

    const size = () => {
      DPR = Math.min(2, devicePixelRatio || 1)
      W = cv.clientWidth
      H = cv.clientHeight
      if (!W || !H) return
      cv.width = W * DPR
      cv.height = H * DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.font = Math.round(G * 1.05) + 'px monospace'
    }

    const frame = (t) => {
      if (!reduce) raf = requestAnimationFrame(frame)
      if (t - lastT < minDt) return
      lastT = t
      if (!W || !H) { size(); if (!W || !H) return }
      const ts = t * 0.001
      ctx.clearRect(0, 0, W, H)
      ctx.font = Math.round(G * 1.05) + 'px monospace'
      for (let y = G / 2; y < H; y += G) {
        for (let x = G / 2; x < W; x += G) {
          const v = Math.sin(ts * 1.1 + x * 0.03 + y * 0.025) + Math.sin(ts * 0.7 + x * 0.016 - y * 0.04)
          const b = (v + 2) / 4
          const idx = Math.floor(b * (LN - 1))
          if (idx < 1) continue
          ctx.fillStyle = 'rgba(' + color + ',' + (0.2 + 0.8 * b) + ')'
          ctx.fillText(chars.charAt(idx), x, y)
        }
      }
    }

    size()
    if (reduce) frame(900)
    else raf = requestAnimationFrame(frame)

    const ro = new ResizeObserver(() => size())
    ro.observe(cv)
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf)
      else if (!reduce) { lastT = 0; raf = requestAnimationFrame(frame) }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [color])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity, pointerEvents: 'none' }}
    />
  )
}
