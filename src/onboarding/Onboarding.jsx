import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, CodeBoxes, Field, Flag, Glass, Icon, Logo } from '../components/ui'
import { OnbGlow, OrbitArt, ClockArt, ChatArt, CheckArt } from './art'
import { planSummary, daysWord, rub, cheapestMonthly, plural } from '../lib/plan.mjs'
import { deviceInfo } from '../lib/settings.mjs'
import { minutesWord, retryLabel, trialMinutes } from '../lib/guest.mjs'

// Знакомство, вход и гостевой доступ (макеты new-onb-*), под окно 960×620:
// слева — свечение, иллюстрация и заголовок, справа — карточка с действиями.
// В узком окне (компактный вид) половины встают друг под друга.
//
// Шаги: welcome → trial («15 минут без регистрации») | start («Начнём
// знакомство») | login (Почта / Код с сайта / Telegram) → emailCode | tg
// («Ждём подтверждения…») → success («Вы вошли») → howto («Как пользоваться»,
// один раз при первом запуске).

const SITE = 'https://liptonone.online'
const CONNECT_URL = `${SITE}/app/connect`
const TERMS_URL = `${SITE}/legal?doc=terms`
const PRIVACY_URL = `${SITE}/legal?doc=privacy`
const DEFAULT_BOT = '@liptonvpn_bot'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const RESEND_S = 60

// Тон шага: зелёный — приветствие, пробный доступ, «Вы вошли»; тёплый — формы.
const TONE = { welcome: 'green', trial: 'green', success: 'green' }

