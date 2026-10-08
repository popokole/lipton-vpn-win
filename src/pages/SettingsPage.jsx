import { useCallback, useEffect, useRef, useState } from 'react'
import { Glass, Segmented, Button, Icon, Switch, Progress, ConfirmDialog } from '../components/ui'
import { daysWord, rub } from '../lib/plan.mjs'
import {
  lastSeenLabel, deviceInfo, sinceLabel, initialOf, domainsWord, domainName, cancelWarning,
} from '../lib/settings.mjs'

// Настройки (макеты new-pc-settings-full / -play): на ПК в них же профиль.
// Слева — аккаунт, подписка, устройства, приложение, оплата; справа — VPN,
// помощь, о приложении, «Отменить подписку» и «Выйти». Подэкраны (домены,
// проверка соединения, оплата, поддержка, история, лицензии) — через onOpen.

const SITE = 'https://liptonone.online'
const BOT = 'https://t.me/liptonvpn_bot'

const THEME_OPTIONS = [
  { value: 'dark', label: 'Тёмная', icon: <Icon name="moon" size={14} /> },
  { value: 'light', label: 'Светлая', icon: <Icon name="sun" size={14} /> },
  { value: 'system', label: 'Системная', icon: <Icon name="contrast" size={14} /> },
]

const MODE_OPTIONS = [
  { value: 'tun', label: 'Весь трафик', sub: 'TUN · игры и UDP' },
  { value: 'proxy', label: 'Только браузеры', sub: 'системный прокси' },
]

const STATUS_BADGE = {
  active: 'Активна',
  trial: 'Пробный период',
  expired: 'Истекла',
  none: 'Нет подписки',
}

function Section({ title, meta, children }) {
  return (
    <section className="set-section">
      <div className="set-overline-row">
        <span className="ui-overline">{title}</span>
        {meta != null && <span className="set-overline-meta num">{meta}</span>}
      </div>
      {children}
    </section>
  )
}

// Строка настроек: иконка 32 в квадрате, заголовок, подпись, справа — действие.
function Row({ icon, iconTone, title, sub, subTone, onClick, right, chevron, children, className = '', disabled = false }) {
  const body = (
    <>
      <span className={`set-ico${iconTone ? ` set-ico--${iconTone}` : ''}`} aria-hidden="true"><Icon name={icon} size={16} stroke={2} /></span>
      <span className="set-row-text">
        <span className="set-row-title">{title}</span>
        {sub && <span className={`set-row-sub${subTone ? ` set-row-sub--${subTone}` : ''}`}>{sub}</span>}
        {children}
      </span>
      {right}
      {chevron && <Icon name="chevronRight" size={16} stroke={2} className="set-row-chev" />}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className={`set-row set-row--link ${className}`} onClick={onClick} disabled={disabled}>
        {body}
      </button>
    )
  }
  return <div className={`set-row ${className}`}>{body}</div>
}

function ToggleRow({ icon, title, sub, value, onChange, disabled }) {
  return (
    <Row
      icon={icon}
      title={title}
      sub={sub}
      right={<Switch checked={value} onChange={onChange} label={title} disabled={disabled} />}
    />
  )
}

