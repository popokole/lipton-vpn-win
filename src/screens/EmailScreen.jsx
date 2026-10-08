import { useEffect, useRef, useState } from 'react'
import { Button, CodeBoxes, Field, Glass, Icon } from '../components/ui'
import Screen from './Screen'

// Изменение почты (макет new-scr-email): шаг 1 — новый адрес и код на него,
// шаг 2 — 6 цифр из письма. Без почты — то же самое, но «Привязать почту».
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const RESEND_S = 60

export default function EmailScreen({ onBack, onToast, onChanged }) {
  const [profile, setProfile] = useState(null)
  const [tgLinked, setTgLinked] = useState(false)
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [flash, setFlash] = useState('')
  const [left, setLeft] = useState(0)
  const codeRef = useRef(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  useEffect(() => {
    window.api?.accountProfile?.().then(r => { if (alive.current && r?.success) setProfile(r.profile || null) }).catch(() => {})
    window.api?.accountIdentities?.().then(r => {
      if (alive.current && r?.success) setTgLinked((r.identities || []).some(i => i.type === 'telegram'))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (left <= 0) return undefined
    const t = setTimeout(() => setLeft(l => l - 1), 1000)
    return () => clearTimeout(t)
  }, [left])

  const current = profile?.email || ''
  const clean = email.trim().toLowerCase()
  const valid = EMAIL_RE.test(clean) && clean !== current
  const step = sentTo ? 2 : 1

  const send = async (target = clean) => {
    if (!EMAIL_RE.test(target)) { setErr('Введите почту в формате name@example.com'); return }
    if (target === current) { setErr('Это и так ваша почта'); return }
    setBusy(true); setErr('')
    const r = await window.api.accountEmailRequest(target).catch(x => ({ success: false, error: x?.message }))
    if (!alive.current) return
    setBusy(false)
    if (!r?.success) { setErr(r?.error || 'Не удалось отправить код'); return }
    setSentTo(target)
    setCode('')
    setLeft(RESEND_S)
    setTimeout(() => codeRef.current?.focus(), 50)
  }

  const confirm = async (c = code) => {
    if (String(c).length !== 6) { setErr('Код из 6 цифр'); return }
    setBusy(true); setErr('')
    const r = await window.api.accountEmailChange(sentTo, c).catch(x => ({ success: false, error: x?.message }))
    if (!alive.current) return
    setBusy(false)
    if (!r?.success) {
      setErr(r?.error || 'Неверный код')
      setFlash('err')
      setTimeout(() => alive.current && setFlash(''), 500)
      return
    }
    setFlash('ok')
    onToast?.(r.merged ? 'Почта изменена — аккаунты объединены' : current ? 'Почта изменена' : 'Почта привязана')
    onChanged?.()
    setTimeout(() => alive.current && onBack(), 700)
  }

  return (
    <Screen title={current ? 'Изменение почты' : 'Привязка почты'} onBack={onBack}>
      <div className="cols-2 scr-cols">
        <div className="col">
          <Glass className="scr-card mail-current ui-rise" style={{ '--i': 1 }}>
            <span className="set-ico" aria-hidden="true"><Icon name="mail" size={16} stroke={2} /></span>
            <span className="set-row-text">
              <span className="set-row-sub">Текущая почта</span>
              <span className="mail-current-addr">{current || 'не привязана'}</span>
            </span>
            {current && <span className="scr-pill scr-pill--ok"><Icon name="check" size={11} stroke={2.6} />Подтверждена</span>}
          </Glass>
          <div className="scr-note ui-rise" style={{ '--i': 2 }}>
            <Icon name="info" size={15} stroke={2} />
            <span>
              Код придёт на новый адрес — так мы проверим, что почта ваша.
              {tgLinked ? ' Вход через Telegram продолжит работать.' : ''}
              {' '}Если адрес уже привязан к другому аккаунту, аккаунты объединятся.
            </span>
          </div>
        </div>

        <div className="col">
          <Glass className={`scr-card mail-step${step === 1 ? ' is-current' : ' is-done'} ui-rise`} style={{ '--i': 2 }}>
            <div className="mail-step-head">
              <span className="mail-step-n">{step > 1 ? <Icon name="check" size={12} stroke={2.8} /> : '1'}</span>
              <span className="mail-step-title">Новая почта</span>
              <span className="mail-step-meta">Шаг 1 из 2</span>
            </div>
            <form className="mail-step-body" onSubmit={e => { e.preventDefault(); send() }}>
              <Field
                icon="mail"
                type="email"
                value={step === 2 ? sentTo : email}
                ok={step === 2 || valid}
                onChange={e => { setEmail(e.target.value); setErr(''); setSentTo('') }}
                placeholder="new@example.com"
                autoFocus
              />
              {step === 1 && (
                <>
                  <span className="scr-hint">Код придёт на новый адрес</span>
                  {err && <div className="scr-error" role="alert">{err}</div>}
                  <Button type="submit" variant="primary" block disabled={busy || !valid}
                    icon={busy ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : null}>
                    {busy ? 'Отправляем…' : 'Отправить код'}
                  </Button>
                </>
              )}
            </form>
          </Glass>

          <Glass className={`scr-card mail-step${step === 2 ? ' is-current' : ' is-locked'} ui-rise`} style={{ '--i': 3 }}>
            <div className="mail-step-head">
              <span className="mail-step-n">2</span>
              <span className="mail-step-title">Код из письма</span>
              <span className="mail-step-meta">Шаг 2 из 2</span>
            </div>
            <div className="mail-step-body">
              <span className="scr-hint">{step === 2 ? <>Введите 6 цифр из письма на <b>{sentTo}</b></> : 'Сначала отправьте код на новую почту'}</span>
              <CodeBoxes ref={codeRef} length={6} value={code} onChange={v => { setCode(v); setErr('') }} onComplete={confirm} flash={flash} disabled={step !== 2 || busy} label="Код из письма" />
              {step === 2 && err && <div className="scr-error" role="alert">{err}</div>}
              {step === 2 && (
                <button type="button" className="onb-resend" disabled={left > 0 || busy} onClick={() => send(sentTo)}>
                  <Icon name="refresh" size={13} stroke={2.2} />
                  <span>Отправить код ещё раз</span>
                  {left > 0 && <><span aria-hidden="true">·</span><span className="num">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span></>}
                </button>
              )}
              <Button block disabled={step !== 2 || busy || code.length !== 6} onClick={() => confirm()} icon={<Icon name="check" size={15} stroke={2.2} />}>
                Подтвердить
              </Button>
            </div>
          </Glass>
        </div>
      </div>
    </Screen>
  )
}
