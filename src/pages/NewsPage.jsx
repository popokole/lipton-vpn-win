import { useEffect, useState } from 'react'
import { Glass, Button, Icon, Dot, Flag } from '../components/ui'
import { newsKey, newsTag, fmtNewsDate, agoLabel } from '../lib/news.mjs'
import { isAutoBalance, flagCode, splitRemark } from '../lib/servers.mjs'
import { useNow } from '../lib/time.js'

// Новости (макет new-pc-news): «N непрочитанных · Прочитать все», полоса
// «Статус серверов» (GET /status/servers + пинг серверов подписки) и карточки
// в две колонки. Источник — лента приложения (/news); прочитанное хранится
// только на этом компьютере.

const MAX_NODES = 6

function statusModel(remote, servers) {
  const local = (Array.isArray(servers) ? servers : [])
  const pings = local.map(s => s.ping).filter(v => v != null)
  const avgPing = pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null
  const list = remote?.servers?.length
    ? remote.servers.map(s => ({ name: s.name, country: s.country, up: s.status === 'up', unknown: s.status === 'unknown', auto: isAutoBalance(s.name) }))
    : local.map(s => ({ name: splitRemark(s.remark).title, country: flagCode(s.remark), up: s.ping != null, unknown: s.ping == null, auto: isAutoBalance(s.remark) }))
  const known = list.filter(s => !s.unknown)
  const upCount = list.filter(s => s.up).length
  let level = 'ok'
  let title = 'Все серверы работают'
  if (!list.length) { level = 'unknown'; title = 'Статус неизвестен' }
  else if (known.length && upCount === 0) { level = 'bad'; title = 'Серверы недоступны' }
  else if (known.length && upCount < known.length) { level = 'warn'; title = 'Часть серверов недоступна' }
  else if (!known.length) { level = 'unknown'; title = 'Статус уточняется' }
  return { list, upCount, total: list.length, avgPing, level, title, updatedAt: remote?.updated_at || null }
}

function StatusStrip({ servers }) {
  const [remote, setRemote] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const now = useNow(60000)

  useEffect(() => {
    let alive = true
    const load = () => window.api?.serverStatus?.()
      .then(r => { if (alive) { setRemote(r?.success ? r : null); setLoaded(true) } })
      .catch(() => { if (alive) setLoaded(true) })
    load()
    const id = setInterval(load, 120000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const m = statusModel(remote, servers)
  const nodes = m.list.slice(0, MAX_NODES)
  const sub = [
    m.total ? `${m.upCount} из ${m.total} в сети` : '',
    m.avgPing != null ? `средний пинг ${m.avgPing} мс` : '',
  ].filter(Boolean).join(' · ')

  return (
    <Glass edge className={`news-status news-status--${m.level} ui-rise`} style={{ '--i': 1 }} aria-label="Статус серверов">
      <div className="news-status-head">
        <span className="bt-title"><Icon name="pulse" size={14} stroke={2} /><span>Статус серверов</span></span>
        <span className="bt-meta">{loaded ? (m.updatedAt ? agoLabel(m.updatedAt, now) : 'по пингу из вашей сети') : 'обновляем…'}</span>
      </div>
      <div className="news-status-body">
        <div className="news-status-sum">
          <span className="news-status-dot" aria-hidden="true" />
          <div className="news-status-text">
            <span className="news-status-title">{m.title}</span>
            {sub && <span className="news-status-sub num">{sub}</span>}
          </div>
        </div>
        {nodes.length > 0 && <span className="news-status-div" aria-hidden="true" />}
        {nodes.length > 0 && (
          <div className="news-nodes">
            <span className="news-nodes-line" aria-hidden="true" />
            {nodes.map((n, i) => (
              <span key={`${n.name}-${i}`} className={`news-node${n.up ? '' : n.unknown ? ' is-unknown' : ' is-down'}`} title={n.name}>
                <i className="news-node-dot" aria-hidden="true" />
                <Flag code={n.country} auto={n.auto} size={24} />
                <span className="news-node-name">{n.auto ? 'Авто-баланс' : n.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </Glass>
  )
}

function NewsCard({ item, unread, index, onOpen }) {
  const [open, setOpen] = useState(false)
  const tag = newsTag(item)
  const toggle = () => {
    setOpen(o => !o)
    if (unread) onOpen(newsKey(item))
  }
  return (
    <article className={`news-card2 news-card2--${tag.tone}${unread ? ' is-unread' : ''}${open ? ' is-open' : ''} ui-rise`} style={{ '--i': Math.min(index + 2, 8) }}>
      <button type="button" className="news-card2-hit" onClick={toggle} aria-expanded={open} aria-label={item.title} />
      <div className="news-card2-meta">
        <time className="num">{fmtNewsDate(item.published_at)}</time>
        <span className={`news-chip news-chip--${tag.tone}`}>{tag.label}</span>
        {unread && <span className="news-unread-dot" aria-label="Не прочитано" />}
      </div>
      <h3 className="news-card2-title">{item.title}</h3>
      <p className="news-card2-text">{item.body}</p>
      {item.source_url ? (
        <button
          type="button"
          className="news-card2-ext"
          aria-label="Открыть источник"
          title="Открыть источник"
          onClick={e => { e.stopPropagation(); window.api?.openExternal?.(item.source_url) }}
        >
          <Icon name="external" size={16} stroke={2} />
        </button>
      ) : null}
    </article>
  )
}

export default function NewsPage({ items, error, unread, servers, onRead, onReadAll }) {
  const unreadSet = new Set(unread || [])
  const n = unreadSet.size
  return (
    <>
      <div className="page-head-row">
        <div className="page-head">
          <h1 className="ui-h1">Новости</h1>
          <span className="page-head-status">
            {n > 0 ? <><Dot /><span><b>{n}</b> {n === 1 ? 'непрочитанная' : 'непрочитанных'}</span></> : <span>Всё прочитано</span>}
          </span>
        </div>
        <Button
          variant="glass"
          size="sm"
          className="srv-ping-btn"
          icon={<Icon name="checks" size={16} stroke={1.8} />}
          onClick={onReadAll}
          disabled={!n}
        >
          Прочитать все
        </Button>
      </div>

      <StatusStrip servers={servers} />

      {items === null ? (
        <div className="news-empty"><span className="ui-spinner" aria-label="Загрузка" /></div>
      ) : error && !items.length ? (
        <Glass className="empty-card ui-rise" style={{ '--i': 2 }}>
          <span className="empty-card-ico" aria-hidden="true"><Icon name="bell" size={22} /></span>
          <div className="empty-card-title">Не удалось загрузить новости</div>
          <div className="empty-card-text">{error}</div>
        </Glass>
      ) : !items.length ? (
        <Glass className="empty-card ui-rise" style={{ '--i': 2 }}>
          <span className="empty-card-ico" aria-hidden="true"><Icon name="bell" size={22} /></span>
          <div className="empty-card-title">Пока пусто</div>
          <div className="empty-card-text">Здесь появятся новости и обновления Lipton VPN.</div>
        </Glass>
      ) : (
        <div className="news-grid">
          {items.map((it, i) => (
            <NewsCard key={newsKey(it) || i} item={it} index={i} unread={unreadSet.has(newsKey(it))} onOpen={onRead} />
          ))}
        </div>
      )}
    </>
  )
}
