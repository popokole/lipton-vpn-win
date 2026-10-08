import { Glass, Button, Icon, Dot, Flag, Signal } from '../components/ui'
import { rub } from '../lib/plan.mjs'
import {
  cleanRemark, flagCode, splitRemark, pingTag, signalLevel, pingTone, serverAccent, groupServers,
} from '../lib/servers.mjs'
import { lastN, rangeHeights } from '../lib/stats.mjs'

// Серверы (макет new-pc-servers): слева «Авто-баланс» (если он есть в подписке)
// с пульсацией и живым пингом, справа список с цветными акцентами и пингом
// (через ядро — clash_api, когда VPN включён). Внизу — «Обход глушилок»,
// только на тарифе «Базовый». При тарифе «Обход» — две группы серверов.
// Полосу нагрузки не показываем: данных о нагрузке узлов нет.

function ServerRow({ server, index, active, bypass, onSelect }) {
  const { title, sub } = splitRemark(server.remark)
  const code = flagCode(server.remark)
  const tag = pingTag(server.ping)
  const tone = pingTone(server.ping)
  const accent = serverAccent(index, server.ping, bypass)
  return (
    <button
      type="button"
      className={`srv-row srv-row--${accent}${active ? ' is-active' : ''} ui-rise`}
      style={{ '--i': index + 2 }}
      onClick={() => onSelect(server.id)}
      aria-pressed={active}
    >
      <Flag code={code} size={32} className="srv-row-flag" />
      <span className="srv-row-text">
        <span className="srv-row-title">{title}</span>
        <span className="srv-row-sub">
          {sub && <>{sub}<span className="srv-row-sep"> · </span></>}
          <span className={`srv-tag srv-tag--${tag.tone}`}>{tag.label}</span>
        </span>
      </span>
      <span className="srv-row-ping">
        <Signal level={signalLevel(server.ping)} tone={tone} size="sm" />
        <span className={`srv-ms srv-ms--${tone} num`}>{server.ping != null ? `${server.ping} мс` : '—'}</span>
      </span>
      {active && <span className="srv-row-check" aria-label="Выбран"><Icon name="check" size={12} stroke={3} /></span>}
    </button>
  )
}

function AutoCard({ server, active, connected, livePing, pingHistory, exposure, onSelect }) {
  const ping = active && connected && livePing != null ? livePing : server.ping
  const hist = active && connected ? lastN((pingHistory || []).map(p => p.ms || 0), 16) : []
  const hasLive = hist.some(v => v > 0)
  const heights = hasLive ? rangeHeights(hist, 32, 12, 4) : [14, 20, 17, 24, 19, 27, 22, 30, 25, 20, 26, 18, 23, 28, 21, 32]
  const country = active && connected ? exposure?.country : ''
  return (
    <button
      type="button"
      className={`auto-card${active ? ' is-active' : ''} ui-rise`}
      style={{ '--i': 1 }}
      onClick={() => onSelect(server.id)}
      aria-pressed={active}
      aria-label="Авто-баланс — сам выбирает самый быстрый сервер"
    >
      <span className="auto-glow" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="auto-fade" aria-hidden="true" />
      <span className="auto-edge" aria-hidden="true" />
      <svg className="auto-orbits" width="240" height="240" viewBox="0 0 240 240" fill="none" aria-hidden="true">
        <circle cx="120" cy="120" r="52" /><circle cx="120" cy="120" r="78" /><circle cx="120" cy="120" r="104" />
      </svg>
      <span className="auto-rings" aria-hidden="true"><i /><i /><i /></span>

      <span className="auto-top">
        <span className="auto-chip"><Icon name="star" size={12} stroke={2.2} /><span>Рекомендуем</span></span>
        {active && <span className="auto-check" aria-hidden="true"><Icon name="check" size={14} stroke={3} /></span>}
      </span>
      <span className="auto-ico" aria-hidden="true"><Icon name="shuffle" size={28} /></span>
      <span className="auto-title">Авто-баланс</span>
      <span className="auto-sub">Сам выбирает самый быстрый сервер</span>

      <span className="auto-ping">
        <span className="auto-ping-head">
          <span className="bt-title"><Icon name="pulse" size={14} stroke={2} /><span>Пинг</span></span>
          <span className="auto-live"><i aria-hidden="true" />{hasLive ? 'в реальном времени' : 'последний замер'}</span>
        </span>
        <span className={`auto-ping-val${hasLive ? ' is-live' : ''}`}>
          <span className="display num">{ping != null ? ping : '—'}</span>
          {ping != null && <span>мс</span>}
        </span>
        <span className="auto-fill" />
        <span className={`auto-bars${hasLive ? '' : ' auto-bars--breath'}`} aria-hidden="true">
          {heights.map((h, i) => <i key={i} style={{ height: h, animationDelay: `${-i * 0.1}s` }} className={i === heights.length - 1 ? 'is-last' : ''} />)}
        </span>
      </span>

      <span className="auto-now">
        <Flag code={country} size={28} />
        <span className="auto-now-text">
          <span>{active && connected ? 'Сейчас ведёт на' : 'Подключим к быстрому'}</span>
          <b>{active && connected ? (exposure?.countryName || 'определяем…') : 'по пингу из вашей сети'}</b>
        </span>
      </span>
    </button>
  )
}