// ─── Аккаунт ────────────────────────────────────────────────────────────────
function AccountCard({ profile, identities, onUnlinkTelegram, onLogin, authed }) {
  if (!authed) {
    return (
      <Glass className="set-card ui-rise" style={{ '--i': 1 }}>
        <Row
          icon="user"
          title="Вы без аккаунта"
          sub="Настройки хранятся только на этом устройстве"
          right={<Button size="sm" variant="primary" onClick={onLogin}>Войти</Button>}
        />
        <Row icon="send" title="Создать аккаунт через Telegram" sub="@liptonvpn_bot · пара нажатий" chevron onClick={() => window.api?.openExternal?.(BOT)} />
      </Glass>
    )
  }
  const email = profile?.email || ''
  const tg = (identities || []).find(i => i.type === 'telegram')
  const tgLinked = !!(tg || profile?.telegram_linked)
  // отвязать можно, только если останется другой способ входа
  const canUnlinkTg = !!tg && (identities || []).length > 1
  const name = email ? email.split('@')[0] : tgLinked ? 'Аккаунт Telegram' : 'Аккаунт Lipton'
  const since = sinceLabel(profile?.created_at)
  const avatar = typeof profile?.avatar === 'string' && /^data:image\//.test(profile.avatar) ? profile.avatar : null

  return (
    <Glass className="set-card ui-rise" style={{ '--i': 1 }}>
      <div className="set-row set-account">
        <span className="set-avatar" aria-hidden="true">
          {avatar ? <img src={avatar} alt="" /> : <span>{initialOf(name)}</span>}
          {tgLinked && <i className="set-avatar-badge"><Icon name="send" size={10} stroke={2.4} /></i>}
        </span>
        <span className="set-row-text">
          <span className="set-account-name">{name}</span>
          <span className="set-row-sub">{[avatar ? 'Аватар из Telegram' : '', since].filter(Boolean).join(' · ') || 'Аккаунт Lipton VPN'}</span>
        </span>
      </div>
      <Row
        icon="mail"
        title="Почта"
        sub={email || 'не привязана'}
        right={
          // TODO(redesign): смена почты внутри приложения — экран new-scr-email (D4, часть 2)
          <Button size="sm" onClick={() => window.api?.openExternal?.(`${SITE}/app/settings`)}>{email ? 'Изменить' : 'Привязать'}</Button>
        }
      />
      <Row
        icon="send"
        title="Telegram"
        sub={tgLinked ? 'привязан · вход через бота' : 'не привязан'}
        right={tgLinked
          ? (canUnlinkTg ? <Button size="sm" onClick={() => onUnlinkTelegram(tg)}>Отвязать</Button> : null)
          : <Button size="sm" onClick={() => window.api?.openExternal?.(`${SITE}/app/settings`)}>Привязать</Button>}
      />
      <Row
        icon="gift"
        title="Пригласить друга"
        sub="Бонусные дни за друзей · на сайте"
        chevron
        onClick={() => window.api?.openExternal?.(`${SITE}/app/referral`)}
      />
    </Glass>
  )
}

// ─── Подписка ───────────────────────────────────────────────────────────────
function SubscriptionCard({ plan, view, onRenew, onChange, onSync, syncing }) {
  const kind = plan?.kind || 'none'
  const has = kind === 'active' || kind === 'trial'
  const period = plan?.periodDays || 30
  const days = plan ? `${plan.daysLeft} ${daysWord(plan.daysLeft)}` : ''
  const canChange = view?.status === 'active' || view?.status === 'grace'
  return (
    <Glass edge={has} className={`set-card set-sub set-sub--${kind} ui-rise`} style={{ '--i': 2 }}>
      <div className="set-sub-head">
        <span className="set-sub-title"><Icon name="crown" size={16} stroke={2} /><span>{plan?.title || 'Подписка'}</span></span>
        <span className="set-sub-head-right">
          <span className={`set-badge set-badge--${has ? 'ok' : 'warn'}`}><i aria-hidden="true" />{STATUS_BADGE[kind] || 'Нет подписки'}</span>
          {canChange && (
            <button type="button" className="ui-icon-btn set-sub-sync" onClick={onSync} disabled={syncing} aria-label="Обновить данные подписки" title="Обновить данные подписки">
              {syncing ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : <Icon name="refresh" size={14} stroke={2} />}
            </button>
          )}
        </span>
      </div>
      {has && (
        <>
          <div className="set-sub-until">{plan.untilLabel}{plan.untilLabel ? ' · ' : ''}осталось {days}</div>
          <Progress value={plan.progress} thick className="set-sub-progress" label={`Осталось ${days}`} />
          <div className="set-sub-meta num">
            <span>{plan.priceKopeks ? `${rub(plan.priceKopeks)} за ${period} ${daysWord(period)}` : (kind === 'trial' ? 'пробный период' : '')}</span>
            <span>{Math.min(plan.daysLeft, period)} из {period} {daysWord(period)}</span>
          </div>
        </>
      )}
      {!has && (
        <div className="set-sub-until">
          {kind === 'expired' && plan?.untilLabel ? plan.untilLabel.replace(/^до /, 'Закончилась ') : 'До 5 устройств · без лимита трафика'}
        </div>
      )}
      {view?.overlay && (
        <div className="set-sub-note">
          Сейчас «{view.overlay.tariff_title}»{view.overlay.until ? ` до ${new Date(view.overlay.until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` : ''}
          {view.overlay.revert_tariff_title ? `, потом снова «${view.overlay.revert_tariff_title}»` : ''}
        </div>
      )}
      <div className="set-sub-actions">
        <Button variant="primary" onClick={onRenew}>{has ? 'Продлить' : kind === 'expired' ? 'Продлить' : 'Оформить подписку'}</Button>
        {canChange
          ? <Button onClick={onChange}>Сменить тариф</Button>
          : <Button onClick={onSync} disabled={syncing} icon={syncing ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : <Icon name="refresh" size={14} stroke={2} />}>Обновить</Button>}
      </div>
    </Glass>
  )
}

