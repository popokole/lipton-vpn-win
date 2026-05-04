import FlagIcon from './FlagIcon'

function pingClass(ms) {
  if (ms == null) return 'none'
  if (ms < 100) return 'good'
  if (ms < 250) return 'ok'
  return 'bad'
}

function PingBadge({ ms }) {
  return (
    <span className={`ping-badge ping-badge--${pingClass(ms)}`}>
      {ms != null ? `${ms} мс` : '—'}
    </span>
  )
}

function getFlag(remark = '') {
  const m = remark.match(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/)
  return m ? m[0] : '🌐'
}

function cleanRemark(remark = '') {
  return remark.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]\s*/g, '').trim() || remark
}

export default function ServerList({ servers, activeServerId, onSelect, onPingAll, pinging }) {
  if (!servers || servers.length === 0) return null

  return (
    <div className="section">
      <div className="section-header">
        <span className="section-title">Серверы</span>
        <div className="section-actions">
          <button
            className={`btn-icon${pinging ? ' btn-icon--active' : ''}`}
            onClick={onPingAll}
            disabled={pinging}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            {pinging ? 'Пинг...' : 'Пинг'}
          </button>
          <span className="section-count">{servers.length}</span>
        </div>
      </div>

      <div className="server-scroll">
        {servers.map(server => (
          <div
            key={server.id}
            className={`server-item${server.id === activeServerId ? ' server-item--active' : ''}`}
            onClick={() => onSelect(server.id)}
          >
            <FlagIcon emoji={getFlag(server.remark)} size={16} />
            <span className="server-name">{cleanRemark(server.remark)}</span>
            <PingBadge ms={server.ping} />
          </div>
        ))}
      </div>
    </div>
  )
}
