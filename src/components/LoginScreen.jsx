import { useEffect, useRef, useState } from 'react'

const METHODS = [
  { key: 'code',  label: 'Код с сайта' },
  { key: 'email', label: 'Почта' },
  { key: 'tg',    label: 'Telegram' },
]

const SITE_URL = 'https://site.popokole.online/app/connect'

export default function LoginScreen({ onLogin }) {
  const [method, setMethod] = useState('code')

  return (
    <div className="auth">
      <div className="auth-head">
        <div className="auth-logo">L</div>
        <h1 className="auth-title">Вход в Lipton VPN</h1>
        <p className="auth-sub">Войдите в аккаунт — подписка подтянется автоматически.</p>
      </div>

      <div className="auth-tabs">
        {METHODS.map(m => (
          <button
            key={m.key}
            className={`auth-tab${method === m.key ? ' auth-tab--on' : ''}`}
            onClick={() => setMethod(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="auth-body">
        {method === 'code'  && <CodeForm  onLogin={onLogin} />}
        {method === 'email' && <EmailForm onLogin={onLogin} />}
        {method === 'tg'    && <TgForm    onLogin={onLogin} />}
      </div>

      <button className="auth-link" onClick={() => window.api.openExternal('https://t.me/liptonvpn_bot')}>
        Нет аккаунта? Откройте бота Lipton VPN
      </button>
    </div>
  )
}

function ErrorLine({ text }) {
  if (!text) return null
  return <div className="auth-err">{text}</div>
}

// ─── Вход по коду с сайта ─────────────────────────────────────────────────
function CodeForm({ onLogin }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  const pretty = clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean

  const submit = async () => {
    if (clean.length !== 8) { setErr('Введите код полностью (8 символов)'); return }
    setErr(''); setBusy(true)
    const r = await window.api.authDeviceExchange(clean)
    setBusy(false)
    if (r.success) onLogin()
    else setErr(r.error || 'Неверный или истёкший код')
  }

  return (
    <>
      <p className="auth-hint">
        Откройте сайт → <b>Личный кабинет → Подключение</b> → «Получить код» и введите его здесь.
      </p>
      <input
        className="auth-input auth-input--code"
        value={pretty}
        onChange={e => { setCode(e.target.value); setErr('') }}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="XXXX-XXXX"
        autoFocus
        spellCheck={false}
      />
      <ErrorLine text={err} />
      <button className="auth-btn" onClick={submit} disabled={busy || clean.length !== 8}>
        {busy ? 'Входим…' : 'Войти'}
      </button>
      <button className="auth-link auth-link--sm" onClick={() => window.api.openExternal(SITE_URL)}>
        Открыть сайт, чтобы получить код
      </button>
    </>
  )
}

// ─── Вход по почте (OTP) ──────────────────────────────────────────────────
function EmailForm({ onLogin }) {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const request = async () => {
    const e = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setErr('Введите корректный email'); return }
    setErr(''); setBusy(true)
    const r = await window.api.authEmailRequest(e)
    setBusy(false)
    if (r.success) { setStep('code'); setEmail(e) }
    else setErr(r.error || 'Не удалось отправить код')
  }

  const verify = async () => {
    const c = code.replace(/\D/g, '').slice(0, 6)
    if (c.length !== 6) { setErr('Код из 6 цифр'); return }
    setErr(''); setBusy(true)
    const r = await window.api.authEmailVerify(email, c)
    setBusy(false)
    if (r.success) onLogin()
    else setErr(r.error || 'Неверный код')
  }

  if (step === 'email') {
    return (
      <>
        <p className="auth-hint">Пришлём код на почту, привязанную к аккаунту.</p>
        <input
          className="auth-input"
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setErr('') }}
          onKeyDown={e => e.key === 'Enter' && request()}
          placeholder="you@example.com"
          autoFocus
          spellCheck={false}
        />
        <ErrorLine text={err} />
        <button className="auth-btn" onClick={request} disabled={busy}>
          {busy ? 'Отправляем…' : 'Получить код'}
        </button>
      </>
    )
  }

  return (
    <>
      <p className="auth-hint">Код отправлен на <b>{email}</b></p>
      <input
        className="auth-input auth-input--code"
        value={code}
        onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr('') }}
        onKeyDown={e => e.key === 'Enter' && verify()}
        placeholder="000000"
        inputMode="numeric"
        autoFocus
      />
      <ErrorLine text={err} />
      <button className="auth-btn" onClick={verify} disabled={busy || code.length !== 6}>
        {busy ? 'Входим…' : 'Войти'}
      </button>
      <button className="auth-link auth-link--sm" onClick={() => { setStep('email'); setCode(''); setErr('') }}>
        Изменить почту
      </button>
    </>
  )
}

// ─── Вход через Telegram ───────────────────────────────────────────────────
function TgForm({ onLogin }) {
  const [stage, setStage] = useState('init') // init → code
  const [linkToken, setLinkToken] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const cancelled = useRef(false)

  useEffect(() => () => { cancelled.current = true }, [])

  const start = async () => {
    setErr(''); setBusy(true)
    const r = await window.api.authTgInit()
    setBusy(false)
    if (cancelled.current) return
    if (r.success && r.link) {
      setLinkToken(r.link_token)
      setStage('code')
      window.api.openExternal(r.link)
    } else {
      setErr(r.error || 'Не удалось начать вход')
    }
  }

  const verify = async () => {
    const c = code.replace(/\D/g, '').slice(0, 6)
    if (c.length !== 6) { setErr('Код из 6 цифр'); return }
    setErr(''); setBusy(true)
    const r = await window.api.authTgVerify(linkToken, c)
    setBusy(false)
    if (r.success) onLogin()
    else setErr(r.error || 'Неверный код')
  }

  if (stage === 'init') {
    return (
      <>
        <p className="auth-hint">Откроем бота — нажмите <b>Start</b>, бот пришлёт код для входа.</p>
        <ErrorLine text={err} />
        <button className="auth-btn" onClick={start} disabled={busy}>
          {busy ? 'Открываем…' : 'Войти через Telegram'}
        </button>
      </>
    )
  }

  return (
    <>
      <p className="auth-hint">В боте нажмите <b>Start</b> и введите код из чата.</p>
      <input
        className="auth-input auth-input--code"
        value={code}
        onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr('') }}
        onKeyDown={e => e.key === 'Enter' && verify()}
        placeholder="000000"
        inputMode="numeric"
        autoFocus
      />
      <ErrorLine text={err} />
      <button className="auth-btn" onClick={verify} disabled={busy || code.length !== 6}>
        {busy ? 'Входим…' : 'Войти'}
      </button>
      <button className="auth-link auth-link--sm" onClick={start} disabled={busy}>
        Открыть бота ещё раз
      </button>
    </>
  )
}
