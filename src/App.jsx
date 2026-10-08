import { useState, useEffect, useCallback, useMemo, useReducer, useRef } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import BottomTabs from './components/BottomTabs'
import Notices from './components/Notices'
import BillingPanel from './components/BillingPanel'
import ConnectionCheckPanel from './components/ConnectionCheckPanel'
import LicensesScreen from './components/LicensesScreen'
import { TimerCapsule, GuestStrip, GuestEnded } from './components/Guest'
import { BannerScreen, UpdateGate, bannerIcon, bannerTone } from './components/Banners'
import Onboarding from './onboarding/Onboarding'
import HomePage from './pages/HomePage'
import ServersPage from './pages/ServersPage'
import NewsPage from './pages/NewsPage'
import SettingsPage from './pages/SettingsPage'
import DomainsScreen from './screens/DomainsScreen'
import EmailScreen from './screens/EmailScreen'
import PaymentsScreen from './screens/PaymentsScreen'
import PaymentMethodScreen from './screens/PaymentMethodScreen'
import PromoScreen from './screens/PromoScreen'
import SupportScreen from './screens/SupportScreen'
import KnowledgeScreen from './screens/KnowledgeScreen'
import LogsScreen from './screens/LogsScreen'
import PrivacyScreen from './screens/PrivacyScreen'
import { Aurora } from './components/ui'
import { navReducer, initialNav, topScreen } from './lib/nav.mjs'
import { planSummary, glowPalette, bypassOffer, cheapestMonthly } from './lib/plan.mjs'
import { flattenServers } from './lib/servers.mjs'
import { exposureView } from './lib/stats.mjs'
import { unreadKeys, markRead } from './lib/news.mjs'
import { guestView, trialMinutes, serverTrialEnabled, retryLabel } from './lib/guest.mjs'
import { belowMinVersion } from './lib/banners.mjs'
import { useTheme } from './lib/theme.js'
import { useWindowMaximized, usePauseWhenHidden, useEscape } from './lib/window.js'
import { useNow } from './lib/time.js'
import { useVpnStats, useExposure } from './lib/vpnData.js'
import { useGuestState, useBanners } from './lib/appData.js'

// Окно ПК (редизайн): заголовок 40 px, боковое меню 216 px (уже 760 px — нижние
// вкладки), область контента. Разделы — Главная / Серверы / Новости / Настройки;
// подэкраны настроек (new-scr-*) открываются вместо раздела, оплата, проверка
// соединения и лицензии — поверх него; закрываются «Назад» и Esc.
// До входа — знакомство и вход (new-onb-*); гость с пробным доступом на 15 минут
// пользуется приложением, по окончании видит «15 минут прошли» (new-guest-*).

const NEWS_REFRESH_MS = 30 * 60 * 1000
const DOWNLOAD_URL = 'https://liptonone.online/download/windows'
const DEFAULT_BOT_URL = 'https://t.me/liptonvpn_bot'

// Подэкраны настроек — во всю область контента.
const SCREENS = new Set(['domains', 'email', 'history', 'payment', 'promo', 'support', 'kb', 'logs', 'privacy'])

// Окно без разделов (загрузка, знакомство, обязательное обновление) — тот же заголовок и свечение.
function Frame({ maximized, onToggleMaximize, children, palette = 'active' }) {
  return (
    <div className="app" data-state={palette} data-maximized={maximized ? 'true' : 'false'}>
      <Aurora variant="page" palette={palette} />
      <TitleBar maximized={maximized} onToggleMaximize={onToggleMaximize} />
      {children}
    </div>
  )
}

