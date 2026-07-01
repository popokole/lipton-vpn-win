export default function TitleBar({ onSettings, onAccount }) {
  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <div className="titlebar-logo">
          {/* Фирменный знак Lipton — как на сайте (три скошенных столбика) */}
          <svg width="20" height="20" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="tb-logo" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#34F5A3" />
                <stop offset="1" stopColor="#0FA968" />
              </linearGradient>
            </defs>
            <g transform="skewX(-9)">
              <rect x="6" y="5" width="6.2" height="30" rx="3.1" fill="url(#tb-logo)" />
              <rect x="16.5" y="20" width="6.2" height="15" rx="3.1" fill="url(#tb-logo)" opacity="0.82" />
              <rect x="27" y="13" width="6.2" height="22" rx="3.1" fill="url(#tb-logo)" opacity="0.62" />
            </g>
          </svg>
        </div>
        <span className="titlebar-name">LIPTON VPN</span>
      </div>
      <div className="titlebar-controls">
        {onAccount && (
          <button className="titlebar-btn" onClick={onAccount} title="Кабинет">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </button>
        )}
        <button className="titlebar-btn" onClick={onSettings} title="Настройки">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <button className="titlebar-btn" onClick={() => window.api.minimize()} title="Свернуть">
          <svg width="12" height="2" viewBox="0 0 12 2" fill="currentColor">
            <rect width="12" height="2" rx="1"/>
          </svg>
        </button>
        <button className="titlebar-btn titlebar-btn--close" onClick={() => window.api.close()} title="Закрыть">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 1l8 8M9 1L1 9"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
