import { useState } from 'react'

const METHODS = [
  { key: 'code',  label: 'Код с сайта' },
  { key: 'email', label: 'Почта' },
  { key: 'tg',    label: 'Telegram' },
]

const SITE_URL = 'https://liptonone.online/app/connect'
const BOT_URL  = 'https://t.me/liptonvpn_bot'

export default function LoginScreen({ onLogin, onTrial }) {
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

      {onTrial && <TrialButton onTrial={onTrial} />}

      <button className="auth-link" onClick={() => window.api.openExternal(BOT_URL)}>
        Нет аккаунта? Откройте бота Lipton VPN
      </button>
    </div>
  )
}

function ErrorLine({ text }) {
  if (!text) return null
  return <div className="auth-err">{text}</div>
}

// TrialButton — тест-доступ на 10 минут без аккаунта: сразу можно подключиться.
function TrialButton({ onTrial }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const start = async () => {
    setErr(''); setBusy(true)
    const r = await window.api.trialTestAccess()
    setBusy(false)
    if (r.success) onTrial()
    else setErr(r.error || 'Не удалось включить тест-доступ')
  }

  return (
    <div className="auth-trial">
      <div className="auth-or"><span>или</span></div>
      <button className="auth-btn auth-btn--trial" onClick={start} disabled={busy}>
        {busy ? 'Включаем…' : '🎁 Попробовать 10 минут бесплатно'}
      </button>
      <ErrorLine text={err} />
      <div className="auth-trial-hint">Без аккаунта — сразу подключитесь и проверьте скорость</div>
    </div>
  )
}

// finishes — общий обработчик финального входа: зелёное покачивание при успехе,
// красное при ошибке. Возвращает класс для подсветки поля ввода.
function flashClass(flash) {
  if (flash === 'ok')  return ' auth-input--ok'
  if (flash === 'err') return ' auth-input--err'
  return ''
}

// ─── Вход по коду с сайта (4 цифры) ───────────────────────────────────────
function CodeForm({ onLogin }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')

  const clean = code.replace(/\D/g, '').slice(0, 4)

  const submit = async () => {
    if (clean.length !== 4) { setErr('Введите код из 4 цифр'); setFlash('err'); setTimeout(() => setFlash(''), 500); return }
    setErr(''); setBusy(true)
    const r = await window.api.authDeviceExchange(clean)
    setBusy(false)
    if (r.success) {
      setFlash('ok')
      setTimeout(() => onLogin(), 650)
    } else {
      setErr(r.error || 'Неверный или истёкший код')
      setFlash('err'); setTimeout(() => setFlash(''), 500)
    }
  }

  return (
    <>
      <p className="auth-hint">
        Откройте сайт → <b>Кабинет → Подключение → вкладка Windows</b> → «Получить код» и введите 4 цифры.
      </p>
      <input
        className={`auth-input auth-input--code${flashClass(flash)}`}
        value={clean}
        onChange={e => { setCode(e.target.value); setErr(''); setFlash('') }}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="0000"
        inputMode="numeric"
        autoFocus
      />
      <ErrorLine text={err} />
      <button className={`auth-btn${flash === 'ok' ? ' auth-btn--ok' : ''}`} onClick={submit} disabled={busy || flash === 'ok' || clean.length !== 4}>
        {flash === 'ok' ? '✓ Вход выполнен' : busy ? 'Входим…' : 'Войти'}
      </button>
      <button className="auth-link auth-link--sm" onClick={() => window.api.openExternal(SITE_URL)}>
        Открыть сайт, чтобы получить код
      </button>
    </>
  )
}

// ─── Вход по почте (OTP, 6 цифр) ──────────────────────────────────────────
function EmailForm({ onLogin }) {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')

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
    if (c.length !== 6) { setErr('Код из 6 цифр'); setFlash('err'); setTimeout(() => setFlash(''), 500); return }
    setErr(''); setBusy(true)
    const r = await window.api.authEmailVerify(email, c)
    setBusy(false)
    if (r.success) { setFlash('ok'); setTimeout(() => onLogin(), 650) }
    else { setErr(r.error || 'Неверный код'); setFlash('err'); setTimeout(() => setFlash(''), 500) }
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
        className={`auth-input auth-input--code${flashClass(flash)}`}
        value={code}
        onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(''); setFlash('') }}
        onKeyDown={e => e.key === 'Enter' && verify()}
        placeholder="000000"
        inputMode="numeric"
        autoFocus
      />
      <ErrorLine text={err} />
      <button className={`auth-btn${flash === 'ok' ? ' auth-btn--ok' : ''}`} onClick={verify} disabled={busy || flash === 'ok' || code.length !== 6}>
        {flash === 'ok' ? '✓ Вход выполнен' : busy ? 'Входим…' : 'Войти'}
      </button>
      <button className="auth-link auth-link--sm" onClick={() => { setStep('email'); setCode(''); setErr('') }}>
        Изменить почту
      </button>
    </>
  )
}

// ─── Вход через Telegram: код из бота («Вход через ПК», 4 цифры) ────────────
function TgForm({ onLogin }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')

  const clean = code.replace(/\D/g, '').slice(0, 4)

  const openBot = () => {
    if (window.api.openTelegram) window.api.openTelegram(BOT_URL)
    else window.api.openExternal(BOT_URL)
  }

  const submit = async () => {
    if (clean.length !== 4) { setErr('Введите код из 4 цифр'); setFlash('err'); setTimeout(() => setFlash(''), 500); return }
    setErr(''); setBusy(true)
    const r = await window.api.authDeviceExchange(clean)
    setBusy(false)
    if (r.success) {
      setFlash('ok')
      setTimeout(() => onLogin(), 650)
    } else {
      setErr(r.error || 'Неверный или истёкший код')
      setFlash('err'); setTimeout(() => setFlash(''), 500)
    }
  }

  return (
    <>
      <p className="auth-hint">
        Откройте бота Lipton VPN → нажмите <b>«💻 Вход через ПК»</b> → бот пришлёт код. Введите его ниже.
      </p>
      <button className="auth-btn auth-btn--tg" onClick={openBot}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8, verticalAlign: '-3px' }}>
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.25 14.47l-2.95-.924c-.64-.203-.654-.64.136-.95l11.52-4.44c.534-.194 1.001.13.606.092z"/>
        </svg>
        Открыть бота в Telegram
      </button>
      <input
        className={`auth-input auth-input--code${flashClass(flash)}`}
        value={clean}
        onChange={e => { setCode(e.target.value); setErr(''); setFlash('') }}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="0000"
        inputMode="numeric"
      />
      <ErrorLine text={err} />
      <button className={`auth-btn${flash === 'ok' ? ' auth-btn--ok' : ''}`} onClick={submit} disabled={busy || flash === 'ok' || clean.length !== 4}>
        {flash === 'ok' ? '✓ Вход выполнен' : busy ? 'Входим…' : 'Войти'}
      </button>
    </>
  )
}
