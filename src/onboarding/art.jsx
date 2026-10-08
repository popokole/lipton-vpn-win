import { useId } from 'react'
import { Flag, Icon } from '../components/ui'

// Иллюстрации левой половины онбординга (по макетам new-onb-*): орбиты с
// флагами, кольцо-таймер «15:00», переписка с ботом, галочка «Вы вошли».

// Свечение за иллюстрацией: 4 размытых пятна в тоне шага (green | warm).
export function OnbGlow() {
  return (
    <div className="onb-glow" aria-hidden="true">
      <i className="onb-glow-b1" />
      <i className="onb-glow-b2" />
      <i className="onb-glow-b3" />
      <i className="onb-glow-b4" />
    </div>
  )
}

// Орбиты: центр со свечением, два флага на кольцах, редкие точки.
export function OrbitArt({ flags = ['nl', 'de'] }) {
  const [a, b] = flags
  return (
    <div className="onb-art onb-orbit" aria-hidden="true">
      <svg viewBox="0 0 400 400" width="400" height="400">
        <circle cx="200" cy="200" r="72" className="orb-ring" />
        <circle cx="200" cy="200" r="128" className="orb-ring orb-ring--dash" />
        <circle cx="200" cy="200" r="184" className="orb-ring orb-ring--far" />
        <circle cx="200" cy="200" r="10" className="orb-core-halo" />
        <circle cx="200" cy="200" r="4" className="orb-core" />
        <circle cx="144.8" cy="246.3" r="3" className="orb-dot" />
        <circle cx="79.7" cy="243.8" r="2.5" className="orb-dot orb-dot--mint" />
        <circle cx="372.9" cy="262.9" r="2.5" className="orb-dot orb-dot--cyan" />
      </svg>
      {a && <span className="orb-flag orb-flag--a"><Flag code={a} size={22} /></span>}
      {b && <span className="orb-flag orb-flag--b"><Flag code={b} size={22} /></span>}
    </div>
  )
}

// Кольцо-таймер: деления, дуга прогресса и «15:00 / минут» в центре.
export function ClockArt({ label = '15:00', caption = 'минут', progress = 1, tone = 'green' }) {
  const gid = `ck${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const R = 92
  const C = 2 * Math.PI * R
  const ticks = Array.from({ length: 60 }, (_, i) => i)
  const p = Math.max(0, Math.min(1, progress))
  return (
    <div className={`onb-art onb-clock onb-clock--${tone}`} aria-hidden="true">
      <svg viewBox="0 0 260 260" width="260" height="260">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="ck-stop-1" />
            <stop offset="1" className="ck-stop-2" />
          </linearGradient>
        </defs>
        {ticks.map(i => {
          const ang = (i / 60) * Math.PI * 2 - Math.PI / 2
          const long = i % 5 === 0
          const r1 = 116
          const r2 = long ? 106 : 110
          return (
            <line
              key={i}
              x1={130 + r1 * Math.cos(ang)} y1={130 + r1 * Math.sin(ang)}
              x2={130 + r2 * Math.cos(ang)} y2={130 + r2 * Math.sin(ang)}
              className={long ? 'ck-tick ck-tick--long' : 'ck-tick'}
            />
          )
        })}
        <circle cx="130" cy="130" r={R} className="ck-track" />
        <circle
          cx="130" cy="130" r={R}
          className="ck-arc"
          stroke={`url(#${gid})`}
          strokeDasharray={`${C * p} ${C}`}
          transform="rotate(-90 130 130)"
        />
        <circle cx="130" cy="130" r="74" className="ck-face" />
        {p > 0 && (
          <circle
            cx={130 + R * Math.cos(p * Math.PI * 2 - Math.PI / 2)}
            cy={130 + R * Math.sin(p * Math.PI * 2 - Math.PI / 2)}
            r="6" className="ck-knob"
          />
        )}
      </svg>
      <div className="ck-center">
        <span className="ck-time num">{label}</span>
        <span className="ck-cap">{caption}</span>
      </div>
    </div>
  )
}

// Переписка с ботом: «/start» и «Аккаунт создан — вот ваша ссылка».
export function ChatArt() {
  return (
    <div className="onb-art onb-chat" aria-hidden="true">
      <div className="chat-me">
        <span>/start</span>
        <Icon name="checks" size={14} stroke={2} />
      </div>
      <div className="chat-row">
        <span className="chat-tg"><Icon name="telegram" size={14} stroke={2.2} /></span>
        <div className="chat-bot">
          <div className="chat-bot-title">Аккаунт создан <Icon name="check" size={13} stroke={2.4} /></div>
          <div className="chat-bot-text">Вот ваша ссылка для подключения</div>
        </div>
      </div>
    </div>
  )
}

// Галочка «Вы вошли» в кольцах.
export function CheckArt() {
  return (
    <div className="onb-art onb-check" aria-hidden="true">
      <svg viewBox="0 0 260 260" width="260" height="260">
        <circle cx="130" cy="130" r="72" className="orb-ring" />
        <circle cx="130" cy="130" r="100" className="orb-ring orb-ring--dash" />
        <circle cx="130" cy="130" r="124" className="orb-ring orb-ring--far" />
        <circle cx="52" cy="98" r="3" className="orb-dot orb-dot--mint" />
        <circle cx="222" cy="84" r="3.5" className="orb-dot" />
        <circle cx="206" cy="182" r="2.5" className="orb-dot orb-dot--cyan" />
      </svg>
      <span className="chk-disc">
        <span className="chk-badge"><Icon name="check" size={30} stroke={2.6} /></span>
      </span>
    </div>
  )
}
