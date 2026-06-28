import { useState, useEffect, useCallback, useRef } from 'react'
import TitleBar from './components/TitleBar'
import ConnectButton from './components/ConnectButton'
import ServerList from './components/ServerList'
import SubscriptionPanel from './components/SubscriptionPanel'
import SettingsPanel from './components/SettingsPanel'
import PlanesOverlay from './components/PlanesOverlay'
import WelcomeScreen from './components/WelcomeScreen'
import LoginScreen from './components/LoginScreen'

function Toast({ toasts, onRemove }) {
  if (!toasts.length) return null
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-close" onClick={() => onRemove(t.id)}>✕</button>
        </div>
      ))}
    </div>
  )
}

const COMING_SOON = [
  { icon: '📊', label: 'Статистика' },
  { icon: '🤖', label: 'Android' },
  { icon: '🍎', label: 'iOS' },
  { icon: '💻', label: 'Mac' },
  { icon: '📺', label: 'TV' },
]

function ComingSoonCard({ item }) {
  const [shaking, setShaking] = useState(false)
  function handleClick() {
    if (shaking) return
    setShaking(true)
    setTimeout(() => setShaking(false), 500)
  }
  return (
    <div className={`coming-soon-card${shaking ? ' coming-soon-card--shake' : ''}`} onClick={handleClick}>
      <span className="coming-soon-icon">{item.icon}</span>
      <span className="coming-soon-label">{item.label}</span>
      <span className="coming-soon-badge">Скоро</span>
    </div>
  )
}

