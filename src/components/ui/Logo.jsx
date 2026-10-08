import { useId } from 'react'

// Фирменный знак Lipton — три наклонные полоски (как в макетах и на сайте).
export default function Logo({ size = 14, boxed = false, className = '' }) {
  const gid = `lg${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const svg = (
    <svg className={`ui-logo ${boxed ? '' : className}`} width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34F5A3" />
          <stop offset="1" stopColor="#0FA968" />
        </linearGradient>
      </defs>
      <g transform="translate(3.2 0) skewX(-9)">
        <rect x="8" y="7" width="5.4" height="26" rx="2.7" fill={`url(#${gid})`} />
        <rect x="17" y="19" width="5.4" height="14" rx="2.7" fill={`url(#${gid})`} opacity="0.82" />
        <rect x="26" y="13" width="5.4" height="20" rx="2.7" fill={`url(#${gid})`} opacity="0.62" />
      </g>
    </svg>
  )
  if (!boxed) return svg
  return <span className={`ui-logo-box ${className}`} aria-hidden="true">{svg}</span>
}
