import { Aurora, Capsule, Dot, Icon, Flag } from './ui'
import ConnectButton from './ConnectButton'
import { connectionLabel, fmtClock } from '../lib/plan.mjs'
import { cleanRemark, flagCode, isAutoBalance } from '../lib/servers.mjs'
import { useNow } from '../lib/time.js'

// Карточка состояния на главной (макеты new-pc-home-on / new-pc-home-off):
// режим и «Обход РФ», «Защищено / Не защищено», таймер сессии (начало — из main),
// IP, который видят сайты («· виден провайдеру» без VPN), кнопка подключения
// и пилюля сервера. Внутри — своё яркое свечение. Нет серверов (нет подписки,
// пробный доступ закончился) — вместо «Подключить» кнопка cta («Оформить подписку»).

function ServerFlag({ remark }) {
  if (isAutoBalance(remark)) return <Flag auto size={22} />
  const code = flagCode(remark)
  if (!code) {
    return <span className="hero-flag hero-flag--none" aria-hidden="true"><Icon name="globe" size={14} /></span>
  }
  return <span className={`hero-flag fi fis fi-${code}`} aria-hidden="true" />
}

export default function Hero({
  status,
  palette,
  connectedAt,
  tunMode,
  bypassRu,
  server,
  serversCount = 0,
  error,
  ip = '',
  cta = null,
  onConnect,
  onServers,
}) {
  const on = status === 'connected' || status === 'reconnecting'
  const now = useNow(1000, on && !!connectedAt)
  const elapsed = on && connectedAt ? now - connectedAt : 0
  const pulse = status === 'connecting' || status === 'reconnecting' || status === 'disconnecting'
  const name = server ? cleanRemark(server.remark) : ''

  let sub = null
  if (error) sub = <span className="hero-sub hero-sub--error" title={error}>{error}</span>
  else if (status === 'kill-switch') sub = <span className="hero-sub hero-sub--warn">Интернет заблокирован</span>
  else if (!serversCount && !on) sub = <span className="hero-sub">{cta?.hint || 'Нет серверов — оформите подписку'}</span>
  else if (ip && on) {
    sub = <span className="hero-ip num"><b>IP</b>{ip}</span>
  } else if (ip && status === 'disconnected') {
    sub = (
      <span className="hero-ip hero-ip--open num">
        <b>IP</b><span className="hero-ip-val">{ip}</span><span className="hero-ip-dot">·</span><span className="hero-ip-warn">виден провайдеру</span>
      </span>
    )
  }

  return (
    <section className="hero ui-rise" aria-label="Состояние подключения" style={{ '--i': 0 }}>
      <Aurora variant="hero" palette={palette} />
      <div className="hero-fade" aria-hidden="true" />

      <div className="hero-chips">
        <Capsule tone="accent" icon={<Icon name="layers" size={12} stroke={2} />}>
          {tunMode ? 'Режим TUN' : 'Режим Прокси'}
        </Capsule>
        <Capsule tone="cyan" className={bypassRu ? '' : 'ui-capsule--muted'} icon={<Icon name="branch" size={12} stroke={2} />}>
          {bypassRu ? 'Обход РФ' : 'Обход РФ выкл.'}
        </Capsule>
      </div>

      <div className="hero-spacer hero-spacer--top" />

      <div className="hero-main">
        <div className="hero-status" role="status" aria-live="polite">
          <Dot pulse={pulse} />
          <span>{connectionLabel(status)}</span>
        </div>
        <div className={`hero-timer display${on ? '' : ' hero-timer--idle'}`} aria-label={on ? `В сети ${fmtClock(elapsed)}` : undefined}>
          {fmtClock(elapsed)}
        </div>
        <div className="hero-sub-row">{sub}</div>

        {!serversCount && !on && cta ? (
          <button type="button" className="connect-btn connect-btn--off" onClick={cta.onClick}>
            <Icon name={cta.icon || 'crown'} size={18} />
            <span>{cta.label}</span>
          </button>
        ) : (
          <ConnectButton status={status} onConnect={onConnect} disabled={!serversCount && !on} />
        )}

        {!serversCount && !on && cta?.secondary ? (
          <button type="button" className="hero-link" onClick={cta.secondary.onClick}>{cta.secondary.label}</button>
        ) : server ? (
          <button type="button" className="hero-server" onClick={onServers} aria-label={`Сменить сервер: ${name}`}>
            <ServerFlag remark={server.remark} />
            <span className="hero-server-name">{name}</span>
            <Icon name="chevronRight" size={16} stroke={2} className="hero-server-chev" />
          </button>
        ) : (
          <button type="button" className="hero-server" onClick={onServers}>
            <span className="hero-flag hero-flag--none" aria-hidden="true"><Icon name="globe" size={14} /></span>
            <span className="hero-server-name">{serversCount ? 'Выбрать сервер' : 'Серверы'}</span>
            <Icon name="chevronRight" size={16} stroke={2} className="hero-server-chev" />
          </button>
        )}
      </div>

      <div className="hero-spacer hero-spacer--bottom" />
    </section>
  )
}
