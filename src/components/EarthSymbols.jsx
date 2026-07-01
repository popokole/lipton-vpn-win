import { useEffect, useRef } from 'react'

// Вращающаяся Земля целиком из «живых» символов (зелёные материки, золотая
// Россия, день/ночь). Тот же визуал, что на сайте. Рисуется на canvas внутри
// родителя (position:relative). grid — плотность сетки (меньше = плотнее).
export default function EarthSymbols({ opacity = 0.6, grid, fps }) {
  const ref = useRef(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const chars = ' .`,:;-=+ilo*xX#%@'
    const LN = chars.length
    const Lx = -0.42, Ly = 0.36, Lz = 0.83, DEG = 180 / Math.PI
    let W = 0, H = 0, DPR = 1, raf = 0, lastT = 0
    const G = grid || 11
    const minDt = fps ? 1000 / fps : 28
    const stars = []

    const inE = (lon, lat, lc, bc, rl, rb) => {
      const dl = ((lon - lc + 540) % 360) - 180
      return (dl * dl) / (rl * rl) + ((lat - bc) * (lat - bc)) / (rb * rb) < 1
    }
    const landColor = (lon, lat) => {
      if (lat < -66) return [225, 235, 242]
      if (inE(lon, lat, -42, 72, 15, 11)) return [225, 235, 242]
      if (lat > 48 && inE(lon, lat, 95, 60, 90, 20)) return [242, 196, 78]
      if (inE(lon, lat, 18, 2, 22, 30)) return [46, 125, 74]
      if (inE(lon, lat, 18, 32, 16, 14)) return [60, 120, 70]
      if (inE(lon, lat, 82, 47, 95, 30)) return [46, 125, 74]
      if (inE(lon, lat, 82, 20, 42, 17)) return [60, 130, 70]
      if (inE(lon, lat, -100, 46, 40, 26)) return [46, 120, 74]
      if (inE(lon, lat, -85, 16, 15, 11)) return [60, 125, 70]
      if (inE(lon, lat, -60, -18, 18, 34)) return [46, 125, 70]
      if (inE(lon, lat, 134, -25, 17, 12)) return [120, 110, 60]
      return null
    }

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
      ctx.font = Math.round(G) + 'px monospace'
      stars.length = 0
      const ns = 24
      for (let i = 0; i < ns; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, b: 0.2 + Math.random() * 0.6 })
    }

    const frame = (t) => {
      if (!reduce) raf = requestAnimationFrame(frame)
      if (t - lastT < minDt) return
      lastT = t
      const ts = t * 0.001
      const ang = ts * 0.3, ca = Math.cos(ang), sa = Math.sin(ang),
        tl = 0.36, ct = Math.cos(tl), st = Math.sin(tl)
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46
      ctx.fillStyle = '#02060c'
      ctx.fillRect(0, 0, W, H)
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        ctx.fillStyle = 'rgba(200,220,255,' + s.b * (0.5 + 0.5 * Math.sin(ts * 2 + i)) + ')'
        ctx.fillRect(s.x, s.y, 1.3, 1.3)
      }
      ctx.font = Math.round(G) + 'px monospace'
      for (let gy = G / 2; gy < H; gy += G) {
        for (let gx = G / 2; gx < W; gx += G) {
          const nx = (gx - cx) / R, ny = -(gy - cy) / R, r2 = nx * nx + ny * ny
          if (r2 > 1.15) continue
          if (r2 > 1.0) {
            const rim = 1 - (r2 - 1.0) / 0.15
            ctx.fillStyle = 'rgba(70,150,255,' + 0.16 * Math.max(0, rim) + ')'
            ctx.fillText(chars.charAt(1 + (Math.floor(ts * 3 + gx) % 3)), gx, gy)
            continue
          }
          const nz = Math.sqrt(1 - r2)
          const y = ny * ct + nz * st, z1 = -ny * st + nz * ct,
            mx = nx * ca - z1 * sa, mz = nx * sa + z1 * ca, my = y
          const lon = Math.atan2(mz, mx) * DEG,
            lat = Math.asin(Math.max(-1, Math.min(1, my))) * DEG
          const col = landColor(lon, lat)
          let r, g, bl
          if (col) { r = col[0]; g = col[1]; bl = col[2] }
          else {
            const shd = my * 0.5 + 0.5
            r = 8 + 10 * shd; g = 40 + 45 * shd; bl = 92 + 50 * shd
          }
          const diff = Math.max(0, nx * Lx + ny * Ly + nz * Lz), lum = 0.14 + 0.88 * diff
          if (!col) {
            const spec = Math.pow(diff, 20) * 0.9
            r += spec * 255; g += spec * 255; bl += spec * 255
          }
          r = Math.min(255, r * lum); g = Math.min(255, g * lum); bl = Math.min(255, bl * lum)
          if (diff < 0.1) { r += 6; bl += 22 }
          const br = (0.3 * r + 0.59 * g + 0.11 * bl) / 255
          if (br < 0.04) continue
          const wv = Math.sin(ts * 2.6 + mx * 4.6 + my * 3.1 + mz * 4.6)
          let idx = Math.round(br * (LN - 1) + wv * 1.5)
          if (idx < 0) idx = 0
          if (idx > LN - 1) idx = LN - 1
          ctx.fillStyle = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (bl | 0) + ')'
          ctx.fillText(chars.charAt(idx), gx, gy)
        }
      }
    }

    size()
    if (reduce) frame(900)
    else raf = requestAnimationFrame(frame)

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      size()
      lastT = 0
      if (reduce) frame(900)
      else raf = requestAnimationFrame(frame)
    })
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
  }, [grid, fps])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity, pointerEvents: 'none' }}
    />
  )
}
