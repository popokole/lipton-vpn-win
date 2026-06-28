import { useState, useEffect } from 'react'
import TrafficBar from './TrafficBar'

const BUY_URL = 'https://t.me/liptonvpn_bot'

function TrialCountdown({ expiresAt }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const ms = expiresAt - Date.now()
  if (ms <= 0) return <span className="expire-soon">Истекла</span>
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return <span>{m}:{String(s).padStart(2, '0')} осталось</span>
}

function SubCard({ sub, onRefresh }) {
  const [loading, setLoading] = useState(false)

  const handleRefresh = async () => {
    setLoading(true)
    await onRefresh()
    setLoading(false)
  }

  return (
    <div className={`sub-card${sub.isTrial ? ' sub-card--trial' : ''}`}>
      <div className="sub-card-header">
        <div className="sub-card-name-row">
          <div className="sub-card-check">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="sub-card-name-block">
            <span className="sub-card-name">{sub.name}</span>
            {sub.isTrial && <span className="sub-badge sub-badge--trial">Пробная</span>}
            {!sub.isTrial && <span className="sub-badge sub-badge--ok">Активна</span>}
          </div>
        </div>
        <div className="sub-card-actions">
          <button className="btn-icon" onClick={handleRefresh} disabled={loading}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {loading ? '...' : 'Обновить'}
          </button>
        </div>
      </div>

      {sub.isTrial && (
        <div className="sub-trial-body">
          {sub.expiresAt && (
            <div className="sub-trial-timer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <TrialCountdown expiresAt={sub.expiresAt} />
            </div>
          )}
          <button className="sub-buy-btn" onClick={() => window.api.openExternal(BUY_URL)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.25 14.47l-2.95-.924c-.64-.203-.654-.64.136-.95l11.52-4.44c.534-.194 1.001.13.606.092z"/>
            </svg>
            Купить полный доступ
          </button>
        </div>
      )}

      <TrafficBar userInfo={sub.userInfo} />

      {!sub.isTrial && (
        <div className="sub-renew-row">
          <button className="btn-renew" onClick={() => window.api.openExternal(BUY_URL)}>
            Продлить
          </button>
        </div>
      )}
    </div>
  )
}

export default function SubscriptionPanel({ subscriptions, onRefresh }) {
  const trial = subscriptions.find(s => s.isTrial)
  const real  = subscriptions.filter(s => !s.isTrial)
  const hasAny = subscriptions.length > 0

  return (
    <div className="section">
      <div className="section-header">
        <span className="section-title">Подписка</span>
      </div>

      {trial && (
        <div className="sub-list" style={{ marginBottom: 8 }}>
          <SubCard sub={trial} onRefresh={onRefresh} />
        </div>
      )}

      {real.length > 0 && (
        <div className="sub-list" style={{ marginBottom: 8 }}>
          {real.map(s => <SubCard key={s.id} sub={s} onRefresh={onRefresh} />)}
        </div>
      )}

      {!hasAny && (
        <div className="sub-empty">
          <p className="sub-empty-text">Активной подписки нет</p>
          <button className="sub-buy-btn" onClick={() => window.api.openExternal(BUY_URL)}>
            Оформить подписку
          </button>
          <button className="btn-outline" style={{ marginTop: 8 }} onClick={onRefresh}>
            Обновить
          </button>
        </div>
      )}
    </div>
  )
}
