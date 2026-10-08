import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Glass, Icon } from '../components/ui'
import Screen from './Screen'

// Чат поддержки (макет new-scr-support): тот же диалог, что на сайте (ИИ
// отвечает сразу, оператор перехватывает вручную). Под ответом ИИ — «Помогло /
// Не помогло» и «Позвать оператора»; скрепка отправляет логи приложения.
// Если ручек оценки и оператора на сервере ещё нет — оценка просто скрывается,
// а оператор открывается в Telegram-боте.

const POLL_MS = 6000

const fmtTime = (ts) => {
  const d = ts ? new Date(ts) : new Date()
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
const dayKey = ts => (ts ? new Date(ts) : new Date()).toDateString()
const fmtDay = (ts) => {
  const d = ts ? new Date(ts) : new Date()
  if (d.toDateString() === new Date().toDateString()) return 'Сегодня'
  if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

// Ссылки https:// в тексте — кликабельные (открываются в браузере).
function Linkify({ text }) {
  const parts = String(text || '').split(/(https:\/\/[^\s)]+)/g)
  return parts.map((p, i) => (/^https:\/\//.test(p)
    ? <button key={i} type="button" className="chat-link" onClick={() => window.api?.openExternal?.(p)}>{p}</button>
    : <Fragment key={i}>{p}</Fragment>))
}

// Ответ ИИ: нумерованные шаги — списком с кружками, остальное — абзацами.
function Rich({ text }) {
  const lines = String(text || '').split('\n')
  const out = []
  let list = null
  lines.forEach((raw, i) => {
    const line = raw.trim()
    const m = line.match(/^(\d{1,2})[.)]\s+(.*)$/)
    if (m) {
      if (!list) { list = []; out.push({ list }) }
      list.push(m[2])
      return
    }
    list = null
    if (line) out.push({ p: line, key: i })
  })
  return out.map((b, i) => (b.list
    ? <ol key={i} className="chat-steps">{b.list.map((s, j) => <li key={j}><span className="chat-step-n">{j + 1}</span><span><Linkify text={s} /></span></li>)}</ol>
    : <p key={i}><Linkify text={b.p} /></p>))
}