export default function App() {
  const [vpnStatus, setVpnStatus] = useState('disconnected')
  const [activeServerId, setActiveServerId] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [pinging, setPinging] = useState(false)
  const [version, setVersion] = useState('')
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(null)
  const [update, setUpdate] = useState(null)
  const [updateAvailable, setUpdateAvailable] = useState(null)
  const [planeMode, setPlaneMode] = useState(null)
  const [firstLaunch, setFirstLaunch] = useState(false)
  const [expiryWarning, setExpiryWarning] = useState(null)
  const [connectError, setConnectError] = useState(null)
  const [toasts, setToasts] = useState([])
  const prevStatus = useRef('disconnected')
  const planeTimer = useRef(null)

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    Promise.all([
      window.api.subList(),
      window.api.vpnStatus(),
      window.api.getVersion(),
      window.api.isFirstLaunch(),
      window.api.authState(),
    ]).then(([subs, status, ver, fl, auth]) => {
      setSubscriptions(subs || [])
      setVpnStatus(status.status || 'disconnected')
      setActiveServerId(status.serverId || null)
      setVersion(ver || '')
      setFirstLaunch(!!fl)
      setAuthed(!!auth?.authed)
      setLoading(false)
    })
  }, [])

  const handleLogin = useCallback(async () => {
    setAuthed(true)
    const subs = await window.api.subList()
    setSubscriptions(subs || [])
  }, [])

  const handleLogout = useCallback(async () => {
    await window.api.authLogout()
    setSubscriptions([])
    setActiveServerId(null)
    setVpnStatus('disconnected')
    setShowSettings(false)
    setAuthed(false)
  }, [])

  useEffect(() => {
    const offVpn = window.api.onVpnStatus(data => {
      setVpnStatus(data.status)
      setActiveServerId(data.serverId || null)
    })
    const offSub = window.api.onSubUpdate(subs => {
      setSubscriptions(subs || [])
    })
    const offUpd = window.api.onUpdateStatus(data => {
      if (data.event === 'downloaded') { setUpdate(data); setUpdateAvailable(null) }
      if (data.event === 'available')  setUpdateAvailable(data)
    })
    const offExp = window.api.onExpiryWarning(data => {
      setExpiryWarning(data)
    })
    const offAddResult = window.api.onSubAddResult?.(data => {
      if (data.success) addToast('Подписка добавлена', 'success')
      else addToast(data.error || 'Ошибка добавления подписки', 'error')
    })
    return () => { offVpn?.(); offSub?.(); offUpd?.(); offExp?.(); offAddResult?.() }
  }, [addToast])

  useEffect(() => {
    const prev = prevStatus.current
    prevStatus.current = vpnStatus
    if (prev === 'disconnected' && vpnStatus === 'connecting') {
      clearTimeout(planeTimer.current)
      setPlaneMode('connect')
      planeTimer.current = setTimeout(() => setPlaneMode(null), 2800)
    } else if (prev === 'connected' && vpnStatus === 'disconnecting') {
      clearTimeout(planeTimer.current)
      setPlaneMode('disconnect')
      planeTimer.current = setTimeout(() => setPlaneMode(null), 5500)
    }
  }, [vpnStatus])

  const allServers = subscriptions.flatMap(sub =>
    (sub.servers || []).map(s => ({ ...s, subId: sub.id, isTrial: sub.isTrial }))
  )
  const activeServer = allServers.find(s => s.id === activeServerId)

  const handleConnect = useCallback(async () => {
    if (vpnStatus === 'connecting' || vpnStatus === 'disconnecting') return
    if (vpnStatus === 'connected') {
      setVpnStatus('disconnecting')
      await window.api.vpnDisconnect()
      return
    }
    const targetId = activeServerId || allServers[0]?.id
    if (!targetId) return
    setVpnStatus('connecting')
    const result = await window.api.vpnConnect(targetId)
    if (!result.success) {
      setVpnStatus('error')
      setConnectError(result.error || 'Неизвестная ошибка')
      setTimeout(() => { setVpnStatus('disconnected'); setConnectError(null) }, 5000)
    }
  }, [vpnStatus, activeServerId, allServers])

  const handleSelectServer = useCallback(async (serverId) => {
    setActiveServerId(serverId)
    if (vpnStatus === 'connected') {
      setVpnStatus('connecting')
      const result = await window.api.vpnConnect(serverId)
      if (!result.success) {
        setVpnStatus('error')
        setTimeout(() => setVpnStatus('disconnected'), 2500)
      }
    }
  }, [vpnStatus])

  const handlePingAll = useCallback(async () => {
    if (pinging) return
    setPinging(true)
    await Promise.all(subscriptions.map(sub => window.api.subPing(sub.id)))
    setPinging(false)
  }, [pinging, subscriptions])

  if (loading) {
    return (
      <div className="app">
        <TitleBar />
        <div className="loading"><div className="spinner" /></div>
      </div>
    )
  }

  const statusLabel = {
    connected:     activeServer?.remark?.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]\s*/g, '') || 'Подключено',
    connecting:    'Подключение...',
    disconnecting: 'Отключение...',
    disconnected:  'Отключено',
    error:         'Ошибка подключения',
    'kill-switch': 'Kill Switch активен',
  }[vpnStatus] || 'Отключено'

  if (authed === false) {
    return (
      <div className="app">
        <TitleBar />
        <LoginScreen onLogin={handleLogin} />
      </div>
    )
  }

  if (firstLaunch) {
    return (
      <div className="app">
        <TitleBar />
        <WelcomeScreen onComplete={async () => {
          await window.api.completeOnboarding()
          setFirstLaunch(false)
        }} />
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar onSettings={() => setShowSettings(true)} />
      <Toast toasts={toasts} onRemove={removeToast} />
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onUpdateFound={() => setShowSettings(false)}
          onLogout={handleLogout}
        />
      )}

      <PlanesOverlay mode={planeMode} />

      {/* Kill switch banner */}
      {vpnStatus === 'kill-switch' && (
        <div className="update-banner update-banner--killswitch">
          <div className="update-banner-info">
            <span className="update-banner-icon">🛡</span>
            <div>
              <div className="update-banner-title">Kill Switch активен</div>
              <div className="update-banner-sub">Интернет заблокирован — нажмите «Подключиться»</div>
            </div>
          </div>
        </div>
      )}

      {/* Expiry warning banner */}
      {expiryWarning && (
        <div className="update-banner update-banner--expiry">
          <div className="update-banner-info">
            <span className="update-banner-icon">⏰</span>
            <div>
              <div className="update-banner-title">Подписка заканчивается</div>
              <div className="update-banner-sub">«{expiryWarning.subName}» — через {expiryWarning.label}</div>
            </div>
          </div>
          <button className="update-banner-btn" onClick={() => setExpiryWarning(null)}>✕</button>
        </div>
      )}

      {/* Update ready banner */}
      {update && (
        <div className="update-banner update-banner--ready">
          <div className="update-banner-info">
            <span className="update-banner-icon">⬆</span>
            <div>
              <div className="update-banner-title">Обновление готово</div>
              <div className="update-banner-sub">Версия {update.version} загружена</div>
            </div>
          </div>
          <button className="update-banner-btn" onClick={() => window.api.installUpdate()}>
            Установить
          </button>
        </div>
      )}

      {/* Update downloading banner */}
      {!update && updateAvailable && (
        <div className="update-banner update-banner--loading">
          <div className="update-banner-info">
            <span className="update-banner-icon">↓</span>
            <div>
              <div className="update-banner-title">Скачивается {updateAvailable.version}</div>
              <div className="update-banner-sub">Обновление загружается...</div>
            </div>
          </div>
        </div>
      )}

      <main className="main">
        <div className="connect-section">
          <ConnectButton status={vpnStatus} onConnect={handleConnect} />
          <div className={`status-text-big status-text-big--${vpnStatus}`}>
            {statusLabel}
          </div>
          {connectError && (
            <span className="status-error-detail">{connectError}</span>
          )}
          <span className="status-sub">
            {vpnStatus === 'connected' && activeServer
              ? activeServer.remark?.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]\s*/g, '').trim()
              : allServers.length > 0
                ? `${allServers.length} серверов доступно`
                : 'Добавьте подписку'}
          </span>
        </div>

        <div className="divider" />

        <ServerList
          servers={allServers}
          activeServerId={activeServerId}
          onSelect={handleSelectServer}
          onPingAll={handlePingAll}
          pinging={pinging}
        />

        <SubscriptionPanel
          subscriptions={subscriptions}
          onRefresh={() => window.api.accountSync()}
        />

        {/* Coming soon */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Скоро</span>
          </div>
          <div className="coming-soon-list">
            {COMING_SOON.map(item => (
              <ComingSoonCard key={item.label} item={item} />
            ))}
          </div>
        </div>
      </main>

      <footer className="footer">
        <button
          className="footer-tg"
          onClick={() => window.api.openExternal('https://t.me/liptonvpn_bot')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.25 14.47l-2.95-.924c-.64-.203-.654-.64.136-.95l11.52-4.44c.534-.194 1.001.13.606.092z"/>
          </svg>
          Telegram
        </button>
        <span className="footer-ver">v{version}</span>
      </footer>
    </div>
  )
}
