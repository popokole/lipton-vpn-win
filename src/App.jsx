import { useState, useEffect, useCallback, useMemo, useReducer, useRef } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Notices from './components/Notices'
import WelcomeScreen from './components/WelcomeScreen'
import LoginScreen from './components/LoginScreen'
import AccountPanel from './components/AccountPanel'
import SupportPanel from './components/SupportPanel'
import BillingPanel from './components/BillingPanel'
import HistoryPanel from './components/HistoryPanel'
import ConnectionCheckPanel from './components/ConnectionCheckPanel'
import HomePage from './pages/HomePage'
import ServersPage from './pages/ServersPage'
import NewsPage from './pages/NewsPage'
import SettingsPage from './pages/SettingsPage'
import { Aurora, Glass } from './components/ui'
import { navReducer, initialNav, topScreen } from './lib/nav.mjs'
import { planSummary, glowPalette } from './lib/plan.mjs'
import { flattenServers } from './lib/servers.mjs'
import { useTheme } from './lib/theme.js'
import { useWindowMaximized, usePauseWhenHidden, useEscape } from './lib/window.js'
import { useNow } from './lib/time.js'

// Окно ПК (редизайн): заголовок 40 px, боковое меню 216 px, область контента.
// Разделы — Главная / Серверы / Новости / Настройки; подэкраны (оплата,
// поддержка, кабинет, история, проверка соединения) открываются поверх раздела
// внутри области контента, закрываются «Назад» и Esc.

// Окно без содержимого (загрузка, вход, знакомство) — тот же заголовок и свечение.
function Frame({ maximized, onToggleMaximize, children }) {
  return (
    <div className="app" data-state="active" data-maximized={maximized ? 'true' : 'false'}>
      <Aurora variant="page" palette="active" />
      <TitleBar maximized={maximized} onToggleMaximize={onToggleMaximize} />
      {children}
    </div>
  )
}

