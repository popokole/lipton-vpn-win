function fmt(bytes) {
  if (!bytes) return '0 Б'
  const gb = bytes / 1e9
  if (gb >= 1) return gb.toFixed(1) + ' ГБ'
  const mb = bytes / 1e6
  if (mb >= 1) return mb.toFixed(0) + ' МБ'
  return (bytes / 1e3).toFixed(0) + ' КБ'
}

function fmtDate(ts) {
  if (!ts) return null
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TrafficBar({ userInfo }) {
  if (!userInfo) return null
  const { upload = 0, download = 0, total = 0, expire = 0 } = userInfo
  if (!total && !expire) return null

  const used = upload + download
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const fillClass = pct > 90 ? 'crit' : pct > 70 ? 'warn' : ''

  const now = Date.now() / 1000
  const daysLeft = expire ? Math.max(0, Math.ceil((expire - now) / 86400)) : null
  const expireClass = daysLeft !== null ? (daysLeft <= 3 ? 'expire-soon' : 'expire-ok') : ''

  return (
    <>
      {total > 0 && (
        <div className="traffic-row">
          <div className="traffic-bar-wrap">
            <div
              className={`traffic-bar-fill${fillClass ? ' traffic-bar-fill--' + fillClass : ''}`}
              style={{ width: pct + '%' }}
            />
          </div>
          <div className="traffic-labels">
            <span className="traffic-used">{fmt(used)}</span>
            <span>{fmt(total)}</span>
          </div>
        </div>
      )}

      {expire > 0 && (
        <div className={`expire-row ${expireClass}`}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {daysLeft !== null
            ? daysLeft === 0 ? 'Истекает сегодня'
              : daysLeft === 1 ? 'Истекает завтра'
              : `До ${fmtDate(expire)} (${daysLeft} дн.)`
            : fmtDate(expire)
          }
        </div>
      )}
    </>
  )
}
