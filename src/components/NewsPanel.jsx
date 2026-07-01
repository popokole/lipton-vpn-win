import { useState, useEffect } from 'react'

const fmtDate = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function NewsPanel({ onClose }) {
  const [closing, setClosing] = useState(false)
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null) // раскрытая новость

  useEffect(() => {
    let alive = true
    window.api.getNews().then((r) => {
      if (!alive) return
      if (r.success) setItems(r.items || [])
      else { setItems([]); setErr(r.error || '') }
    })
    return () => { alive = false }
  }, [])

  function close() { setClosing(true); setTimeout(() => onClose(), 260) }

  return (
    <div
      className={`settings-overlay${closing ? ' settings-overlay--closing' : ''}`}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className={`settings-panel${closing ? ' settings-panel--closing' : ''}`}>
        <div className="settings-header">
          <span className="settings-title">Новости</span>
          <button className="settings-close" onClick={close}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1 1l8 8M9 1L1 9" />
            </svg>
          </button>
        </div>

        <div className="news-list">
          {items === null ? (
            <div className="acc-empty" style={{ textAlign: 'center', padding: 20 }}>Загрузка…</div>
          ) : err ? (
            <div className="acc-err" style={{ margin: 16 }}>{err}</div>
          ) : items.length === 0 ? (
            <div className="sup-intro">
              <div className="sup-intro-ico">📰</div>
              <div className="sup-intro-title">Пока пусто</div>
              <div className="sup-intro-text">Здесь появятся новости и обновления Lipton VPN.</div>
            </div>
          ) : (
            items.map((n) => {
              const expanded = open === n.id
              return (
                <div key={n.id} className={`news-card${expanded ? ' news-card--open' : ''}`} onClick={() => setOpen(expanded ? null : n.id)}>
                  {n.image_url ? <div className="news-img" style={{ backgroundImage: `url(${n.image_url})` }} /> : null}
                  <div className="news-body">
                    <div className="news-date">{fmtDate(n.published_at)}{n.source_name ? ` · ${n.source_name}` : ''}</div>
                    <div className="news-title">{n.title}</div>
                    <div className={`news-text${expanded ? '' : ' news-text--clamp'}`}>{n.body}</div>
                    {n.source_url ? (
                      <button
                        className="news-src"
                        onClick={(e) => { e.stopPropagation(); window.api.openExternal(n.source_url) }}
                      >
                        Источник →
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