// Обратный отсчёт до повторной отправки: [осталось секунд, запустить заново].
function useCountdown(seconds) {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return undefined
    const t = setTimeout(() => setLeft(l => l - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, () => setLeft(seconds)]
}

const fmtSec = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function Brand({ dots }) {
  return (
    <div className="onb-brand">
      <Logo size={16} boxed />
      <span>Lipton VPN</span>
      {dots != null && (
        <span className="onb-dots" aria-hidden="true">
          {[0, 1, 2].map(i => <i key={i} className={i === dots ? 'is-on' : ''} />)}
        </span>
      )}
    </div>
  )
}

function Err({ text }) {
  if (!text) return null
  return <div className="onb-err" role="alert"><Icon name="alert" size={14} stroke={2} /><span>{text}</span></div>
}

function Tabs({ value, onChange }) {
  const tabs = [
    { v: 'email', label: 'Почта', icon: 'mail' },
    { v: 'code', label: 'Код с сайта', icon: 'card' },
    { v: 'tg', label: 'Telegram', icon: 'send' },
  ]
  return (
    <div className="onb-tabs" role="tablist" aria-label="Способ входа">
      {tabs.map(t => (
        <button
          key={t.v}
          type="button"
          role="tab"
          aria-selected={value === t.v}
          className="onb-tab"
          onClick={() => onChange(t.v)}
        >
          <Icon name={t.icon} size={14} stroke={2} />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  )
}

export default function Onboarding({
  initialStep = 'welcome',
  initialParams = null,
  config = null,
  guest = null,
  firstLaunch = false,
  onClose = null,
  onAuthed,
  onGuest,
  onHowtoDone,
}) {
  const [step, setStep] = useState(initialStep)
  const [params, setParams] = useState(() => initialParams || {})
  const history = useRef([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const bot = config?.support_bot || DEFAULT_BOT
  const minutes = trialMinutes(config)
  const minText = `${minutes} ${minutesWord(minutes)}`
  const cheapest = cheapestMonthly(config)

  const go = useCallback((next, p = {}, { replace = false } = {}) => {
    if (!replace) history.current.push({ step, params })
    setStep(next)
    setParams(p)
    setErr('')
    setFlash('')
    setBusy(false)
  }, [step, params])

  const back = useCallback(() => {
    const prev = history.current.pop()
    if (prev) {
      setStep(prev.step)
      setParams(prev.params)
      setErr('')
      setFlash('')
      setBusy(false)
    } else {
      onClose?.()
    }
  }, [onClose])

  const canBack = history.current.length > 0 || !!onClose
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target
      if (t && t.tagName === 'INPUT' && t.value) return
      if (canBack && step !== 'success') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back, canBack, step])

  const shake = (text) => {
    setErr(text)
    setFlash('err')
    setTimeout(() => { if (alive.current) setFlash('') }, 500)
  }

  // ── Вход выполнен ──
  const [auth, setAuth] = useState(null) // { view, devices, hwid, limit }
  const authed = useCallback((sync) => {
    setFlash('ok')
    setTimeout(() => {
      if (!alive.current) return
      history.current = []
      setAuth({ view: sync?.view || null })
      go('success', {}, { replace: true })
    }, 550)
  }, [go])

  const finish = (after) => {
    if (firstLaunch) { go('howto', { after }); return }
    if (after === 'guest') onGuest?.()
    else onAuthed?.()
  }

  const finishHowto = async () => {
    try { await window.api?.completeOnboarding?.() } catch {}
    const after = params.after
    if (after === 'guest') onGuest?.()
    else if (after === 'auth') onAuthed?.()
    else onHowtoDone?.()
  }

  // ── Гостевой доступ ──
  const [trialUsed, setTrialUsed] = useState(() => {
    const r = Number(guest?.retryAt)
    return r && r > Date.now() ? r : null
  })
  const startGuest = async () => {
    if (busy) return
    setBusy(true); setErr('')
    const r = await window.api.guestStart().catch(e => ({ success: false, error: e?.message }))
    if (!alive.current) return
    setBusy(false)
    if (r?.success) { finish('guest'); return }
    if (r?.code === 'guest_trial_used') { setTrialUsed(r.retryAt || Date.now() + 86400000); return }
    setErr(r?.error || 'Не удалось включить пробный доступ')
  }

  // ── Telegram: ссылка с токеном → «Запустить» в боте → вход сам ──
  const tg = useRef(null) // { token, link, until }
  const [tgState, setTgState] = useState('wait') // wait | expired
  const startTelegram = async () => {
    if (busy) return
    setBusy(true); setErr('')
    const r = await window.api.authTgInit().catch(e => ({ success: false, error: e?.message }))
    if (!alive.current) return
    setBusy(false)
    if (!r?.success || !r.link) { setErr(r?.error || 'Не удалось начать вход. Проверьте интернет и попробуйте снова.'); return }
    tg.current = { token: r.link_token, link: r.link, until: Date.now() + (Number(r.ttl) || 300) * 1000 }
    window.api.openTelegram?.(r.link)
    setTgState('wait')
    if (step === 'tg') { setErr(''); return }
    go('tg')
  }

  useEffect(() => {
    if (step !== 'tg' || tgState !== 'wait' || !tg.current) return undefined
    let stop = false
    const poll = async () => {
      if (stop || !tg.current) return
      if (Date.now() > tg.current.until) { setTgState('expired'); return }
      const r = await window.api.authTgPoll(tg.current.token).catch(() => null)
      if (stop || !alive.current) return
      if (r?.success && r.done) { stop = true; authed(r.sync); return }
      if (r && !r.success) { setTgState('expired'); return }
    }
    const id = setInterval(poll, 2500)
    return () => { stop = true; clearInterval(id) }
  }, [step, tgState, authed])

  // ── Почта ──
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [resendLeft, resetResend] = useCountdown(RESEND_S)
  const emailOk = EMAIL_RE.test(email.trim())

  const requestEmail = async (target, { resend = false } = {}) => {
    const e = (target || email).trim().toLowerCase()
    if (!EMAIL_RE.test(e)) { shake('Введите почту в формате name@example.com'); return }
    setBusy(true); setErr('')
    const r = await window.api.authEmailRequest(e).catch(x => ({ success: false, error: x?.message }))
    if (!alive.current) return
    setBusy(false)
    if (!r?.success) { setErr(r?.error || 'Не удалось отправить код'); return }
    setEmail(e)
    resetResend()
    if (!resend) { setCode(''); go('emailCode', { email: e }) }
  }

  const verifyEmail = async (c = code) => {
    const clean = String(c).replace(/\D/g, '')
    if (clean.length !== 6) { shake('Код из 6 цифр'); return }
    setBusy(true); setErr('')
    const r = await window.api.authEmailVerify(params.email || email, clean).catch(x => ({ success: false, error: x?.message }))
    if (!alive.current) return
    setBusy(false)
    if (r?.success) authed(r.sync)
    else shake(r?.error || 'Неверный код')
  }

  // ── Код с сайта или из бота («Вход через ПК», 4 цифры) ──
  const [siteCode, setSiteCode] = useState('')
  const exchange = async (c) => {
    const clean = String(c).replace(/\D/g, '')
    if (clean.length !== 4) { shake('Введите код из 4 цифр'); return }
    setBusy(true); setErr('')
    const r = await window.api.authDeviceExchange(clean).catch(x => ({ success: false, error: x?.message }))
    if (!alive.current) return
    setBusy(false)
    if (r?.success) authed(r.sync)
    else shake(r?.error || 'Неверный или истёкший код')
  }

  // ── Код из бота по ссылке входа (6 цифр) ──
  const [tgCode, setTgCode] = useState('')
  const [tgManual, setTgManual] = useState(false)
  const verifyTg = async (c) => {
    const clean = String(c).replace(/\D/g, '')
    if (!tg.current) return
    if (clean.length !== 6) { shake('Код из 6 цифр'); return }
    setBusy(true); setErr('')
    const r = await window.api.authTgVerify(tg.current.token, clean).catch(x => ({ success: false, error: x?.message }))
    if (!alive.current) return
    setBusy(false)
    if (r?.success) authed(r.sync)
    else shake(r?.error || 'Неверный код')
  }

  // ── «Вы вошли»: подписка и это устройство ──
  useEffect(() => {
    if (step !== 'success') return undefined
    let live = true
    const api = window.api
    ;(async () => {
      let view = auth?.view
      if (!view) {
        const s = await api.accountSubscriptionView?.().catch(() => null)
        view = s?.success ? s.view : null
      }
      const d = await api.accountDevices?.().catch(() => null)
      if (!live) return
      setAuth(a => ({
        ...(a || {}), view,
        devices: d?.success ? d.devices || [] : null,
        hwid: d?.hwid || null,
        limit: d?.device_limit || view?.device_limit || null,
      }))
    })()
    return () => { live = false }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Страны для приветствия (публичный статус серверов) ──
  const [countries, setCountries] = useState(null)
  useEffect(() => {
    if (step !== 'welcome' || countries) return undefined
    let live = true
    window.api?.serverStatus?.().then(r => {
      if (!live || !r?.success) return
      const list = [...new Set((r.servers || []).map(s => String(s.country || '').toLowerCase()).filter(c => /^[a-z]{2}$/.test(c)))]
      setCountries(list)
    }).catch(() => {})
    return () => { live = false }
  }, [step, countries])

  const loginTab = params.tab || 'email'
  const tone = TONE[step] || 'warm'

  // ─── Содержимое шагов: { hero, art, label, top, body } ───
  let art = null
  let hero = null
  let label = ''
  let topRight = null
  let body = null
  let dots = null

  switch (step) {
    case 'welcome': {
      const flags = countries && countries.length ? countries.slice(0, 2) : ['nl', 'de']
      dots = 0
      art = <OrbitArt flags={flags} />
      hero = {
        h1: 'Интернет', accent: 'без границ.',
        sub: 'Подключение в одно касание. Защита для всех ваших устройств — до 5 штук.',
      }
      const stats = (
        <ul className="onb-stats">
          <li><Icon name="infinity" size={22} stroke={2} className="onb-stat-ico" /><span>безлимит</span></li>
          <li><b className="num">5</b><span>{plural(5, 'устройство', 'устройства', 'устройств')}</span></li>
          {countries && countries.length > 0 ? (
            <li>
              <b className="num">{countries.length}<span className="onb-stat-flags">{countries.slice(0, 3).map(c => <Flag key={c} code={c} size={16} />)}</span></b>
              <span>{plural(countries.length, 'страна', 'страны', 'стран')}</span>
            </li>
          ) : (
            <li><Icon name="shuffle" size={20} stroke={2} className="onb-stat-ico" /><span>Авто-баланс</span></li>
          )}
        </ul>
      )
      body = (
        <>
          {stats}
          <button type="button" className="onb-try" onClick={() => go('trial')}>
            <span className="onb-try-text">
              <b>Попробовать {minText}</b>
              <span>без регистрации</span>
            </span>
            <span className="onb-try-arrow" aria-hidden="true"><Icon name="arrowRight" size={18} stroke={2.2} /></span>
          </button>
          <Button size="lg" block icon={<Icon name="userPlus" size={18} stroke={2} />} onClick={() => go('start')}>Создать аккаунт</Button>
          <div className="onb-foot">Уже есть аккаунт? <button type="button" className="onb-link onb-link--accent" onClick={() => go('login')}>Войти</button></div>
        </>
      )
      break
    }

    case 'trial': {
      art = <ClockArt label={`${minutes}:00`} caption={minutesWord(minutes)} />
      hero = {
        h1: minText, accent: 'без регистрации.',
        sub: 'Успеете включить VPN, зайти в Telegram и получить код входа. Доступно раз в день.',
      }
      const usedLabel = trialUsed ? retryLabel(trialUsed) : ''
      body = trialUsed && usedLabel ? (
        <>
          <div className="onb-note onb-note--warn">
            <Icon name="hourglass" size={18} stroke={2} />
            <span>Сегодня пробный доступ уже был. Снова можно <b>{usedLabel}</b>. Чтобы продолжить сейчас — создайте аккаунт или войдите.</span>
          </div>
          <Button variant="primary" size="lg" block icon={<Icon name="userPlus" size={18} stroke={2} />} onClick={() => go('start')}>Создать аккаунт</Button>
          <Button size="lg" block icon={<Icon name="login" size={18} stroke={2} />} onClick={() => go('login')}>Войти</Button>
        </>
      ) : (
        <>
          <ul className="onb-checks">
            <li><Icon name="check" size={12} stroke={2.8} /><span>Быстрый сервер — выбирать ничего не нужно</span></li>
            <li><Icon name="check" size={12} stroke={2.8} /><span>Без аккаунта и карты</span></li>
            <li><Icon name="check" size={12} stroke={2.8} /><span>Раз в день — каждый день заново</span></li>
          </ul>
          <Err text={err} />
          <Button
            variant="primary" size="lg" block onClick={startGuest} disabled={busy}
            icon={busy ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : null}
          >
            {busy ? 'Включаем…' : <>Начать {minText} <Icon name="arrowRight" size={16} stroke={2.2} className="onb-inline-ico" /></>}
          </Button>
          <Button size="lg" block icon={<Icon name="userPlus" size={18} stroke={2} />} onClick={() => go('start')}>Сначала создать аккаунт</Button>
        </>
      )
      break
    }

    case 'start':
      dots = 2
      art = <ChatArt />
      topRight = <button type="button" className="onb-top-link" onClick={() => go('login')}>Войти</button>
      hero = {
        h1: 'Начнём', accent: 'знакомство.',
        sub: 'Создайте аккаунт за минуту — через нашего Telegram-бота или по почте.',
      }
      body = (
        <>
          <Glass className="onb-bot">
            <span className="onb-bot-ico" aria-hidden="true"><Icon name="telegram" size={20} stroke={2.2} /></span>
            <span className="onb-bot-text">
              <b>Бот Lipton VPN <Icon name="checkCircle" size={14} stroke={2.2} className="onb-bot-verified" /></b>
              <span className="onb-bot-user">{bot}</span>
              <span>создаст аккаунт и пришлёт ссылку</span>
            </span>
          </Glass>
          <Err text={err} />
          <Button
            variant="primary" size="lg" block onClick={startTelegram} disabled={busy}
            icon={busy ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : <Icon name="send" size={17} stroke={2} />}
          >
            Создать аккаунт в Telegram
          </Button>
          <Button size="lg" block icon={<Icon name="mail" size={18} stroke={2} />} onClick={() => go('login', { tab: 'email', create: true })}>Создать по почте</Button>
          <p className="onb-terms">
            Нажимая, вы соглашаетесь с <button type="button" className="onb-link" onClick={() => window.api?.openExternal?.(TERMS_URL)}>условиями</button>{' '}
            и <button type="button" className="onb-link" onClick={() => window.api?.openExternal?.(PRIVACY_URL)}>политикой конфиденциальности</button>
          </p>
          <div className="onb-foot">Уже есть аккаунт? <button type="button" className="onb-link onb-link--accent" onClick={() => go('login')}>Войти</button></div>
        </>
      )
      break

    case 'login': {
      const create = !!params.create
      label = create ? 'Новый аккаунт' : 'Вход'
      if (loginTab === 'code') hero = { h1: 'Один код.', accent: 'Ваш аккаунт.', sub: 'Код с сайта входит в аккаунт без пароля — подписка и устройства подтянутся сами.' }
      else if (loginTab === 'tg') hero = { h1: 'Вход через', accent: 'Telegram.', sub: `Откроем бота ${bot} — нажмите в нём «Запустить», и вход выполнится сам.` }
      else if (create) hero = { h1: 'Аккаунт', accent: 'по почте.', sub: 'Пришлём код — и аккаунт готов. Пароль не нужен.' }
      else hero = { h1: 'С возвращением.', accent: 'Всё на месте.', sub: 'Войдите — подписка и устройства подтянутся сами.' }
      const setTab = (tab) => { setParams(p => ({ ...p, tab })); setErr(''); setFlash('') }
      body = (
        <>
          <Tabs value={loginTab} onChange={setTab} />
          {loginTab === 'email' && (
            <form className="onb-form" onSubmit={e => { e.preventDefault(); requestEmail() }}>
              <label className="onb-label" htmlFor="onb-email">Почта</label>
              <Field
                id="onb-email"
                icon="mail"
                type="email"
                value={email}
                ok={emailOk}
                tone={flash === 'err' ? 'error' : ''}
                onChange={e => { setEmail(e.target.value); setErr('') }}
                placeholder="you@example.com"
                autoFocus
              />
              <Err text={err} />
              <Button
                type="submit" variant="primary" size="lg" block disabled={busy}
                icon={busy ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : null}
              >
                {busy ? 'Отправляем…' : <>Получить код <Icon name="arrowRight" size={16} stroke={2.2} className="onb-inline-ico" /></>}
              </Button>
              <div className="onb-hint"><Icon name="lock" size={13} stroke={2} />Пришлём 6-значный код на почту</div>
            </form>
          )}
          {loginTab === 'code' && (
            <div className="onb-form">
              <p className="onb-path">
                Откройте <b>liptonone.online</b> <Icon name="arrowRight" size={12} stroke={2.4} /> <b>Кабинет</b>{' '}
                <Icon name="arrowRight" size={12} stroke={2.4} /> <b>Подключение</b> <Icon name="arrowRight" size={12} stroke={2.4} /> <b>«Получить код»</b>
              </p>
              <CodeBoxes length={4} value={siteCode} onChange={v => { setSiteCode(v); setErr('') }} onComplete={exchange} flash={flash} disabled={busy} autoFocus label="Код с сайта" />
              <Err text={err} />
              <Button
                variant="primary" size="lg" block onClick={() => exchange(siteCode)} disabled={busy || siteCode.length !== 4 || flash === 'ok'}
                icon={busy ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : null}
              >
                {flash === 'ok' ? 'Вход выполнен' : busy ? 'Входим…' : <>Войти <Icon name="arrowRight" size={16} stroke={2.2} className="onb-inline-ico" /></>}
              </Button>
              <Button size="lg" block onClick={() => window.api?.openExternal?.(CONNECT_URL)} icon={<Icon name="external" size={16} stroke={2} />}>Открыть сайт и получить код</Button>
              <div className="onb-hint"><Icon name="clock" size={13} stroke={2} />Код действует 5 минут</div>
            </div>
          )}
          {loginTab === 'tg' && (
            <div className="onb-form">
              <Err text={err} />
              <Button
                variant="primary" size="lg" block onClick={startTelegram} disabled={busy}
                icon={busy ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : <Icon name="send" size={17} stroke={2} />}
              >
                Открыть Telegram
              </Button>
              <div className="onb-or"><span>или код из «💻 Вход через ПК» в боте</span></div>
              <CodeBoxes length={4} value={siteCode} onChange={v => { setSiteCode(v); setErr('') }} onComplete={exchange} flash={flash} disabled={busy} label="Код из бота" />
              <Button size="lg" block onClick={() => exchange(siteCode)} disabled={busy || siteCode.length !== 4 || flash === 'ok'}>
                {flash === 'ok' ? 'Вход выполнен' : 'Войти по коду'}
              </Button>
            </div>
          )}
          <div className="onb-foot">
            {create
              ? <>Уже есть аккаунт? <button type="button" className="onb-link onb-link--accent" onClick={() => go('login')}>Войти</button></>
              : <>Нет аккаунта? <button type="button" className="onb-link onb-link--line" onClick={() => go('start')}>Создать через бота</button></>}
          </div>
        </>
      )
      break
    }

    case 'emailCode':
      label = 'Код из письма'
      hero = { h1: 'Проверьте', accent: 'вашу почту.', sub: <>Мы отправили код на <b className="onb-strong">{params.email}</b></> }
      body = (
        <div className="onb-form">
          <CodeBoxes length={6} value={code} onChange={v => { setCode(v); setErr('') }} onComplete={verifyEmail} flash={flash} disabled={busy} autoFocus label="Код из письма" />
          <Err text={err} />
          <Button
            variant="primary" size="lg" block onClick={() => verifyEmail()} disabled={busy || code.length !== 6 || flash === 'ok'}
            icon={busy ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : null}
          >
            {flash === 'ok' ? 'Вход выполнен' : busy ? 'Входим…' : <>Подтвердить и войти <Icon name="arrowRight" size={16} stroke={2.2} className="onb-inline-ico" /></>}
          </Button>
          <button
            type="button"
            className="onb-resend"
            disabled={resendLeft > 0 || busy}
            onClick={() => requestEmail(params.email, { resend: true })}
          >
            <Icon name="refresh" size={13} stroke={2.2} />
            <span>Отправить код ещё раз</span>
            {resendLeft > 0 && <><span aria-hidden="true">·</span><span className="num">{fmtSec(resendLeft)}</span></>}
          </button>
          <div className="onb-foot"><button type="button" className="onb-link onb-link--line" onClick={back}>Изменить почту</button></div>
        </div>
      )
      break

    case 'tg':
      label = 'Вход через Telegram'
      hero = {
        h1: 'Подтвердите вход', accent: 'в Telegram.',
        sub: <>Мы открыли бота <b className="onb-strong">{bot}</b> — нажмите в нём «Запустить» (Start).</>,
      }
      body = (
        <div className="onb-form">
          {tgState === 'wait' ? (
            <Glass className="onb-wait">
              <span className="onb-wait-ring" aria-hidden="true"><Icon name="send" size={18} stroke={2} /></span>
              <span className="onb-wait-text">
                <b>Ждём подтверждения…</b>
                <span>Обычно это занимает пару секунд</span>
              </span>
            </Glass>
          ) : (
            <div className="onb-note onb-note--warn">
              <Icon name="hourglass" size={18} stroke={2} />
              <span>Ссылка для входа устарела. Откройте бота заново — пришлём новую.</span>
            </div>
          )}
          <Err text={err} />
          <Button
            variant="primary" size="lg" block onClick={tgState === 'wait' && tg.current ? () => window.api.openTelegram?.(tg.current.link) : startTelegram}
            disabled={busy}
            icon={busy ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : null}
          >
            Открыть бота ещё раз <Icon name="arrowRight" size={16} stroke={2.2} className="onb-inline-ico" />
          </Button>
          {tgState === 'wait' && (tgManual ? (
            <>
              <CodeBoxes length={6} value={tgCode} onChange={v => { setTgCode(v); setErr('') }} onComplete={verifyTg} flash={flash} disabled={busy} autoFocus label="Код из бота" />
              <Button size="lg" block onClick={() => verifyTg(tgCode)} disabled={busy || tgCode.length !== 6}>Войти по коду</Button>
            </>
          ) : (
            <button type="button" className="onb-resend" onClick={() => setTgManual(true)}>
              <Icon name="chatDots" size={13} stroke={2.2} /><span>Бот прислал код? Ввести вручную</span>
            </button>
          ))}
          <div className="onb-foot"><button type="button" className="onb-link onb-link--line" onClick={back}>Войти другим способом</button></div>
        </div>
      )
      break

    case 'success': {
      const view = auth?.view || null
      const plan = planSummary({ subscriptions: [], view, config })
      const has = plan.kind === 'active' || plan.kind === 'trial'
      const devices = auth?.devices
      const mine = devices && auth?.hwid ? devices.find(d => d.hwid === auth.hwid) : null
      const limit = auth?.limit || 5
      art = <CheckArt />
      topRight = <span className="onb-top-ok"><i aria-hidden="true" />Вход выполнен</span>
      hero = { h1: 'Вы вошли.', accent: 'Всё готово.', sub: has ? 'Подписка и устройства уже подтянулись.' : 'Аккаунт на месте — осталось выбрать тариф.' }
      body = (
        <>
          {has && (
            <Glass className="onb-item">
              <span className="onb-item-ico"><Icon name="calendar" size={18} stroke={2} /></span>
              <span className="onb-item-text">
                <b>{plan.kind === 'trial' ? 'Пробный период' : `Подписка «${plan.title}»`}</b>
                <span className="num">{[plan.untilLabel, `осталось ${plan.daysLeft} ${daysWord(plan.daysLeft)}`].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="onb-item-check" aria-hidden="true"><Icon name="check" size={12} stroke={2.8} /></span>
            </Glass>
          )}
          {has && devices && (
            <Glass className="onb-item">
              <span className="onb-item-ico"><Icon name="desktop" size={18} stroke={2} /></span>
              <span className="onb-item-text">
                <b>{mine ? 'Устройство добавлено' : 'Устройства на подписке'}</b>
                <span className="num">{mine ? `${deviceInfo(mine).title} · ` : ''}{devices.length} из {limit}</span>
              </span>
              <span className="onb-meter" aria-hidden="true">
                {Array.from({ length: Math.min(limit, 8) }, (_, i) => <i key={i} className={i < devices.length ? 'is-on' : ''} />)}
              </span>
            </Glass>
          )}
          <button type="button" className="onb-item onb-item--link ui-glass" onClick={() => window.api?.openExternal?.(CONNECT_URL)}>
            <span className="onb-item-ico onb-item-ico--blue"><Icon name="phone" size={18} stroke={2} /></span>
            <span className="onb-item-text">
              <b>Другие устройства</b>
              <span>Как подключить — на сайте, в «Подключении»</span>
            </span>
            <Icon name="chevronRight" size={16} stroke={2} className="onb-item-chev" />
          </button>
          <Button variant="primary" size="lg" block onClick={() => finish('auth')}>
            Перейти на главный экран <Icon name="arrowRight" size={16} stroke={2.2} className="onb-inline-ico" />
          </Button>
          {!has && (
            <div className="onb-hint onb-hint--center">
              <Icon name="crown" size={13} stroke={2} />
              <span>Подписки пока нет? Выберите тариф{cheapest ? <> от <b>{rub(cheapest)}</b></> : ''} на главном экране</span>
            </div>
          )}
        </>
      )
      break
    }

    case 'howto':
    default:
      dots = 1
      hero = { h1: 'Как пользоваться', accent: 'VPN', sub: 'Три простых шага — и вы под защитой.' }
      body = (
        <>
          <ol className="onb-steps">
            <li>
              <span className="onb-step-n">1</span>
              <span className="onb-step-text"><b>Выберите сервер</b><span>или Авто-баланс</span></span>
              <span className="onb-pill"><Flag code="de" size={16} />Германия<Icon name="chevronDown" size={12} stroke={2.2} /></span>
            </li>
            <li>
              <span className="onb-step-n">2</span>
              <span className="onb-step-text"><b>Подключитесь</b><span>в одно нажатие</span></span>
              <span className="onb-pill onb-pill--light"><Icon name="power" size={13} stroke={2.2} />Подключить</span>
            </li>
            <li>
              <span className="onb-step-n">3</span>
              <span className="onb-step-text"><b>Отключитесь</b><span>когда нужно</span></span>
              <span className="onb-pill"><Icon name="power" size={13} stroke={2.2} />Отключить</span>
            </li>
          </ol>
          <p className="onb-tip">Окно можно закрыть — VPN продолжит работать в трее, рядом с часами.</p>
          <Button variant="primary" size="lg" block onClick={finishHowto}>
            Продолжить <Icon name="arrowRight" size={16} stroke={2.2} className="onb-inline-ico" />
          </Button>
          <button type="button" className="onb-skip" onClick={finishHowto}>Пропустить</button>
        </>
      )
      break
  }

  const showBack = step === 'success' ? false : canBack

  return (
    <div className={`onb onb--${tone}`} data-step={step}>
      <section className="onb-hero" aria-hidden={false}>
        <OnbGlow />
        {art}
        <div className="onb-copy" key={`${step}:${loginTab}`}>
          <Brand dots={dots} />
          <h1 className="onb-h1">
            <span>{hero.h1}</span>
            <span className="onb-h1-accent">{hero.accent}</span>
          </h1>
          {hero.sub && <p className="onb-sub">{hero.sub}</p>}
          {hero.extra}
        </div>
      </section>

      <section className="onb-side">
        <div className="onb-top">
          {showBack ? (
            <button type="button" className="onb-back" onClick={back} aria-label="Назад">
              <Icon name="chevronLeft" size={18} stroke={2.2} />
            </button>
          ) : <span />}
          {topRight || (label ? <span className="onb-top-label">{label}</span> : null)}
        </div>
        <div className="onb-card" key={step}>
          {body}
        </div>
      </section>
    </div>
  )
}
