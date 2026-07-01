import { useState, useEffect, useRef } from 'react'

const SENDER_LABEL = { user: 'Вы', admin: 'Поддержка', support: 'Поддержка' }

const fmtTime = (ts) => {
  const d = ts ? new Date(ts) : new Date()
  return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}
const dayKey = (ts) => {
  const d = ts ? new Date(ts) : new Date()
  return d.toDateString()
}
const fmtDay = (ts) => {
  const d = ts ? new Date(ts) : new Date()
  const today = new Date().toDateString()
  const yest = new Date(Date.now() - 86400000).toDateString()
  if (d.toDateString() === today) return 'Сегодня'
  if (d.toDateString() === yest) return 'Вчера'
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' })
}

export default function SupportPanel({ onClose }) {
  const [closing, setClosing] = useState(false)
  const [messages, setMessages] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [logsSent, setLogsSent] = useState(false)
  const [err, setErr] = useState('')
  const listRef = useRef(null)
  const pollRef = useRef(null)

  // Единый чат с сайтом: тянем AI-диалог (ai_dialogs). role user→свои,
  // assistant→ответы поддержки/ИИ. Приводим к формату {sender, body, created_at}.
  const load = async () => {
    const r = await window.api.getAiDialog()
    if (r.success) {
      setMessages((r.messages || []).map((m) => ({
        sender: m.role === 'user' ? 'user' : 'support',
        body: m.content,
        created_at: m.at,
      })))
    } else { setMessages([]); setErr(r.error || '') }
  }

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, 6000) // подтягиваем ответы поддержки
    return () => clearInterval(pollRef.current)
  }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  function close() { setClosing(true); setTimeout(() => onClose(), 260) }

  const send = async () => {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true); setErr('')
    // оптимистично показываем своё сообщение
    setMessages(m => [...(m || []), { sender: 'user', body, created_at: new Date().toISOString() }])
    setText('')
    const r = await window.api.aiChat(body)
    if (r.success && r.reply) {
      setMessages(m => [...(m || []), { sender: 'support', body: r.reply, created_at: new Date().toISOString() }])
    } else if (!r.success) {
      setErr(r.error || 'Не удалось отправить')
    }
    setBusy(false)
    await load()
  }

  const attachLogs = async () => {
    if (busy) return
    setBusy(true); setErr('')
    // Пользователь видит только короткое сообщение; полную расшифровку получают ИИ и оператор.
    setMessages(m => [...(m || []), { sender: 'user', body: '📎 Логи приложения отправлены', created_at: new Date().toISOString() }])
    const r = await window.api.sendAppLogs()
    if (r.success) {
      setLogsSent(true)
      if (r.reply) setMessages(m => [...(m || []), { sender: 'support', body: r.reply, created_at: new Date().toISOString() }])
    } else setErr(r.error || 'Не удалось отправить логи')
    setBusy(false)
    await load()
  }

  return (
    <div
      className={`settings-overlay${closing ? ' settings-overlay--closing' : ''}`}
      onClick={e => e.target === e.currentTarget && close()}
    >
      <div className={`settings-panel${closing ? ' settings-panel--closing' : ''}`}>
        <div className="settings-header">
          <span className="settings-title">Поддержка</span>
          <button className="settings-close" onClick={close}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1 1l8 8M9 1L1 9"/>
            </svg>
          </button>
        </div>

        <div className="sup-chat" ref={listRef}>
          {messages === null ? (
            <div className="acc-empty" style={{ textAlign: 'center', padding: 20 }}>Загрузка…</div>
          ) : messages.length === 0 ? (
            <div className="sup-intro">
              <div className="sup-intro-ico">💬</div>
              <div className="sup-intro-title">Напишите нам</div>
              <div className="sup-intro-text">
                Опишите проблему — ответим в этом чате. Можно приложить логи приложения кнопкой ниже.
              </div>
            </div>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1]
              const showDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at)
              return (
                <div key={i} className="sup-row">
                  {showDay && <div className="sup-day"><span>{fmtDay(m.created_at)}</span></div>}
                  {m.system ? (
                    <div className="sup-system">{m.body}</div>
                  ) : (
                    <div className={`sup-msg sup-msg--${m.sender === 'user' ? 'me' : 'them'}`}>
                      <span className="sup-msg-who">
                        {SENDER_LABEL[m.sender] || 'Поддержка'} · <span className="sup-msg-time">{fmtTime(m.created_at)}</span>
                      </span>
                      <div className="sup-bubble">{m.body}</div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {logsSent && (
          <div className="sup-logs-ok" style={{ margin: '0 16px 8px' }}>
            ✓ Вы успешно отправили логи приложения в поддержку
          </div>
        )}
        {err && <div className="acc-err" style={{ margin: '0 16px 8px' }}>{err}</div>}

        <div className="sup-input-row">
          <button
            className="sup-logs-btn"
            onClick={attachLogs}
            disabled={busy || logsSent}
            title="Отправить логи приложения в поддержку"
          >
            {logsSent ? '✓ Логи' : 'Логи'}
          </button>
          <input
            className="sup-input"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Сообщение…"
          />
          <button className="sup-send-btn" onClick={send} disabled={busy || !text.trim()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