export default function App() {
  const [vpnStatus, setVpnStatus] = useState('disconnected')
  const [activeServerId, setActiveServerId] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [pinging, setPinging] = useState(false)
  const [version, setVersion] = useState('')
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(null)
  const [guest, setGuest] = useState(false)
  const [update, setUpdate] = useState(null)
  const [updateAvailable, setUpdateAvailable] = useState(null)
  const [firstLaunch, setFirstLaunch] = useState(false)
  const [expiryWarning, setExpiryWarning] = useState(null)
  const [connectError, setConnectError] = useState(null)
  const [toasts, setToasts] = useState([])
  const [connectedAt, setConnectedAt] = useState(null)
  const [subView, setSubView] = useState(null)
  const [config, setConfig] = useState(null)
  const [vpnPrefs, setVpnPrefs] = useState({ tunMode: true, bypassRu: true })

  const [nav, dispatch] = useReducer(navReducer, initialNav)
  const { theme, setTheme } = useTheme()
  const [maximized, toggleMaximize] = useWindowMaximized()
  usePauseWhenHidden()
  const toastTimers = useRef(new Set())

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    const t = setTimeout(() => {
      toastTimers.current.delete(t)
      setToasts(prev => prev.filter(x => x.id !== id))
    }, 3500)
    toastTimers.current.add(t)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => () => { toastTimers.current.forEach(clearTimeout) }, [])

  useEffect(() => {
    Promise.all([
      window.api.subList(),
      window.api.vpnStatus(),
      window.api.getVersion(),
      window.api.isFirstLaunch(),
      window.api.authState(),
    ]).then(([subs, status, ver, fl, auth]) => {
      setSubscriptions(subs || [])
      setVpnStatus(status?.status || 'disconnected')
      setActiveServerId(status?.serverId || null)
      if (status?.connectedAt) setConnectedAt(status.connectedAt)
      setVersion(ver || '')
      setFirstLaunch(!!fl)
      setAuthed(!!auth?.authed)
      setLoading(false)
    })
  }, [])

  // Тариф для карточки в меню: /me/subscription (название — по /config).
  useEffect(() => {
    if (!authed) { setSubView(null); return undefined }
    let alive = true
    window.api.accountSubscriptionView?.()
      .then(r => { if (alive && r?.success) setSubView(r.view || null) })
      .catch(() => {})
    window.api.accountConfig?.()
      .then(r => { if (alive && r?.success) setConfig(r.config || null) })
      .catch(() => {})
    const off = window.api.onAccountSubscription?.(view => setSubView(view || null))
    return () => { alive = false; off?.() }
  }, [authed])

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
    dispatch({ type: 'reset' })
    setGuest(false)
    setAuthed(false)
  }, [])

  // Тест-доступ без аккаунта: входим в приложение как «гость» с триал-подпиской.
  const handleTrial = useCallback(async () => {
    const subs = await window.api.subList()
    setSubscriptions(subs || [])
    setGuest(true)
  }, [])

  useEffect(() => {
    const offVpn = window.api.onVpnStatus(data => {
      setVpnStatus(data.status)
      setActiveServerId(data.serverId || null)
      if (data.connectedAt) setConnectedAt(data.connectedAt)
    })
    const offSub = window.api.onSubUpdate(subs => {
      setSubscriptions(subs || [])
    })
    const offUpd = window.api.onUpdateStatus(data => {
      if (data.event === 'downloaded') { setUpdate(data); setUpdateAvailable(null) }
      if (data.event === 'available') setUpdateAvailable(data)
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

  // Начало сессии для таймера. TODO(redesign): connectedAt из main (пакет D3);
  // пока main его не присылает — отсчёт с момента, когда окно увидело «подключено».
  useEffect(() => {
    if (vpnStatus === 'connected') setConnectedAt(t => t || Date.now())
    else if (vpnStatus !== 'reconnecting') setConnectedAt(null)
  }, [vpnStatus])

  // Режим и «Обход РФ» для чипов на главной — перечитываем при возврате на главную.
  const onHome = nav.page === 'home' && nav.stack.length === 0
  useEffect(() => {
    if (!onHome || loading) return
    let alive = true
    Promise.all([window.api.getTunMode?.(), window.api.getBypassRu?.()])
      .then(([tun, bypass]) => { if (alive) setVpnPrefs({ tunMode: tun !== false, bypassRu: bypass !== false }) })
      .catch(() => {})
    return () => { alive = false }
  }, [onHome, loading])

  const allServers = useMemo(() => flattenServers(subscriptions), [subscriptions])
  const activeServer = allServers.find(s => s.id === activeServerId)

  const handleConnect = useCallback(async () => {
    if (vpnStatus === 'connecting' || vpnStatus === 'disconnecting') return
    if (vpnStatus === 'connected' || vpnStatus === 'reconnecting') {
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
        setConnectError(result.error || null)
        // Новое ядро при неудачной смене сервера остаётся на прежнем — берём фактический статус.
        setTimeout(async () => {
          setConnectError(null)
          const st = await window.api.vpnStatus().catch(() => null)
          setVpnStatus(st?.status || 'disconnected')
          if (st?.serverId) setActiveServerId(st.serverId)
        }, 2500)
      }
    }
  }, [vpnStatus])

  const handlePingAll = useCallback(async () => {
    if (pinging) return
    setPinging(true)
    await Promise.all(subscriptions.map(sub => window.api.subPing(sub.id)))
    setPinging(false)
  }, [pinging, subscriptions])

  // Навигация
  const go = useCallback(page => dispatch({ type: 'go', page }), [])
  const open = useCallback((screen, params) => dispatch({ type: 'open', screen, params }), [])
  const back = useCallback(() => dispatch({ type: 'back' }), [])
  const top = topScreen(nav)
  useEscape(back, !!top)

  // Гостевой обратный отсчёт тикает раз в секунду, дни подписки — раз в минуту.
  const guestMode = guest && !authed
  const now = useNow(guestMode ? 1000 : 60000)
  const plan = useMemo(
    () => planSummary({ subscriptions, view: subView, config, guest: guestMode, now }),
    [subscriptions, subView, config, guestMode, now],
  )
  const palette = glowPalette(vpnStatus, plan)

  const openBilling = useCallback(() => {
    if (authed) open('billing')
    else setGuest(false) // гость: сначала вход в аккаунт
  }, [authed, open])

  if (loading) {
    return (
      <Frame maximized={maximized} onToggleMaximize={toggleMaximize}>
        <div className="loading"><span className="ui-spinner ui-spinner--lg" aria-label="Загрузка" /></div>
      </Frame>
    )
  }

  // TODO(redesign): вход и знакомство по макетам new-onb-* — пакет D5.
  if (authed === false && !guest) {
    return (
      <Frame maximized={maximized} onToggleMaximize={toggleMaximize}>
        <div className="gate">
          <Glass variant="panel" className="gate-card legacy-gate">
            <LoginScreen onLogin={handleLogin} onTrial={handleTrial} />
          </Glass>
        </div>
      </Frame>
    )
  }

  if (firstLaunch) {
    return (
      <Frame maximized={maximized} onToggleMaximize={toggleMaximize}>
        <div className="gate">
          <Glass variant="panel" className="gate-card legacy-gate">
            <WelcomeScreen onComplete={async () => {
              await window.api.completeOnboarding()
              setFirstLaunch(false)
            }} />
          </Glass>
        </div>
      </Frame>
    )
  }

  const notices = []
  if (vpnStatus === 'kill-switch') {
    notices.push({ id: 'kill-switch', tone: 'warn', icon: 'shieldOff', title: 'Kill Switch активен', sub: 'Интернет заблокирован — нажмите «Подключить»' })
  }
  if (expiryWarning) {
    notices.push({
      id: 'expiry', tone: 'warn', icon: 'clock', title: 'Подписка заканчивается',
      sub: `«${expiryWarning.subName}» — через ${expiryWarning.label}`,
      onClose: () => setExpiryWarning(null),
    })
  }
  if (update) {
    notices.push({
      id: 'update', tone: 'ok', icon: 'download', title: 'Обновление готово',
      sub: `Версия ${update.version} загружена`,
      action: { label: 'Установить', onClick: () => window.api.installUpdate() },
    })
  } else if (updateAvailable) {
    notices.push({ id: 'update-dl', tone: 'info', icon: 'download', title: `Скачивается ${updateAvailable.version}`, sub: 'Обновление загружается…' })
  }
  toasts.forEach(t => notices.push({
    id: t.id,
    tone: t.type === 'error' ? 'error' : 'ok',
    icon: t.type === 'error' ? 'alert' : 'check',
    title: t.message,
    onClose: () => removeToast(t.id),
  }))

  let pageEl
  if (nav.page === 'servers') {
    pageEl = (
      <ServersPage
        servers={allServers}
        activeServerId={activeServerId}
        activeServer={activeServer}
        vpnStatus={vpnStatus}
        pinging={pinging}
        onSelect={handleSelectServer}
        onPingAll={handlePingAll}
        onEmpty={openBilling}
        emptyLabel={authed ? 'Оформить подписку' : 'Войти'}
      />
    )
  } else if (nav.page === 'news') {
    pageEl = <NewsPage onClose={() => go('home')} />
  } else if (nav.page === 'settings') {
    pageEl = (
      <SettingsPage
        authed={!!authed}
        theme={theme}
        onTheme={setTheme}
        onOpen={open}
        onLogin={() => setGuest(false)}
        onLogout={handleLogout}
        vpnStatus={vpnStatus}
      />
    )
  } else {
    pageEl = (
      <HomePage
        authed={!!authed}
        banners={[] /* TODO(redesign): баннеры из админки — следующая волна */}
        subscriptions={subscriptions}
        onRefreshSub={() => window.api.accountSync()}
        onBuy={authed ? () => open('billing') : null}
        onOpen={open}
        hero={{
          status: vpnStatus,
          palette,
          connectedAt,
          tunMode: vpnPrefs.tunMode,
          bypassRu: vpnPrefs.bypassRu,
          server: activeServer || allServers[0] || null,
          serversCount: allServers.length,
          error: connectError,
          onConnect: handleConnect,
          onServers: () => go('servers'),
        }}
      />
    )
  }

  let screenEl = null
  if (top) {
    switch (top.screen) {
      case 'billing': screenEl = <BillingPanel onClose={back} />; break
      case 'support': screenEl = <SupportPanel onClose={back} />; break
      case 'history': screenEl = <HistoryPanel onClose={back} />; break
      case 'check': screenEl = <ConnectionCheckPanel onClose={back} />; break
      case 'account':
        screenEl = (
          <AccountPanel
            onClose={back}
            onLogout={handleLogout}
            onNews={() => go('news')}
            onSupport={() => open('support')}
            onBilling={() => open('billing')}
            onHistory={() => open('history')}
          />
        )
        break
      default: screenEl = null
    }
  }

  return (
    <div className="app" data-state={palette} data-maximized={maximized ? 'true' : 'false'}>
      <Aurora variant="page" palette={palette} />
      <TitleBar maximized={maximized} onToggleMaximize={toggleMaximize} />
      <div className="shell">
        <Sidebar
          page={nav.page}
          onNavigate={go}
          badges={{} /* TODO(redesign): непрочитанные новости — D4 */}
          plan={plan}
          version={version}
          onRenew={openBilling}
          onLogin={() => setGuest(false)}
        />
        <main className="content">
          <div className="page" key={nav.page} inert={top ? '' : undefined}>
            {pageEl}
          </div>
          {screenEl && (
            <div className="legacy-sheet" key={top.screen}>
              {screenEl}
            </div>
          )}
          <Notices items={notices} />
        </main>
      </div>
    </div>
  )
}
