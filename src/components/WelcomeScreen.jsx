import { useState } from 'react'

const STEPS = [
  {
    icon: (
      <div className="welcome-logo">L</div>
    ),
    title: 'Добро пожаловать',
    subtitle: 'Lipton VPN — быстро,\nбезопасно и просто.',
  },
  {
    icon: (
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="3"/>
        <path d="M8 21h8M12 17v4"/>
        <path d="M7 8h10M7 11h6"/>
      </svg>
    ),
    title: 'Добавьте подписку',
    subtitle: 'Нажмите «+ Добавить подписку» и вставьте ссылку, которую вам предоставил администратор.',
  },
  {
    icon: (
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"/>
      </svg>
    ),
    title: 'Выберите сервер',
    subtitle: 'Нажмите «Обновить пинг» и выберите сервер с наименьшей задержкой для максимальной скорости.',
  },
  {
    icon: (
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
        <line x1="12" y1="2" x2="12" y2="12"/>
      </svg>
    ),
    title: 'Нажмите «Подключиться»',
    subtitle: 'Большая кнопка в центре экрана запустит VPN. Готово — вы защищены!',
  },
]

export default function WelcomeScreen({ onComplete }) {
  const [step, setStep]     = useState(0)
  const [leaving, setLeaving] = useState(false)

  const isLast = step === STEPS.length - 1

  function next() {
    if (isLast) { onComplete(); return }
    setLeaving(true)
    setTimeout(() => { setStep(s => s + 1); setLeaving(false) }, 220)
  }

  const s = STEPS[step]

  return (
    <div className="welcome-overlay">
      <div className={`welcome-card${leaving ? ' welcome-card--leaving' : ''}`}>

        <div className="welcome-icon-wrap">
          {s.icon}
        </div>

        <div className="welcome-text">
          <h2 className="welcome-title">{s.title}</h2>
          <p className="welcome-sub">{s.subtitle}</p>
        </div>

        <div className="welcome-dots">
          {STEPS.map((_, i) => (
            <div key={i} className={`welcome-dot${i === step ? ' welcome-dot--active' : ''}`} />
          ))}
        </div>

        <button className="welcome-btn" onClick={next}>
          {isLast ? 'Начать' : 'Далее →'}
        </button>

        {!isLast && (
          <button className="welcome-skip" onClick={onComplete}>
            Пропустить
          </button>
        )}

      </div>
    </div>
  )
}
