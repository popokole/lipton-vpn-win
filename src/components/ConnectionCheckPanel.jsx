import { useState, useEffect, useRef } from 'react'

const STEPS = ['Что видит ChatGPT', 'Что видят другие сайты', 'IPv6', 'DNS']

const STATUS_ICON = { ok: '✓', info: 'i', warn: '!', fail: '✕' }

function CheckItem({ item }) {
  return (
    <div className={`check-item check-item--${item.status}`}>
      <span className="check-item-icon">{STATUS_ICON[item.status] || '·'}</span>
      <div className="check-item-info">
        <span className="check-item-label">{item.label}</span>
        {item.detail && <span className="check-item-detail">{item.detail}</span>}
      </div>
      <span className="check-item-value">
        {item.country && /^[A-Z]{2}$/.test(item.country) && (
          <span className={`fi fi-${item.country.toLowerCase()} check-item-flag`} />
        )}
        {item.value}
      </span>
    </div>
  )
}

export default function ConnectionCheckPanel({ onClose }) {
  const [result, setResult]   = useState(null)
  const [running, setRunning] = useState(false)
  const [closing, setClosing] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    run()
    return () => { alive.current = false }
  }, [])

  async function run() {
    setRunning(true)
    setResult(null)
    let r
    try {
      r = await window.api.vpnCheckConnection()
    } catch (e) {
      r = { items: [], verdict: { level: 'fail', title: 'Проверка не удалась', hints: [String(e?.message || e)] } }
    }
    if (!alive.current) return
    setResult(r)
    setRunning(false)
  }

  function close() {
    setClosing(true)
    setTimeout(() => onClose(), 260)
  }

  const verdict = result?.verdict

  return (
    <div
      className={`settings-overlay${closing ? ' settings-overlay--closing' : ''}`}
      onClick={e => e.target === e.currentTarget && close()}
    >
      <div className={`settings-panel${closing ? ' settings-panel--closing' : ''}`}>
        <div className="settings-header">
          <span className="settings-title">Проверка соединения</span>
          <button className="settings-close" onClick={close}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1 1l8 8M9 1L1 9"/>
            </svg>
          </button>
        </div>

        <div className="settings-body">
          {running && (
            <div className="check-running">
              <div className="spinner check-spinner" />
              <span className="check-running-title">Проверяем через VPN...</span>
              <div className="check-steps">
                {STEPS.map(s => <span key={s} className="check-step">{s}</span>)}
              </div>
            </div>
          )}

          {!running && verdict && (
            <>
              <div className={`check-verdict check-verdict--${verdict.level}`}>
                <span className="check-verdict-icon">
                  {verdict.level === 'ok' ? '✓' : verdict.level === 'warn' ? '!' : '✕'}
                </span>
                <div className="check-verdict-info">
                  <span className="check-verdict-title">{verdict.title}</span>
                  {result.mode && result.items.length > 0 && (
                    <span className="check-verdict-sub">
                      Режим: {result.mode === 'tun' ? 'VPN для всего трафика' : 'только браузеры (прокси)'}
                    </span>
                  )}
                </div>
              </div>

              {result.items.length > 0 && (
                <div className="check-items">
                  {result.items.map(it => <CheckItem key={it.id} item={it} />)}
                </div>
              )}

              {verdict.hints.length > 0 && (
                <div className="check-hints">
                  {verdict.hints.map((h, i) => <span key={i} className="check-hint">{h}</span>)}
                </div>
              )}
            </>
          )}

          <button className="settings-flush-btn check-again-btn" onClick={run} disabled={running}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {running ? 'Проверяется...' : 'Проверить снова'}
          </button>

          <span className="check-privacy">
            Запросы идут к chatgpt.com, cloudflare.com, icanhazip.com и DNS Akamai тем же путём,
            что и ваш трафик. Результаты остаются на этом компьютере и никуда не отправляются.
          </span>
        </div>
      </div>
    </div>
  )
}