export default function SupportScreen({ onBack, botUrl = 'https://t.me/liptonvpn_bot' }) {
  const [messages, setMessages] = useState(null)
  const [mode, setMode] = useState('auto')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [rated, setRated] = useState({}) // index → 'up' | 'down'
  const [feedbackOff, setFeedbackOff] = useState(false)
  const [operatorAsked, setOperatorAsked] = useState(false)
  const listRef = useRef(null)
  const sigRef = useRef('')
  const countRef = useRef(0)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const sigOf = arr => (arr || []).map(m => `${m.role}|${m.content}`).join('\n')

  const load = useCallback(async () => {
    const r = await window.api.getAiDialog().catch(() => null)
    if (!alive.current) return
    if (!r?.success) { setMessages(m => m ?? []); if (r?.error) setErr(r.error); return }
    if (r.mode) setMode(r.mode)
    const list = (r.messages || []).map(m => ({ id: m.id, role: m.role === 'user' ? 'user' : 'assistant', content: m.content, at: m.at }))
    const s = sigOf(list)
    if (s === sigRef.current) return
    sigRef.current = s
    setMessages(list)
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  // Вниз — только на новые сообщения или если пользователь и так внизу.
  useEffect(() => {
    const el = listRef.current
    if (!el || messages === null) return
    const grew = messages.length > countRef.current
    countRef.current = messages.length
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    if (grew || near) el.scrollTop = el.scrollHeight
  }, [messages])

  const push = (role, content) => setMessages(m => {
    const n = [...(m || []), { role, content, at: new Date().toISOString() }]
    sigRef.current = sigOf(n)
    return n
  })

  const send = async (e) => {
    e?.preventDefault()
    const body = text.trim()
    if (!body || busy) return
    setBusy(true); setErr('')
    push('user', body)
    setText('')
    const r = await window.api.aiChat(body).catch(x => ({ success: false, error: x?.message }))
    if (!alive.current) return
    if (r?.success && r.reply) push('assistant', r.reply)
    else if (!r?.success) setErr(r?.error || 'Не удалось отправить')
    setBusy(false)
    load()
  }

  const attachLogs = async () => {
    if (busy) return
    setBusy(true); setErr('')
    push('user', '📎 Логи приложения отправлены')
    const r = await window.api.sendAppLogs().catch(x => ({ success: false, error: x?.message }))
    if (!alive.current) return
    if (r?.success) { if (r.reply) push('assistant', r.reply) }
    else setErr(r?.error || 'Не удалось отправить логи')
    setBusy(false)
    load()
  }

  const rate = async (idx, msg, helpful) => {
    setRated(r => ({ ...r, [idx]: helpful ? 'up' : 'down' }))
    // TODO(redesign): у сообщений диалога пока нет id — отправляем номер сообщения в диалоге
    const r = await window.api.aiFeedback?.(msg.id ?? idx, helpful).catch(() => null)
    if (!alive.current) return
    if (!r?.success && [404, 405, 501].includes(r?.httpStatus)) setFeedbackOff(true)
  }

  const callOperator = async () => {
    if (operatorAsked) return
    setOperatorAsked(true)
    const r = await window.api.aiOperator?.().catch(() => null)
    if (!alive.current) return
    if (r?.success) { setMode('manual'); load(); return }
    if ([404, 405, 501].includes(r?.httpStatus) || !window.api.aiOperator) {
      // ручки ещё нет — оператор в Telegram-боте
      window.api?.openExternal?.(botUrl)
      return
    }
    setOperatorAsked(false)
    setErr(r?.error || 'Не удалось позвать оператора')
  }

  const lastAssistant = messages ? messages.map(m => m.role).lastIndexOf('assistant') : -1
  const manual = mode === 'manual'

  return (
    <Screen title="Чат поддержки" onBack={onBack} fill>
      <Glass className="chat-head ui-rise" style={{ '--i': 1 }}>
        <span className="chat-head-ico" aria-hidden="true">
          <Icon name={manual ? 'headset' : 'sparkle'} size={18} stroke={2} />
          <i />
        </span>
        <span className="set-row-text">
          <span className="set-row-title">{manual ? 'Оператор подключился' : 'ИИ-помощник отвечает сразу'}</span>
          <span className="set-row-sub">{manual ? 'Ответит в этом чате — обычно за пару минут' : 'Оператор подключится при необходимости'}</span>
        </span>
      </Glass>

      <div className="chat-list" ref={listRef} aria-live="polite">
        {messages === null && <div className="scr-loading"><span className="ui-spinner" aria-label="Загрузка" /></div>}
        {messages !== null && messages.length === 0 && (
          <div className="chat-intro">
            <Icon name="chatDots" size={28} stroke={1.6} />
            <b>Опишите проблему</b>
            <span>ИИ-помощник ответит сразу, а если нужно — подключится оператор. Скрепкой можно приложить логи приложения.</span>
          </div>
        )}
        {(messages || []).map((m, i) => {
          const prev = messages[i - 1]
          const showDay = !prev || dayKey(prev.at) !== dayKey(m.at)
          const mine = m.role === 'user'
          const canRate = !mine && i === lastAssistant && !feedbackOff && !manual
          return (
            <Fragment key={i}>
              {showDay && <div className="chat-day"><span>{fmtDay(m.at)}</span></div>}
              <div className={`chat-msg chat-msg--${mine ? 'me' : 'them'}`}>
                {!mine && <span className="chat-ava" aria-hidden="true"><Icon name="sparkle" size={13} stroke={2} /></span>}
                <div className="chat-col">
                  <div className="chat-bubble">{mine ? <Linkify text={m.content} /> : <Rich text={m.content} />}</div>
                  {canRate && (
                    <div className="chat-actions">
                      {rated[i] ? (
                        <span className="chat-thanks"><Icon name="check" size={12} stroke={2.4} />{rated[i] === 'up' ? 'Спасибо! Рады, что помогло' : 'Спасибо — позовите оператора, он разберётся'}</span>
                      ) : (
                        <>
                          <button type="button" className="chat-chip chat-chip--ok" onClick={() => rate(i, m, true)}><Icon name="check" size={12} stroke={2.4} />Помогло</button>
                          <button type="button" className="chat-chip" onClick={() => rate(i, m, false)}>Не помогло</button>
                        </>
                      )}
                      <button type="button" className="chat-chip" onClick={callOperator} disabled={operatorAsked}>
                        <Icon name="headset" size={12} stroke={2.2} />{operatorAsked ? 'Оператор позван' : 'Позвать оператора'}
                      </button>
                    </div>
                  )}
                  <span className="chat-time">{mine ? fmtTime(m.at) : `${manual ? 'Поддержка' : 'ИИ-помощник'} · ${fmtTime(m.at)}`}</span>
                </div>
              </div>
            </Fragment>
          )
        })}
      </div>

      {err && <div className="scr-error scr-error--block" role="alert">{err}</div>}

      <form className="chat-input ui-glass" onSubmit={send}>
        <button type="button" className="chat-attach" onClick={attachLogs} disabled={busy} title="Отправить логи приложения" aria-label="Отправить логи приложения">
          <Icon name="paperclip" size={18} stroke={1.8} />
        </button>
        <input
          className="chat-field"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Сообщение…"
          aria-label="Сообщение"
          autoFocus
        />
        <button type="submit" className="chat-send" disabled={busy || !text.trim()} aria-label="Отправить">
          {busy ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : <Icon name="arrowUp" size={18} stroke={2.4} />}
        </button>
      </form>
    </Screen>
  )
}
