import { useEffect, useRef, useState } from 'react'
import { Button, Field, Glass, Icon } from '../components/ui'
import Screen, { Overline } from './Screen'
import { promoBenefit, promoHeadline } from '../lib/screens.mjs'
import { rub } from '../lib/plan.mjs'

// Промокод (макет new-scr-promo): проверяем код на сервере и запоминаем —
// скидка или бонусные дни применятся при следующей оплате (код подставится
// на экране оплаты сам).
export default function PromoScreen({ onBack, onPay, cheapest }) {
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  useEffect(() => {
    window.api?.promoPending?.().then(p => { if (alive.current && p?.code) setPending(p) }).catch(() => {})
  }, [])

  const apply = async (e) => {
    e?.preventDefault()
    const c = code.trim()
    if (!c) { setErr('Введите промокод'); return }
    setBusy(true); setErr('')
    const r = await window.api.promoValidate(c).catch(x => ({ success: false, error: x?.message }))
    if (!alive.current) return
    setBusy(false)
    if (!r?.success) { setErr(r?.error || 'Не удалось проверить промокод'); return }
    if (!r.valid) { setErr(r.reason || 'Промокод не подходит'); return }
    setPending(r.promo)
    setCode('')
  }

  const clear = async () => {
    await window.api?.promoClear?.().catch(() => {})
    if (alive.current) setPending(null)
  }

  const head = promoHeadline(pending)
  const example = pending?.kind === 'percent' && pending.percent_off && cheapest
    ? `Например, ${rub(cheapest)} → ${rub(Math.round(cheapest * (100 - pending.percent_off) / 10000) * 100)} за месяц`
    : 'Например, 159 ₽ → 143 ₽ при скидке 10%'

  return (
    <Screen title="Промокод" onBack={onBack}>
      <div className="cols-2 scr-cols">
        <div className="col">
          <Glass edge className="promo-ticket ui-rise" style={{ '--i': 1 }}>
            <div className="promo-ticket-main">
              <span className="promo-ticket-label"><Icon name="tag" size={13} stroke={2} />Промокод</span>
              <span className="promo-ticket-head display">{head || '−10%'}</span>
              <span className="promo-ticket-sub">{head ? promoBenefit(pending) : <>или <b>+7 дней</b> к подписке</>}</span>
            </div>
            <div className="promo-ticket-side" aria-hidden="true">
              <span className="promo-ticket-gift"><Icon name="gift" size={20} stroke={1.8} /></span>
              <span>подарок</span>
            </div>
          </Glass>

          <form className="promo-form ui-rise" style={{ '--i': 2 }} onSubmit={apply}>
            <label className="scr-label" htmlFor="promo-input">Промокод</label>
            <Field
              id="promo-input"
              icon="tag"
              value={code}
              tone={err ? 'error' : ''}
              onChange={e => { setCode(e.target.value.toUpperCase()); setErr('') }}
              placeholder="Например, LIPTON10"
              autoFocus
            />
            {err && <div className="scr-error" role="alert">{err}</div>}
            <Button type="submit" variant="primary" size="lg" block disabled={busy || !code.trim()}
              icon={busy ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : null}>
              {busy ? 'Проверяем…' : <>Применить <Icon name="arrowRight" size={16} stroke={2.2} className="onb-inline-ico" /></>}
            </Button>
          </form>

          {pending && (
            <Glass className="promo-applied ui-rise" style={{ '--i': 3 }}>
              <span className="promo-applied-ico" aria-hidden="true"><Icon name="check" size={16} stroke={2.6} /></span>
              <span className="set-row-text">
                <span className="promo-applied-code">{pending.code} <span className="scr-pill scr-pill--ok">применён</span></span>
                <span className="promo-applied-sub">{promoBenefit(pending)}</span>
              </span>
              <button type="button" className="ui-icon-btn" onClick={clear} aria-label="Убрать промокод" title="Убрать промокод">
                <Icon name="close" size={14} stroke={2} />
              </button>
            </Glass>
          )}
          {pending && onPay && (
            <Button block onClick={onPay} icon={<Icon name="crown" size={15} stroke={2} />}>Перейти к оплате</Button>
          )}
        </div>

        <div className="col">
          <section className="set-section">
            <Overline>Как это работает</Overline>
            <div className="promo-how">
              <Glass className="promo-how-tile ui-rise" style={{ '--i': 2 }}>
                <span className="set-ico" aria-hidden="true"><Icon name="percent" size={16} stroke={2} /></span>
                <b>Скидка — к следующей оплате</b>
                <span>{example}</span>
              </Glass>
              <Glass className="promo-how-tile ui-rise" style={{ '--i': 3 }}>
                <span className="set-ico" aria-hidden="true"><Icon name="calendar" size={16} stroke={2} /></span>
                <b>Бонусные дни — вместе с оплатой</b>
                <span>Прибавятся к оплаченному сроку</span>
              </Glass>
            </div>
            <div className="scr-hint scr-hint--left"><Icon name="info" size={13} stroke={2} />Один промокод на аккаунт · код подставится на экране оплаты сам</div>
          </section>
        </div>
      </div>
    </Screen>
  )
}
