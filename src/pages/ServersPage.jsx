import ServerList from '../components/ServerList'
import { Glass, Button, Icon, Dot } from '../components/ui'
import { cleanRemark } from '../lib/servers.mjs'

// Серверы: заголовок со статусом и «Проверить пинг», список серверов подписки.
//
// TODO(redesign): карточка «Авто-баланс», теги серверов, промо «Обход глушилок»
// и две группы серверов при активном «Обходе» — пакет D4 (макет new-pc-servers).

export default function ServersPage({ servers, activeServerId, activeServer, vpnStatus, pinging, onSelect, onPingAll, onEmpty, emptyLabel }) {
  const on = vpnStatus === 'connected' || vpnStatus === 'reconnecting'
  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1 className="ui-h1">Серверы</h1>
          <span className="page-head-status">
            <Dot />
            {on && activeServer
              ? <span>Подключено: <b>{cleanRemark(activeServer.remark)}</b></span>
              : <span>Не подключено</span>}
          </span>
        </div>
        <Button
          variant="glass"
          icon={pinging ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : <Icon name="activity" size={16} stroke={2} />}
          onClick={onPingAll}
          disabled={pinging || !servers.length}
        >
          {pinging ? 'Проверяем…' : 'Проверить пинг'}
        </Button>
      </div>

      {servers.length ? (
        <Glass className="servers-card legacy-inline legacy-servers ui-rise" style={{ '--i': 1 }}>
          <div className="servers-card-head">
            <span className="ui-tile-title"><Icon name="globe" size={14} stroke={2} /><span>Все серверы</span></span>
            <span className="ui-tile-meta">{servers.length}</span>
          </div>
          <ServerList
            servers={servers}
            activeServerId={activeServerId}
            onSelect={onSelect}
            onPingAll={onPingAll}
            pinging={pinging}
          />
        </Glass>
      ) : (
        <Glass className="empty-card ui-rise" style={{ '--i': 1 }}>
          <span className="empty-card-ico" aria-hidden="true"><Icon name="globe" size={22} /></span>
          <div className="empty-card-title">Серверов пока нет</div>
          <div className="empty-card-text">Они появятся, когда подписка станет активной.</div>
          {onEmpty && <Button variant="primary" onClick={onEmpty}>{emptyLabel}</Button>}
        </Glass>
      )}
    </>
  )
}