// ─── Устройства ─────────────────────────────────────────────────────────────
function DevicesCard({ devices, error, loading, myHwid, onRevoke, onRelink, onRevokeAll }) {
  const list = devices || []
  return (
    <Glass className="set-card ui-rise" style={{ '--i': 3 }}>
      {loading && !list.length && <div className="set-row set-row--muted"><span className="ui-spinner ui-spinner--sm" aria-hidden="true" /><span>Загружаем устройства…</span></div>}
      {error && !list.length && <div className="set-row set-row--muted">{error}</div>}
      {!loading && !error && !list.length && (
        <div className="set-row set-row--muted">Устройства появятся после первого подключения</div>
      )}
      {list.map(d => {
        const info = deviceInfo(d)
        const mine = myHwid && d.hwid === myHwid
        const seen = lastSeenLabel(d.updated_at)
        return (
          <Row
            key={d.hwid}
            icon={info.desktop ? 'desktop' : 'phone'}
            iconTone={mine ? 'accent' : ''}
            title={info.title}
            sub={mine
              ? <><b className="set-mine">Это устройство</b>{seen ? ` · ${seen}` : ''}</>
              : [info.platform, seen].filter(Boolean).join(' · ')}
            right={
              <button type="button" className="ui-icon-btn set-revoke" aria-label={`Отвязать ${info.title}`} title="Отвязать устройство" onClick={() => onRevoke(d, info, mine)}>
                <Icon name="unlink" size={16} stroke={1.8} />
              </button>
            }
          />
        )
      })}
      <Row
        icon="link"
        title="Обновить ссылку"
        sub={<span className="set-warn-line"><Icon name="warning" size={12} stroke={2} />Все устройства отвяжутся</span>}
        right={<Button size="sm" onClick={onRelink}>Обновить</Button>}
      />
      {list.length > 0 && (
        <button type="button" className="set-row set-row--center set-danger-link" onClick={onRevokeAll}>
          <Icon name="unlink" size={16} stroke={1.8} />
          <span>Отвязать все устройства</span>
        </button>
      )}
    </Glass>
  )
}

