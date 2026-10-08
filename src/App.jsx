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
import BypassDomainsScreen from './components/BypassDomainsScreen'
import LicensesScreen from './components/LicensesScreen'
import HomePage from './pages/HomePage'
import ServersPage from './pages/ServersPage'
import NewsPage from './pages/NewsPage'
import SettingsPage from './pages/SettingsPage'
import { Aurora, Glass } from './components/ui'
import { navReducer, initialNav, topScreen } from './lib/nav.mjs'
import { planSummary, glowPalette, bypassOffer, cheapestMonthly } from './lib/plan.mjs'
import { flattenServers } from './lib/servers.mjs'
import { exposureView } from './lib/stats.mjs'
import { unreadKeys, markRead } from './lib/news.mjs'
import { useTheme } from './lib/theme.js'
import { useWindowMaximized, usePauseWhenHidden, useEscape } from './lib/window.js'
import { useNow } from './lib/time.js'
import { useVpnStats, useExposure } from './lib/vpnData.js'

// Окно ПК (редизайн): заголовок 40 px, боковое меню 216 px, область контента.
// Разделы — Главная / Серверы / Новости / Настройки; подэкраны (оплата,
// поддержка, кабинет, история, проверка соединения, домены, лицензии)
// открываются поверх раздела внутри области контента, закрываются «Назад» и Esc.

const NEWS_REFRESH_MS = 30 * 60 * 1000

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

