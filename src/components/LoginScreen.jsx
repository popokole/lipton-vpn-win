import { useEffect, useRef, useState } from 'react'

const METHODS = [
  { key: 'code',  label: 'Код с сайта' },
  { key: 'email', label: 'Почта' },
  { key: 'tg',    label: 'Telegram' },
]

const SITE_URL = 'https://site.popokole.online/app/connect'
const BOT_URL  = 'https://t.me/botlipton_rengen_bot'

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

// ─── Вход через Telegram (6 цифр из бота) ──────────────────────────────────
function TgForm({ onLogin }) {
  const [linkToken, setLinkToken] = useState('')
  const [tgLink, setTgLink] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [waiting, setWaiting] = useState(false) // ждём подтверждения в боте (авто-вход)
  const [flash, setFlash] = useState('')
  const cancelled = useRef(false)
  const pollRef = useRef(null)

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  useEffect(() => () => { cancelled.current = true; stopPoll() }, [])

  const succeed = () => {
    stopPoll(); setWaiting(false); setFlash('ok'); setTimeout(() => onLogin(), 650)
  }

  // Авто-вход: как только пользователь нажал Start в боте, poll вернёт токены.
  const startPolling = (token) => {
    stopPoll()
    setWaiting(true)
    const started = Date.now()
    pollRef.current = setInterval(async () => {
      if (cancelled.current) return stopPoll()
      if (Date.now() - started > 290000) { stopPoll(); setWaiting(false); return } // TTL 5 мин
      const r = await window.api.authTgPoll(token)
      if (cancelled.current) return
      if (r.success && r.done) succeed()
      else if (!r.success) { stopPoll(); setWaiting(false) } // сессия истекла — вход по коду
    }, 2500)
  }

  const openBot = async () => {
    setErr(''); setOpening(true)
    const r = await window.api.authTgInit()
    setOpening(false)
    if (cancelled.current) return
    if (r.success && r.link) {
      setLinkToken(r.link_token)
      setTgLink(r.link)
      // Надёжное открытие: tg:// (десктоп-Telegram) → фолбэк на t.me в браузере.
      const o = await window.api.openTelegram(r.link)
      if (!o?.success) setErr('Не удалось открыть Telegram. Откройте бота вручную ссылкой ниже.')
      startPolling(r.link_token) // ждём нажатия Start — войдём сами
    } else {
      setErr(r.error || 'Не удалось начать вход. Проверьте интернет и попробуйте снова.')
    }
  }

  const verify = async () => {
    if (!linkToken) { setErr('Сначала откройте бота кнопкой выше'); return }
    const c = code.replace(/\D/g, '').slice(0, 6)
    if (c.length !== 6) { setErr('Код из 6 цифр'); setFlash('err'); setTimeout(() => setFlash(''), 500); return }
    setErr(''); setBusy(true)
    const r = await window.api.authTgVerify(linkToken, c)
    setBusy(false)
    if (r.success) { succeed() }
    else { setErr(r.error || 'Неверный код'); setFlash('err'); setTimeout(() => setFlash(''), 500) }
  }

  return (
    <>
      <p className="auth-hint">
        Откройте бота и нажмите <b>Start</b> — вход выполнится автоматически.
      </p>
      <button className="auth-btn auth-btn--tg" onClick={openBot} disabled={opening}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8, verticalAlign: '-3px' }}>
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.25 14.47l-2.95-.924c-.64-.203-.654-.64.136-.95l11.52-4.44c.534-.194 1.001.13.606.092z"/>
        </svg>
        {opening ? 'Открываем…' : linkToken ? 'Открыть бота ещё раз' : 'Открыть бота в Telegram'}
      </button>
      {tgLink && (
        <button className="auth-link auth-link--sm" onClick={() => window.api.openExternal(tgLink)}>
          Не открылся? Открыть через браузер
        </button>
      )}

      {waiting && (
        <div className="auth-hint" style={{ textAlign: 'center', marginTop: 4 }}>
          ⏳ Ждём подтверждения в Telegram — нажмите <b>Start</b> в боте…
        </div>
      )}

      {/* Запасной вариант: если авто-вход не сработал — код из бота вручную */}
      {linkToken && (
        <>
          <div className="auth-or" style={{ marginTop: 8 }}><span>или код из бота вручную</span></div>
          <input
            className={`auth-input auth-input--code${flashClass(flash)}`}
            value={code}
            onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(''); setFlash('') }}
            onKeyDown={e => e.key === 'Enter' && verify()}
            placeholder="000000"
            inputMode="numeric"
          />
          <ErrorLine text={err} />
          <button className={`auth-btn${flash === 'ok' ? ' auth-btn--ok' : ''}`} onClick={verify} disabled={busy || flash === 'ok' || code.length !== 6}>
            {flash === 'ok' ? '✓ Вход выполнен' : busy ? 'Входим…' : 'Войти по коду'}
          </button>
        </>
      )}
      {!linkToken && <ErrorLine text={err} />}
    </>
  )
}
