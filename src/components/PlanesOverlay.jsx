import { useEffect, useState, useRef } from 'react'

const PLANES = [
  { left: '28%', top: '50%', delay: 0,    size: 28, tx: '-55px' },
  { left: '50%', top: '56%', delay: 0.14, size: 22, tx:   '5px' },
  { left: '16%', top: '47%', delay: 0.24, size: 18, tx: '-75px' },
  { left: '65%', top: '53%', delay: 0.09, size: 24, tx:  '60px' },
  { left: '40%', top: '62%', delay: 0.30, size: 16, tx: '-25px' },
  { left: '73%', top: '44%', delay: 0.18, size: 20, tx:  '42px' },
]

const BLAST_DIRS = [
  { sx:   '0px', sy: '-55px' },
  { sx:  '39px', sy: '-39px' },
  { sx:  '55px', sy:   '0px' },
  { sx:  '39px', sy:  '39px' },
  { sx:   '0px', sy:  '55px' },
  { sx: '-39px', sy:  '39px' },
  { sx: '-55px', sy:   '0px' },
  { sx: '-39px', sy: '-39px' },
]

export default function PlanesOverlay({ mode }) {
  const [visible, setVisible]       = useState(false)
  const [key, setKey]               = useState(0)
  const [explosions, setExplosions] = useState({})
  const planeRefs = useRef([])
  const overlayRef = useRef(null)

  useEffect(() => {
    if (!mode) return
    setKey(k => k + 1)
    setVisible(true)
    setExplosions({})
    const t = setTimeout(() => setVisible(false), mode === 'disconnect' ? 5500 : 2800)
    return () => clearTimeout(t)
  }, [mode])

  // Measure real plane position at explosion moment
  useEffect(() => {
    if (mode !== 'disconnect') return

    const timers = PLANES.map((p, i) =>
      setTimeout(() => {
        const el = planeRefs.current[i]
        const overlay = overlayRef.current
        if (!el || !overlay) return
        const er = el.getBoundingClientRect()
        const or = overlay.getBoundingClientRect()
        setExplosions(prev => ({
          ...prev,
          [i]: {
            left: er.left - or.left + er.width  / 2,
            top:  er.top  - or.top  + er.height / 2,
          },
        }))
      }, (p.delay + 1.6) * 1000)
    )

    return () => timers.forEach(clearTimeout)
  }, [key])

  if (!visible || !mode) return null

  return (
    <div className="planes-overlay" key={key} ref={overlayRef}>
      {PLANES.map((p, i) => (
        <div
          key={`p-${i}`}
          ref={el => { planeRefs.current[i] = el }}
          className={`plane plane--${mode}`}
          style={{ left: p.left, top: p.top, '--delay': `${p.delay}s`, '--tx': p.tx }}
        >
          <svg width={p.size} height={p.size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 12L22 2L14 22L11 13L2 12Z"/>
            <path d="M11 13L14 10" stroke="currentColor" strokeWidth="1" fill="none"/>
          </svg>
        </div>
      ))}

      {mode === 'disconnect' && PLANES.map((p, i) => {
        const pos = explosions[i]
        if (!pos) return null
        return BLAST_DIRS.map((dir, j) => (
          <div key={`s-${i}-${j}`} className="blast-wrap" style={{ left: pos.left, top: pos.top }}>
            <div
              className="blast-spark"
              style={{
                '--sx': dir.sx,
                '--sy': dir.sy,
                '--delay': '0s',
                width:      4 + (i % 2),
                height:     4 + (i % 2),
                marginLeft: -(2 + (i % 2) / 2),
                marginTop:  -(2 + (i % 2) / 2),
              }}
            />
          </div>
        ))
      })}
    </div>
  )
}