// Старые экраны настроек (домены, лицензии) рисуются внутри панели-подэкрана.
// TODO(redesign): экраны new-scr-domains и лицензий в новом стиле — D4, часть 2.
function LegacyScreen({ onClose, children }) {
  return (
    <div className="settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="settings-panel">{children}</div>
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
  const [news, setNews] = useState({ items: null, error: '' })
  const [newsRead, setNewsRead] = useState([])

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
      setConnectedAt(status?.connectedAt || null)
      setVersion(ver || '')
      setFirstLaunch(!!fl)
      setAuthed(!!auth?.authed)
      setLoading(false)
    })
  }, [])

  // Тарифы (/config публичный): цены в плитке «Тариф», «Обход глушилок» в Серверах.
  useEffect(() => {
    let alive = true
    window.api.accountConfig?.()
      .then(r => { if (alive && r?.success) setConfig(r.config || null) })
      .catch(() => {})
    return () => { alive = false }
  }, [authed])

  // Подписка аккаунта: /me/subscription (название тарифа — по /config).
  useEffect(() => {
    if (!authed) { setSubView(null); return undefined }
    let alive = true
    window.api.accountSubscriptionView?.()
      .then(r => { if (alive && r?.success) setSubView(r.view || null) })
      .catch(() => {})
    const off = window.api.onAccountSubscription?.(view => setSubView(view || null))
    return () => { alive = false; off?.() }
  }, [authed])

  // Новости: лента приложения + прочитанные (локально) — для бейджа в меню.
  useEffect(() => {
    let alive = true
    const load = () => window.api.getNews?.()
      .then(r => {
        if (!alive) return
        if (r?.success) setNews({ items: r.items || [], error: '' })
        else setNews(n => ({ items: n.items || [], error: r?.error || 'Нет связи с сервером' }))
      })
      .catch(() => { if (alive) setNews(n => ({ items: n.items || [], error: 'Нет связи с сервером' })) })
    load()
    window.api.getNewsRead?.().then(ids => { if (alive) setNewsRead(Array.isArray(ids) ? ids : []) }).catch(() => {})
    const id = setInterval(load, NEWS_REFRESH_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const saveNewsRead = useCallback((keys) => {
    setNewsRead(prev => {
      const next = markRead(prev, keys)
      window.api.setNewsRead?.(next)
      return next
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
      // начало сессии ведёт main: при смене сервера таймер не сбрасывается
      if ('connectedAt' in data) setConnectedAt(data.connectedAt || null)
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

  // Запасной таймер: старый main (без connectedAt) — отсчёт с момента «подключено».
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
  const on = vpnStatus === 'connected' || vpnStatus === 'reconnecting'

  // Данные плиток: статистика ядра (главная и серверы) и «что видят сайты».
  const statsWanted = !top && (nav.page === 'home' || nav.page === 'servers')
  const stats = useVpnStats(!loading && statsWanted)
  const check = useExposure(vpnStatus)
  const exposure = useMemo(() => exposureView(check, { on }), [check, on])
  const offer = useMemo(() => bypassOffer(config), [config])
  const cheapest = useMemo(() => cheapestMonthly(config), [config])

  const unread = useMemo(() => unreadKeys(news.items || [], newsRead), [news.items, newsRead])

  const openBilling = useCallback((params) => {
    if (authed) open('billing', params)
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
  // Kill Switch на главной видно в карточке состояния — уведомление только в других разделах
  if (vpnStatus === 'kill-switch' && !onHome) {
    notices.push({ id: 'kill-switch', tone: 'warn', icon: 'shieldOff', title: 'Kill Switch активен', sub: 'Интернет заблокирован — нажмите «Подключить»' })
  }
  if (expiryWarning) {
    notices.push({
      id: 'expiry', tone: 'warn', icon: 'clock', title: 'Подписка заканчивается',
      sub: `«${expiryWarning.subName}» — через ${expiryWarning.label}`,
      action: authed ? { label: 'Продлить', onClick: () => { setExpiryWarning(null); openBilling() } } : undefined,
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

  const heroServer = activeServer || allServers[0] || null
  let heroCta = null
  if (!allServers.length) {
    heroCta = authed
      ? {
          label: 'Оформить подписку', icon: 'crown', onClick: () => openBilling(),
          hint: plan.kind === 'expired' ? 'Подписка закончилась' : 'Подключите защиту · до 5 устройств',
          // промокод вводится на экране оплаты
          secondary: { label: 'Ввести промокод', onClick: () => openBilling() },
        }
      : { label: 'Войти', icon: 'user', onClick: () => setGuest(false), hint: 'Пробный доступ закончился' }
  }

  let pageEl
  if (nav.page === 'servers') {
    pageEl = (
      <ServersPage
        servers={allServers}
        activeServerId={activeServerId}
        activeServer={activeServer}
        vpnStatus={vpnStatus}
        pinging={pinging}
        plan={plan}
        offer={offer}
        stats={stats}
        exposure={exposure}
        onSelect={handleSelectServer}
        onPingAll={handlePingAll}
        onBuyBypass={authed ? () => openBilling({ prefer: 'bypass' }) : null}
        onEmpty={() => openBilling()}
        emptyLabel={authed ? 'Оформить подписку' : 'Войти'}
      />
    )
  } else if (nav.page === 'news') {
    pageEl = (
      <NewsPage
        items={news.items}
        error={news.error}
        unread={unread}
        servers={allServers}
        onRead={saveNewsRead}
        onReadAll={() => saveNewsRead(unread)}
      />
    )
  } else if (nav.page === 'settings') {
    pageEl = (
      <SettingsPage
        authed={!!authed}
        plan={plan}
        view={subView}
        theme={theme}
        onTheme={setTheme}
        onOpen={open}
        onLogin={() => setGuest(false)}
        onLogout={handleLogout}
        onToast={addToast}
        vpnStatus={vpnStatus}
        version={version}
        sheet={top?.screen || null}
      />
    )
  } else {
    pageEl = (
      <HomePage
        banners={[] /* TODO(redesign): баннеры и экраны из админки с таргетингом по версии — следующая волна */}
        hero={{
          status: vpnStatus,
          palette,
          connectedAt,
          tunMode: vpnPrefs.tunMode,
          bypassRu: vpnPrefs.bypassRu,
          server: heroServer,
          serversCount: allServers.length,
          error: connectError,
          ip: exposure.ip,
          cta: heroCta,
          onConnect: handleConnect,
          onServers: () => go('servers'),
        }}
        bento={{
          on,
          status: vpnStatus,
          stats,
          exposure,
          server: heroServer,
          plan,
          cheapest,
          onCheck: () => open('check'),
          onRenew: () => openBilling(),
          onChangeTariff: () => openBilling({ mode: 'change' }),
          onLogin: () => setGuest(false),
        }}
      />
    )
  }

  let screenEl = null
  if (top) {
    switch (top.screen) {
      case 'billing':
        screenEl = <BillingPanel onClose={back} initialMode={top.params?.mode || 'buy'} prefer={top.params?.prefer || null} />
        break
      case 'support': screenEl = <SupportPanel onClose={back} />; break
      case 'history': screenEl = <HistoryPanel onClose={back} />; break
      case 'check': screenEl = <ConnectionCheckPanel onClose={back} />; break
      case 'domains':
        screenEl = <LegacyScreen onClose={back}><BypassDomainsScreen onBack={back} /></LegacyScreen>
        break
      case 'licenses':
        screenEl = <LegacyScreen onClose={back}><LicensesScreen onBack={back} /></LegacyScreen>
        break
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
          badges={{ news: unread.length }}
          plan={plan}
          version={version}
          onRenew={() => openBilling()}
          onLogin={() => setGuest(false)}
        />
        <main className="content">
          <div className={`page page--${nav.page}`} key={nav.page} inert={top ? '' : undefined}>
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