export default function SettingsPage({
  authed, plan, view, theme, onTheme, onOpen, onLogin, onLogout, onToast, vpnStatus, version, sheet,
}) {
  const on = vpnStatus === 'connected' || vpnStatus === 'reconnecting'
  const hasAccess = authed && (plan?.kind === 'active' || plan?.kind === 'trial')

  // ── Параметры VPN и приложения ──
  const [prefs, setPrefs] = useState({ tunMode: true, bypassRu: true, killSwitch: false, autoConnect: false, autostart: false, notifications: true })
  const [modeChanged, setModeChanged] = useState(false)
  const [domains, setDomains] = useState([])
  const [logs, setLogs] = useState([])
  const [copied, setCopied] = useState(false)
  const [update, setUpdate] = useState(null) // checking | latest | available:x.y.z | error | dev

  // ── Аккаунт ──
  const [profile, setProfile] = useState(null)
  const [identities, setIdentities] = useState([])
  const [txCount, setTxCount] = useState(null)
  const [dev, setDev] = useState({ loading: false, devices: null, limit: null, hwid: null, error: '' })
  const [syncing, setSyncing] = useState(false)

  // ── Диалоги ──
  const [dialog, setDialog] = useState(null) // { kind, ... }
  const [busy, setBusy] = useState(false)
  const [dialogErr, setDialogErr] = useState('')
  const [agree, setAgree] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const toast = useCallback((m, t) => onToast?.(m, t), [onToast])

  useEffect(() => {
    const api = window.api
    if (!api) return
    Promise.all([
      api.getTunMode?.(), api.getBypassRu?.(), api.getKillSwitch?.(), api.getAutoConnect?.(),
      api.getAutostart?.(), api.getNotifications?.(),
    ]).then(([tun, bypass, ks, ac, as, nt]) => {
      if (!alive.current) return
      setPrefs({ tunMode: tun !== false, bypassRu: bypass !== false, killSwitch: !!ks, autoConnect: !!ac, autostart: !!as, notifications: nt !== false })
    }).catch(() => {})
    api.getLogs?.().then(l => { if (alive.current) setLogs(Array.isArray(l) ? l : []) }).catch(() => {})
  }, [])

  // Свои домены — перечитываем, когда закрылся подэкран (их могли изменить там)
  useEffect(() => {
    if (sheet) return
    window.api?.getBypassDomains?.().then(d => { if (alive.current) setDomains(Array.isArray(d) ? d : []) }).catch(() => {})
  }, [sheet])

  const loadDevices = useCallback(() => {
    if (!window.api?.accountDevices) return
    setDev(d => ({ ...d, loading: true, error: '' }))
    window.api.accountDevices().then(r => {
      if (!alive.current) return
      if (r?.success) setDev({ loading: false, devices: r.devices || [], limit: r.device_limit || null, hwid: r.hwid || null, error: '' })
      else setDev(d => ({ ...d, loading: false, error: r?.error || 'Не удалось загрузить устройства' }))
    }).catch(() => { if (alive.current) setDev(d => ({ ...d, loading: false, error: 'Не удалось загрузить устройства' })) })
  }, [])

  useEffect(() => {
    if (!authed) return
    const api = window.api
    api.accountProfile?.().then(r => { if (alive.current && r?.success) setProfile(r.profile || null) }).catch(() => {})
    api.accountIdentities?.().then(r => { if (alive.current && r?.success) setIdentities(r.identities || []) }).catch(() => {})
    api.accountTransactions?.().then(r => { if (alive.current && r?.success) setTxCount((r.transactions || []).length) }).catch(() => {})
  }, [authed])

  useEffect(() => { if (hasAccess) loadDevices() }, [hasAccess, loadDevices])

  const setPref = (key, setter) => async (value) => {
    setPrefs(p => ({ ...p, [key]: value }))
    try { await setter?.(value) } catch { setPrefs(p => ({ ...p, [key]: !value })) }
  }

  const selectMode = async (value) => {
    const tun = value === 'tun'
    if (tun === prefs.tunMode) return
    setPrefs(p => ({ ...p, tunMode: tun }))
    setModeChanged(true)
    await window.api?.setTunMode?.(tun)
  }

  const copyLogs = async () => {
    try {
      const fresh = await window.api?.getLogs?.()
      const lines = Array.isArray(fresh) ? fresh : logs
      setLogs(lines)
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => { if (alive.current) setCopied(false) }, 2000)
    } catch {
      toast('Не удалось скопировать логи', 'error')
    }
  }

  const checkUpdates = async () => {
    if (update === 'checking') return
    setUpdate('checking')
    const r = await window.api?.checkForUpdates?.().catch(() => null)
    if (!alive.current) return
    if (r?.status === 'available') setUpdate(`available:${r.version || ''}`)
    else if (r?.status === 'latest') setUpdate('latest')
    else if (r?.status === 'dev') setUpdate('dev')
    else setUpdate('error')
  }

  const syncSub = async () => {
    setSyncing(true)
    const r = await window.api?.accountSync?.().catch(() => null)
    if (!alive.current) return
    setSyncing(false)
    if (r && !r.success) toast(r.error || 'Не удалось обновить подписку', 'error')
  }

  const openDialog = (d) => { setDialog(d); setDialogErr(''); setAgree(false) }
  const closeDialog = () => { if (!busy) setDialog(null) }

  // Выполнить действие диалога: fn → { success, error }
  const runDialog = async (fn, onOk) => {
    setBusy(true)
    setDialogErr('')
    let r
    try { r = await fn() } catch (e) { r = { success: false, error: e?.message } }
    if (!alive.current) return
    setBusy(false)
    if (r?.success) {
      setDialog(null)
      onOk?.(r)
    } else {
      setDialogErr(r?.error || 'Не получилось, попробуйте ещё раз')
    }
  }

  const confirmDialog = () => {
    const api = window.api
    switch (dialog?.kind) {
      case 'relink':
        return runDialog(() => api.accountRelink(Number.isInteger(view?.link_version) ? view.link_version : undefined), () => {
          toast('Ссылка обновлена — подключите остальные устройства заново')
          loadDevices()
        })
      case 'revoke':
        return runDialog(() => api.accountRevokeDevice(dialog.hwid), () => { toast('Устройство отвязано'); loadDevices() })
      case 'revokeAll':
        return runDialog(() => api.accountRevokeAllDevices(), () => { toast('Все устройства отвязаны'); loadDevices() })
      case 'unlinkTg':
        return runDialog(() => api.accountUnlinkIdentity(dialog.id), () => {
          toast('Telegram отвязан')
          setIdentities(list => list.filter(i => i.id !== dialog.id))
          setProfile(p => (p ? { ...p, telegram_linked: false } : p))
        })
      case 'cancel':
        return runDialog(() => api.accountCancelSubscription(), (r) => {
          toast(r?.already_canceled ? 'Подписка уже отменена' : 'Подписка отменена')
        })
      case 'reset':
        return runDialog(() => api.resetNetwork(), () => toast('Готово — перезагрузите компьютер, чтобы всё применилось'))
      default:
        return null
    }
  }

  const versionSub = (() => {
    if (update === 'checking') return 'проверяем…'
    if (update === 'latest') return 'обновлений нет'
    if (update === 'dev') return 'режим разработки'
    if (update === 'error') return 'не удалось проверить'
    if (update?.startsWith('available')) return `найдено обновление ${update.split(':')[1] || ''}`.trim()
    return 'проверить'
  })()

  const domainList = domains.map(domainName).filter(Boolean)
  const devCount = dev.devices ? dev.devices.length : null
  const devMeta = devCount != null ? `${devCount}${dev.limit ? ` из ${dev.limit}` : ''}` : null

  let dialogProps = null
  if (dialog) {
    switch (dialog.kind) {
      case 'relink':
        dialogProps = {
          icon: 'link', tone: 'warn', title: 'Обновить ссылку?', confirmLabel: 'Обновить ссылку',
          body: 'Старая ссылка и все устройства на ней отключатся, подключите их заново. Это устройство переподключится само.',
        }
        break
      case 'revoke':
        dialogProps = {
          icon: 'unlink', tone: 'warn', title: 'Отвязать устройство?', confirmLabel: 'Отвязать',
          body: dialog.mine
            ? 'Это устройство освободит место в подписке. VPN на нём продолжит работать, пока вы не обновите подписку или ссылку.'
            : `«${dialog.title}» освободит место в подписке. Подключиться снова можно, если есть свободные места.`,
        }
        break
      case 'revokeAll':
        dialogProps = {
          icon: 'unlink', tone: 'warn', title: 'Отвязать все устройства?', confirmLabel: 'Отвязать все',
          body: 'Все места в подписке освободятся, ссылка не изменится. Устройства смогут подключиться снова.',
        }
        break
      case 'unlinkTg':
        dialogProps = {
          icon: 'send', tone: 'warn', title: 'Отвязать Telegram?', confirmLabel: 'Отвязать',
          body: 'Входить через бота больше не получится — останется вход по почте.',
        }
        break
      case 'cancel':
        dialogProps = {
          icon: 'xCircle', tone: 'danger', title: 'Отменить подписку?', confirmLabel: 'Отменить подписку', cancelLabel: 'Не отменять',
          confirmDisabled: !agree,
          body: (
            <>
              {cancelWarning({ daysLeft: plan?.daysLeft || 0, untilLabel: plan?.untilLabel || '', hasCard: !!profile?.has_card })}
              <label className="dialog-check">
                <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} disabled={busy} />
                <span>Понимаю, что деньги не вернутся</span>
              </label>
            </>
          ),
        }
        break
      case 'reset':
        dialogProps = {
          icon: 'reset', tone: 'warn', title: 'Сбросить настройки сети?', confirmLabel: 'Сбросить',
          body: 'VPN отключится. Сбросим прокси Windows, DNS на автоматический, маршруты TUN, Winsock и стек TCP/IP. Чтобы всё применилось, перезагрузите компьютер.',
        }
        break
      default:
        dialogProps = null
    }
  }

  return (
    <>
      <div className="page-head">
        <h1 className="ui-h1">Настройки</h1>
        <span className="ui-h1-sub">Аккаунт, подписка и параметры VPN</span>
      </div>

      <div className="cols-2 set-cols">
        <div className="col">
          <Section title="Аккаунт">
            <AccountCard
              authed={authed}
              profile={profile}
              identities={identities}
              onLogin={onLogin}
              onUnlinkTelegram={tg => openDialog({ kind: 'unlinkTg', id: tg.id })}
            />
          </Section>

          {authed && (
            <Section title="Подписка">
              <SubscriptionCard
                plan={plan}
                view={view}
                syncing={syncing}
                onSync={syncSub}
                onRenew={() => onOpen('billing')}
                onChange={() => onOpen('billing', { mode: 'change' })}
              />
            </Section>
          )}

          {hasAccess && (
            <Section title="Устройства" meta={devMeta}>
              <DevicesCard
                devices={dev.devices}
                error={dev.error}
                loading={dev.loading}
                myHwid={dev.hwid}
                onRevoke={(d, info, mine) => openDialog({ kind: 'revoke', hwid: d.hwid, title: info.title, mine })}
                onRelink={() => openDialog({ kind: 'relink' })}
                onRevokeAll={() => openDialog({ kind: 'revokeAll' })}
              />
            </Section>
          )}

          <Section title="Приложение">
            <Glass className="set-card ui-rise" style={{ '--i': 4 }}>
              <div className="set-row set-row--stack">
                <div className="set-row-line">
                  <span className="set-ico" aria-hidden="true"><Icon name="palette" size={16} stroke={2} /></span>
                  <span className="set-row-text"><span className="set-row-title">Тема</span></span>
                </div>
                <Segmented label="Тема" value={theme} onChange={onTheme} options={THEME_OPTIONS} />
              </div>
              <ToggleRow
                icon="bell"
                title="Уведомления"
                sub="Об окончании подписки"
                value={prefs.notifications}
                onChange={setPref('notifications', v => window.api?.setNotifications?.(v))}
              />
              {/* TODO(redesign): другие языки интерфейса — пока только русский */}
              <Row icon="translate" title="Язык" right={<span className="set-value">Русский</span>} />
            </Glass>
          </Section>

          {authed && (
            <Section title="Оплата">
              <Glass className="set-card ui-rise" style={{ '--i': 5 }}>
                <Row
                  icon="receipt"
                  title="История платежей"
                  sub="Оплаты и продления"
                  right={txCount ? <span className="set-value num">{txCount}</span> : null}
                  chevron
                  onClick={() => onOpen('history')}
                />
                {/* TODO(redesign): отдельный экран «Способ оплаты» с отвязкой и кулдауном 24 ч — D4, часть 2 */}
                <Row
                  icon="card"
                  title="Способ оплаты"
                  right={<span className="set-value num">{profile?.has_card ? `•••• ${profile.card_last4 || '••••'}` : 'не привязан'}</span>}
                  chevron
                  onClick={() => onOpen('account')}
                />
              </Glass>
            </Section>
          )}
        </div>

        <div className="col">
          <Section title="VPN">
            <Glass className="set-card ui-rise" style={{ '--i': 2 }}>
              <div className="set-row set-row--stack">
                <div className="set-row-line">
                  <span className="set-ico" aria-hidden="true"><Icon name="layers" size={16} stroke={2} /></span>
                  <span className="set-row-text"><span className="set-row-title">Режим подключения</span></span>
                </div>
                <Segmented tall label="Режим подключения" value={prefs.tunMode ? 'tun' : 'proxy'} onChange={selectMode} options={MODE_OPTIONS} />
                {modeChanged && on && <span className="set-note">Новый режим включится при следующем подключении</span>}
              </div>
              <ToggleRow
                icon="branch"
                title="Обход российских сайтов"
                sub="Российские сайты — напрямую"
                value={prefs.bypassRu}
                onChange={setPref('bypassRu', v => window.api?.setBypassRu?.(v))}
              />
              <button type="button" className="set-row set-row--link set-row--domains" onClick={() => onOpen('domains')}>
                <span className="set-row-line">
                  <span className="set-ico" aria-hidden="true"><Icon name="list" size={16} stroke={2} /></span>
                  <span className="set-row-text">
                    <span className="set-row-title">Свои домены для обхода</span>
                    <span className="set-row-sub">
                      {domainList.length ? `${domainList.length} ${domainsWord(domainList.length)} · идут напрямую, минуя VPN` : 'Сайты, которые пойдут напрямую, минуя VPN'}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={16} stroke={2} className="set-row-chev" />
                </span>
                <span className="set-chips">
                  {domainList.slice(0, 3).map(d => <span key={d} className="set-chip">{d}</span>)}
                  {domainList.length > 3 && <span className="set-chip">+{domainList.length - 3}</span>}
                  <span className="set-chip set-chip--add"><Icon name="plus" size={12} stroke={2.2} />Добавить</span>
                </span>
              </button>
              <ToggleRow
                icon="plug"
                title="Kill Switch"
                sub="Блокирует сеть при обрыве VPN"
                value={prefs.killSwitch}
                onChange={setPref('killSwitch', v => window.api?.setKillSwitch?.(v))}
              />
              <ToggleRow
                icon="bolt"
                title="Подключаться при запуске"
                sub="Когда открываете приложение"
                value={prefs.autoConnect}
                onChange={setPref('autoConnect', v => window.api?.setAutoConnect?.(v))}
              />
              <ToggleRow
                icon="power"
                title="Запускать вместе с Windows"
                sub="При входе в систему"
                value={prefs.autostart}
                onChange={setPref('autostart', v => window.api?.setAutostart?.(v))}
              />
              <Row icon="activity" title="Проверка соединения" sub="Что видят сайты, IPv6 и DNS" chevron onClick={() => onOpen('check')} />
            </Glass>
          </Section>

          <Section title="Помощь">
            <Glass className="set-card ui-rise" style={{ '--i': 3 }}>
              {authed ? (
                <Row icon="chatDots" title="Чат поддержки" sub="ИИ-помощник отвечает сразу" right={<span className="set-live-dot" aria-hidden="true" />} chevron onClick={() => onOpen('support')} />
              ) : (
                <Row icon="send" title="Поддержка в Telegram" sub="@liptonvpn_bot" chevron onClick={() => window.api?.openExternal?.(BOT)} />
              )}
              <Row icon="book" title="База знаний" sub="Инструкции и частые вопросы" chevron onClick={() => window.api?.openArticles?.()} />
              <div className="set-row set-row--stack set-logs">
                <div className="set-row-line">
                  <span className="set-ico" aria-hidden="true"><Icon name="terminal" size={16} stroke={2} /></span>
                  <span className="set-row-text">
                    <span className="set-row-title">Логи приложения</span>
                    <span className="set-row-sub">Пригодятся поддержке</span>
                  </span>
                  <Button size="sm" icon={<Icon name={copied ? 'check' : 'copy'} size={14} stroke={2} />} onClick={copyLogs}>
                    {copied ? 'Скопировано' : 'Копировать'}
                  </Button>
                </div>
                <div className="set-logs-box" aria-label="Последние строки логов">
                  {logs.length
                    ? logs.slice(-3).map((l, i) => <div key={i} className={/\[ERROR\]/.test(l) ? 'is-err' : /\[WARN\]/.test(l) ? 'is-warn' : ''}>{l}</div>)
                    : <div className="is-empty">Логи пусты — подключитесь к VPN</div>}
                  <button type="button" className="set-logs-file" onClick={() => window.api?.openLogFile?.()}>
                    <Icon name="file" size={12} stroke={2} /><span>Открыть файл</span>
                  </button>
                </div>
              </div>
              <Row
                icon="reset"
                iconTone="warn"
                title="Сбросить настройки сети"
                sub="Прокси, DNS, маршруты TUN и Winsock · понадобится перезагрузка ПК"
                chevron
                onClick={() => openDialog({ kind: 'reset' })}
                className="set-row--wrap"
              />
            </Glass>
          </Section>

          <Section title="О приложении">
            <Glass className="set-card ui-rise" style={{ '--i': 4 }}>
              <Row
                icon="info"
                title="Версия"
                right={<span className="set-value num">{version || '—'} · {versionSub}</span>}
                chevron={!update?.startsWith('available')}
                onClick={checkUpdates}
              />
              <Row icon="file" title="Политика конфиденциальности" chevron onClick={() => window.api?.openExternal?.(`${SITE}/legal?doc=privacy`)} />
              <Row icon="layers" title="Лицензии третьих сторон" sub="sing-box, Wintun, шрифты и другие" chevron onClick={() => onOpen('licenses')} />
            </Glass>
          </Section>

          {authed && hasAccess && !plan?.canceled && (
            <button type="button" className="set-cancel ui-rise" style={{ '--i': 5 }} onClick={() => openDialog({ kind: 'cancel' })}>
              <span className="set-ico set-ico--warn" aria-hidden="true"><Icon name="xCircle" size={16} stroke={2} /></span>
              <span className="set-row-text">
                <span className="set-row-title">Отменить подписку</span>
                <span className="set-row-sub">Закончится сразу, остаток не возвращается</span>
              </span>
            </button>
          )}
          {authed && (
            <Button variant="glass" size="lg" block className="set-logout ui-rise" style={{ '--i': 6 }} icon={<Icon name="logout" size={18} stroke={2} />} onClick={onLogout}>
              Выйти из аккаунта
            </Button>
          )}
        </div>
      </div>

      <div className="set-footer">Lipton VPN {version} · разработка popokole</div>

      <ConfirmDialog
        open={!!dialogProps}
        icon={dialogProps?.icon}
        tone={dialogProps?.tone}
        title={dialogProps?.title}
        confirmLabel={dialogProps?.confirmLabel}
        cancelLabel={dialogProps?.cancelLabel}
        confirmDisabled={dialogProps?.confirmDisabled}
        busy={busy}
        error={dialogErr}
        onConfirm={confirmDialog}
        onCancel={closeDialog}
      >
        {dialogProps?.body}
      </ConfirmDialog>
    </>
  )
}
