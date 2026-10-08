import { Aurora, Capsule, Dot, Icon } from './ui'
import ConnectButton from './ConnectButton'
import { connectionLabel, fmtClock } from '../lib/plan.mjs'
import { cleanRemark, flagCode } from '../lib/servers.mjs'
import { useNow } from '../lib/time.js'

// Карточка состояния на главной (макеты new-pc-home-on / new-pc-home-off):
// режим и «Обход РФ», «Защищено / Не защищено», таймер сессии, кнопка
// подключения и пилюля сервера. Внутри — своё яркое свечение.
//
// TODO(redesign): строка «IP … · виден провайдеру» — после D3 (connection-check
// после подключения); connectedAt — из main (vpn:status-update), пока считаем сами.

function ServerFlag({ remark }) {
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
  else if (!serversCount) sub = <span className="hero-sub">Нет серверов — оформите подписку</span>

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

        <ConnectButton status={status} onConnect={onConnect} disabled={!serversCount && !on} />

        {server ? (
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