function BypassPromo({ offer, onBuy }) {
  return (
    <Glass className="bypass-promo ui-rise" style={{ '--i': 8 }}>
      <span className="bypass-promo-edge" aria-hidden="true" />
      <div className="bypass-promo-top">
        <span className="bypass-promo-ico" aria-hidden="true"><Icon name="lockKey" size={20} /></span>
        <div className="bypass-promo-text">
          <div className="bypass-promo-title">
            <h2>{offer.title}</h2>
            <span className="bypass-promo-chip">отдельный тариф</span>
          </div>
          <p>Когда обычный VPN блокируют — отдельные серверы с маскировкой трафика.</p>
        </div>
      </div>
      <div className="bypass-promo-fill" />
      <div className="bypass-promo-bottom">
        <span className="bypass-promo-price num">
          {offer.priceKopeks ? <b>{rub(offer.priceKopeks)}</b> : null}
          <span>/ {offer.days} дней</span>
        </span>
        <button type="button" className="bypass-promo-btn" onClick={onBuy}>Подключить тариф</button>
      </div>
    </Glass>
  )
}

function Group({ title, chip, hint, children }) {
  return (
    <div className="srv-group">
      <div className="srv-group-head">
        <h2 className="srv-h2">{title}</h2>
        {chip && <span className="srv-group-chip"><i aria-hidden="true" />{chip}</span>}
      </div>
      {hint && <div className="srv-group-hint">{hint}</div>}
      <div className="srv-list">{children}</div>
    </div>
  )
}

export default function ServersPage({
  servers, activeServerId, activeServer, vpnStatus, pinging, plan, offer, stats, exposure,
  onSelect, onPingAll, onBuyBypass, onEmpty, emptyLabel,
}) {
  const on = vpnStatus === 'connected' || vpnStatus === 'reconnecting'
  const bypassPlan = !!plan?.bypass
  const { auto, bypass, regular } = groupServers(servers, { bypassPlan })
  const showPromo = !!offer && plan?.kind === 'active' && !bypassPlan && !!onBuyBypass
  const effectiveActive = activeServerId || (servers[0] && servers[0].id)

  const head = (
    <div className="page-head-row">
      <div className="page-head">
        <h1 className="ui-h1">Серверы</h1>
        <span className="page-head-status">
          <Dot pulse={vpnStatus === 'connecting' || vpnStatus === 'reconnecting'} />
          {on && activeServer
            ? <span>Подключено: <b>{cleanRemark(activeServer.remark)}</b></span>
            : vpnStatus === 'connecting' ? <span>Подключение…</span> : <span>Не подключено</span>}
        </span>
      </div>
      <Button
        variant="glass"
        size="sm"
        className="srv-ping-btn"
        icon={pinging ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : <Icon name="pulse" size={16} stroke={1.8} />}
        onClick={onPingAll}
        disabled={pinging || !servers.length}
      >
        {pinging ? 'Проверяем…' : 'Проверить пинг'}
      </Button>
    </div>
  )

  if (!servers.length) {
    return (
      <>
        {head}
        <Glass className="empty-card ui-rise" style={{ '--i': 1 }}>
          <span className="empty-card-ico" aria-hidden="true"><Icon name="globe" size={22} /></span>
          <div className="empty-card-title">Серверов пока нет</div>
          <div className="empty-card-text">Они появятся, когда подписка станет активной.</div>
          {onEmpty && <Button variant="primary" onClick={onEmpty}>{emptyLabel}</Button>}
        </Glass>
      </>
    )
  }

  const row = (s, i, isBypass = false) => (
    <ServerRow key={s.id} server={s} index={i} active={s.id === effectiveActive} bypass={isBypass} onSelect={onSelect} />
  )

  const list = bypass.length ? (
    <>
      <Group title="Обход глушилок" chip="Ваш тариф">{bypass.map((s, i) => row(s, i, true))}</Group>
      <Group title="Обычные серверы" hint="Без маскировки. При глушилках работают только серверы «Обход».">
        {regular.map((s, i) => row(s, i + bypass.length))}
      </Group>
    </>
  ) : (
    <div className="srv-group">
      <div className="srv-group-head">
        <h2 className="srv-h2">Все серверы</h2>
        <span className="srv-legend"><Signal level={3} tone="muted" size="xs" /><span>пинг</span></span>
      </div>
      <div className="srv-list">{regular.map((s, i) => row(s, i))}</div>
    </div>
  )

  return (
    <>
      {head}
      <div className={`srv-grid${auto ? '' : ' srv-grid--single'}`}>
        {auto && (
          <AutoCard
            server={auto}
            active={auto.id === effectiveActive}
            connected={on}
            livePing={stats?.live ? stats.ping : null}
            pingHistory={stats?.pingHistory}
            exposure={exposure}
            onSelect={onSelect}
          />
        )}
        <div className="srv-col">
          {list}
          {showPromo && <BypassPromo offer={offer} onBuy={onBuyBypass} />}
        </div>
      </div>
    </>
  )
}