// Старые экраны (лицензии) рисуются внутри панели-подэкрана.
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
  const [gate, setGate] = useState(null) // { step, params } — знакомство/вход поверх приложения
  const [update, setUpdate] = useState(null)
  const [updateAvailable, setUpdateAvailable] = useState(null)
  const [forced, setForced] = useState({ state: 'idle', percent: 0 }) // обновление по кнопке
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
  const [daily, setDaily] = useState({ retryAt: null, busy: false, unsupported: false })

  const [nav, dispatch] = useReducer(navReducer, initialNav)
  const { theme, setTheme } = useTheme()
  const [maximized, toggleMaximize] = useWindowMaximized()
  usePauseWhenHidden()
  const toastTimers = useRef(new Set())
  const installWhenReady = useRef(false)
  const { guest: guestRaw, ready: guestReady, refresh: refreshGuest } = useGuestState()

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

  // Тарифы и флаги (/config публичный): цены, гостевой доступ, мин. версия.
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
    window.api.dailyTrialState?.().then(s => { if (alive) setDaily(d => ({ ...d, retryAt: s?.retryAt || null })) }).catch(() => {})
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

  // Вход выполнен (из знакомства или поверх гостевого режима).
  const handleLogin = useCallback(async () => {
    setAuthed(true)
    setGate(null)
    setFirstLaunch(false)
    dispatch({ type: 'reset' })
    const subs = await window.api.subList()
    setSubscriptions(subs || [])
  }, [])

  const handleLogout = useCallback(async () => {
    await window.api.authLogout()
    setSubscriptions([])
    setActiveServerId(null)
    setVpnStatus('disconnected')
    dispatch({ type: 'reset' })
    setGate(null)
    setAuthed(false)
    refreshGuest()
  }, [refreshGuest])

  // Пробный доступ запущен из знакомства — входим в приложение гостем.
  const handleGuest = useCallback(async () => {
    setGate(null)
    setFirstLaunch(false)
    dispatch({ type: 'reset' })
    await refreshGuest()
    const subs = await window.api.subList()
    setSubscriptions(subs || [])
  }, [refreshGuest])

  const openAuth = useCallback((step = 'login', params = null) => setGate({ step, params }), [])

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
      if (data.event === 'downloaded') {
        setUpdate(data)
        setUpdateAvailable(null)
        // «Обновить» уже нажали — ставим сразу
        if (installWhenReady.current) { setForced({ state: 'ready', percent: 100 }); window.api.installUpdate() }
      }
      if (data.event === 'available') setUpdateAvailable(data)
      if (data.event === 'error' && installWhenReady.current) {
        installWhenReady.current = false
        setForced({ state: 'failed', percent: 0 })
        window.api.openExternal?.(DOWNLOAD_URL)
      }
    })
    const offProg = window.api.onUpdateProgress?.(p => {
      setForced(f => (f.state === 'downloading' || f.state === 'checking' ? { state: 'downloading', percent: Number(p?.percent) || 0 } : f))
    })
    const offExp = window.api.onExpiryWarning(data => {
      setExpiryWarning(data)
    })
    const offAddResult = window.api.onSubAddResult?.(data => {
      if (data.success) addToast('Подписка добавлена', 'success')
      else addToast(data.error || 'Ошибка добавления подписки', 'error')
    })
    return () => { offVpn?.(); offSub?.(); offUpd?.(); offProg?.(); offExp?.(); offAddResult?.() }
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
  useEscape(back, !!top && !gate)

  // Обратный отсчёт пробного доступа тикает раз в секунду, дни подписки — раз в минуту.
  const minutes = trialMinutes(config)
  const guestTicking = !authed && guestRaw?.session === true
  const dailyTicking = !!authed && subscriptions.some(s => s?.isTrial && s?.daily)
  const now = useNow(guestTicking || dailyTicking ? 1000 : 60000)
  const guest = useMemo(() => guestView({ guest: guestRaw, authed: !!authed, now, minutes }), [guestRaw, authed, now, minutes])
  const guestMode = guest.mode
  const plan = useMemo(
    () => planSummary({ subscriptions, view: subView, config, guest: guestMode !== 'none', now }),
    [subscriptions, subView, config, guestMode, now],
  )
  const palette = glowPalette(vpnStatus, plan)
  const on = vpnStatus === 'connected' || vpnStatus === 'reconnecting'

  // Данные плиток: статистика ядра (главная и серверы) и «что видят сайты».
  const statsWanted = !top && (nav.page === 'home' || nav.page === 'servers')
  const stats = useVpnStats(!loading && statsWanted && guestMode !== 'ended')
  const check = useExposure(vpnStatus)
  const exposure = useMemo(() => exposureView(check, { on }), [check, on])
  const offer = useMemo(() => bypassOffer(config), [config])
  const cheapest = useMemo(() => cheapestMonthly(config), [config])
  const botUrl = config?.support_bot_url || DEFAULT_BOT_URL

  const unread = useMemo(() => unreadKeys(news.items || [], newsRead), [news.items, newsRead])
  const banners = useBanners({ authed: !!authed, enabled: !loading, now })

  const openBilling = useCallback((params) => {
    if (authed) open('billing', params)
    else openAuth('start') // гость: сначала аккаунт
  }, [authed, open, openAuth])

  // «Обновить»: скачанное ставим сразу; иначе ищем и качаем (поставится само);
  // не вышло (нет обновления у автообновления, dev) — страница загрузки.
  const runUpdate = useCallback(async (fallbackUrl) => {
    if (update) { setForced({ state: 'ready', percent: 100 }); window.api.installUpdate(); return }
    installWhenReady.current = true
    setForced({ state: 'checking', percent: 0 })
    const r = await window.api.checkForUpdates?.().catch(() => null)
    if (r?.status === 'available') { setForced(f => (f.state === 'checking' ? { state: 'downloading', percent: 0 } : f)); return }
    installWhenReady.current = false
    setForced({ state: 'failed', percent: 0 })
    window.api.openExternal?.(fallbackUrl || DOWNLOAD_URL)
  }, [update])

  // «15 минут бесплатно» для вошедших без подписки (раз в день).
  const startDaily = useCallback(async () => {
    if (daily.busy) return
    setDaily(d => ({ ...d, busy: true }))
    const r = await window.api.dailyTrial?.().catch(e => ({ success: false, error: e?.message }))
    setDaily(d => ({
      ...d,
      busy: false,
      retryAt: r?.code === 'daily_trial_used' ? r.retryAt || d.retryAt : r?.success ? Date.now() + 86400000 : d.retryAt,
      unsupported: d.unsupported || r?.code === 'unsupported',
    }))
    if (r?.success) addToast('15 минут бесплатно — можно подключаться')
    else addToast(r?.error || 'Не удалось включить бесплатные минуты', 'error')
  }, [daily.busy, addToast])

  if (loading || !guestReady) {
    return (
      <Frame maximized={maximized} onToggleMaximize={toggleMaximize}>
        <div className="loading"><span className="ui-spinner ui-spinner--lg" aria-label="Загрузка" /></div>
      </Frame>
    )
  }

  // Обязательное обновление: баннер kind=update без «закрыть» или версия ниже минимальной.
  const forcedBanner = banners.blocking || (belowMinVersion(version, config) ? { id: 'min-version', ctaUrl: DOWNLOAD_URL } : null)
  if (forcedBanner) {
    return (
      <Frame maximized={maximized} onToggleMaximize={toggleMaximize} palette="off">
        <UpdateGate banner={forcedBanner} version={version} update={forced} onUpdate={() => runUpdate(forcedBanner.ctaUrl)} />
      </Frame>
    )
  }

  // Знакомство и вход: до входа (если не гость), поверх гостевого режима по
  // кнопке «Войти / Создать аккаунт», и «Как пользоваться» при первом запуске.
  const needGate = authed === false && guestMode === 'none'
  if (needGate || gate || (authed && firstLaunch)) {
    const step = gate?.step || (authed && firstLaunch ? 'howto' : 'welcome')
    return (
      <Frame maximized={maximized} onToggleMaximize={toggleMaximize} palette={step === 'welcome' || step === 'trial' ? 'active' : 'off'}>
        <Onboarding
          key="onb"
          initialStep={step}
          initialParams={gate?.params || null}
          config={config}
          guest={guestRaw}
          firstLaunch={firstLaunch}
          onClose={gate && !needGate ? () => setGate(null) : null}
          onAuthed={handleLogin}
          onGuest={handleGuest}
          onHowtoDone={() => setFirstLaunch(false)}
        />
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

  // Кнопка без серверов: вошедшим — «Оформить подписку» и «15 минут бесплатно»
  // (если сервер их выдаёт и сегодня ещё не брали) или «Ввести промокод».
  const heroServer = activeServer || allServers[0] || null
  const dailyRetry = daily.retryAt && daily.retryAt > now ? daily.retryAt : null
  const dailyOk = !!authed && serverTrialEnabled(config) && !daily.unsupported && !dailyRetry
  let heroCta = null
  if (!allServers.length) {
    heroCta = authed
      ? {
          label: 'Оформить подписку', icon: 'crown', onClick: () => openBilling(),
          hint: plan.kind === 'expired' ? 'Подписка закончилась'
            : dailyRetry ? `15 минут бесплатно — снова ${retryLabel(dailyRetry, now)}`
              : 'Подключите защиту · до 5 устройств',
          secondary: dailyOk
            ? { label: daily.busy ? 'Включаем…' : '15 минут бесплатно', onClick: startDaily }
            : { label: 'Ввести промокод', onClick: () => open('promo') },
        }
      : { label: 'Создать аккаунт', icon: 'user', onClick: () => openAuth('start'), hint: 'Пробный доступ закончился' }
  }

  // Баннеры из админки над главной (и необязательное обновление).
  const slotBanners = banners.slot.map(b => ({
    id: b.id,
    tone: bannerTone(b),
    icon: bannerIcon(b),
    title: b.title,
    text: b.text,
    action: b.kind === 'update'
      ? { label: b.ctaText || 'Обновить', onClick: () => runUpdate(b.ctaUrl) }
      : b.ctaUrl ? { label: b.ctaText || 'Подробнее', onClick: () => window.api.openExternal?.(b.ctaUrl) } : undefined,
    onClose: b.dismissible ? () => banners.dismiss(b) : undefined,
  }))

  let pageEl
  if (top && SCREENS.has(top.screen)) {
    const screenProps = { onBack: back, onToast: addToast }
    switch (top.screen) {
      case 'domains': pageEl = <DomainsScreen {...screenProps} />; break
      case 'email': pageEl = <EmailScreen {...screenProps} />; break
      case 'history': pageEl = <PaymentsScreen {...screenProps} />; break
      case 'payment': pageEl = <PaymentMethodScreen {...screenProps} plan={plan} onPay={() => open('billing')} />; break
      case 'promo': pageEl = <PromoScreen {...screenProps} cheapest={cheapest} onPay={authed ? () => open('billing') : null} />; break
      case 'support': pageEl = <SupportScreen {...screenProps} botUrl={botUrl} />; break
      case 'kb':
        pageEl = <KnowledgeScreen {...screenProps} onSupport={() => (authed ? open('support') : window.api.openExternal?.(botUrl))} />
        break
      case 'logs': pageEl = <LogsScreen {...screenProps} authed={!!authed} botUrl={botUrl} />; break
      case 'privacy': pageEl = <PrivacyScreen {...screenProps} onLicenses={() => open('licenses')} botName={config?.support_bot || '@liptonvpn_bot'} />; break
      default: pageEl = null
    }
  } else if (nav.page === 'servers') {
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
        emptyLabel={authed ? 'Оформить подписку' : 'Создать аккаунт'}
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
        onLogin={() => openAuth('login')}
        onLogout={handleLogout}
        onToast={addToast}
        vpnStatus={vpnStatus}
        version={version}
        sheet={top?.screen || null}
        guest={guest}
        onAuth={openAuth}
      />
    )
  } else if (guestMode === 'ended') {
    pageEl = (
      <GuestEnded
        minutes={Math.round((guest.totalMs || minutes * 60000) / 60000) || minutes}
        retryAt={guest.retryAt}
        cheapest={cheapest}
        onCreate={() => openAuth('start')}
        onLogin={() => openAuth('login')}
        onTariffs={() => openAuth('start')}
      />
    )
  } else {
    pageEl = (
      <HomePage
        top={guestMode === 'active' ? (
          <GuestStrip
            msLeft={guest.msLeft}
            totalMs={guest.totalMs}
            progress={guest.progress}
            onCreate={() => openAuth('start')}
            onLogin={() => openAuth('login')}
          />
        ) : null}
        banners={slotBanners}
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
          onLogin: () => openAuth('start'),
        }}
      />
    )
  }

  let sheetEl = null
  if (top && !SCREENS.has(top.screen)) {
    switch (top.screen) {
      case 'billing':
        sheetEl = <BillingPanel onClose={back} initialMode={top.params?.mode || 'buy'} prefer={top.params?.prefer || null} />
        break
      case 'check': sheetEl = <ConnectionCheckPanel onClose={back} />; break
      case 'licenses':
        sheetEl = <LegacyScreen onClose={back}><LicensesScreen onBack={back} /></LegacyScreen>
        break
      default: sheetEl = null
    }
  }

  // Капсула-таймер в заголовке: гость или «15 минут бесплатно».
  let titleExtra = null
  if (guestMode === 'active' || guestMode === 'ended') titleExtra = <TimerCapsule msLeft={guest.msLeft} />
  else if (plan.kind === 'daily') titleExtra = <TimerCapsule msLeft={plan.msLeft} title="15 минут бесплатно" />

  const pageKey = top && SCREENS.has(top.screen) ? `scr-${top.screen}` : nav.page
  const showScreenBanner = banners.screen && !top && !sheetEl

  return (
    <div className="app" data-state={palette} data-maximized={maximized ? 'true' : 'false'}>
      <Aurora variant="page" palette={palette} />
      <TitleBar maximized={maximized} onToggleMaximize={toggleMaximize}>{titleExtra}</TitleBar>
      <div className="shell">
        <Sidebar
          page={nav.page}
          onNavigate={go}
          badges={{ news: unread.length }}
          plan={plan}
          version={version}
          onRenew={() => openBilling()}
          onLogin={() => openAuth(guestMode === 'active' ? 'start' : 'login')}
          guestRetryAt={guest.retryAt}
        />
        <main className="content">
          <div
            className={`page page--${top && SCREENS.has(top.screen) ? `screen page--scr-${top.screen}` : nav.page}`}
            key={pageKey}
            inert={sheetEl ? '' : undefined}
          >
            {pageEl}
          </div>
          {sheetEl && (
            <div className="legacy-sheet" key={top.screen}>
              {sheetEl}
            </div>
          )}
          <Notices items={notices} />
          <BottomTabs page={nav.page} onNavigate={go} badges={{ news: unread.length }} />
          {showScreenBanner && (
            <BannerScreen
              banner={banners.screen}
              onClose={() => banners.dismiss(banners.screen)}
              onAction={() => {
                const b = banners.screen
                if (b.kind === 'update') runUpdate(b.ctaUrl)
                else if (b.ctaUrl) window.api.openExternal?.(b.ctaUrl)
                banners.dismiss(b)
              }}
            />
          )}
        </main>
      </div>
    </div>
  )
}
