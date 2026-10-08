import { useEffect, useRef, useState } from 'react'
import { Button, ConfirmDialog, Glass, Icon } from '../components/ui'
import Screen from './Screen'
import { rub, daysWord, fmtDayMonth } from '../lib/plan.mjs'
import { cardView, inDaysLabel, unlinkText, whenLabel } from '../lib/screens.mjs'

// Способ оплаты (макеты new-combo-payment-method / -unlink, под ПК): карта,
// автопродление и ближайшее списание, «Отвязать карту». Переключателя
// автопродления нет — только отвязка. После новой привязки сервер 24 ч
// отвечает 409 card_unlink_cooldown — показываем, когда снова можно.
export default function PaymentMethodScreen({ onBack, onToast, onPay, plan }) {
  const [profile, setProfile] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cooldownAt, setCooldownAt] = useState(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const load = () => window.api?.accountProfile?.().then(r => {
    if (!alive.current) return
    if (r?.success) setProfile(r.profile || null)
    setLoaded(true)
  }).catch(() => { if (alive.current) setLoaded(true) })
  useEffect(() => { load() }, [])

  const card = cardView(profile)
  const blockedUntil = cooldownAt || card?.unlinkAt || null
  const untilLabel = plan?.untilLabel || ''

  const unlink = async () => {
    setBusy(true); setErr('')
    const r = await window.api.accountDeleteCard().catch(x => ({ success: false, error: x?.message }))
    if (!alive.current) return
    setBusy(false)
    if (r?.success) {
      setDialog(false)
      onToast?.('Карта отвязана — автопродление выключено')
      setProfile(p => (p ? { ...p, has_card: false, card_last4: null, auto_renew: false } : p))
      load()
      return
    }
    if (r?.code === 'card_unlink_cooldown' || r?.httpStatus === 409) {
      const at = r.availableAt ? new Date(r.availableAt).getTime() : null
      setCooldownAt(at)
      setErr(at ? `Карту привязали недавно — отвязать её можно будет ${whenLabel(at)}.` : (r.error || 'Карту привязали недавно — отвязать её можно через 24 часа после привязки.'))
      return
    }
    setErr(r?.error || 'Не удалось отвязать карту')
  }

  return (
    <Screen title="Способ оплаты" onBack={onBack}>
      {!loaded && <div className="scr-loading"><span className="ui-spinner" aria-label="Загрузка" /></div>}

      {loaded && !card && (
        <div className="cols-2 scr-cols">
          <div className="col">
            <Glass className="pm-empty ui-rise" style={{ '--i': 1 }}>
              <span className="pm-empty-ico" aria-hidden="true"><Icon name="card" size={22} stroke={1.8} /></span>
              <b>Карта не привязана</b>
              <span>Карта или СБП сохранятся при следующей оплате — тогда подписка будет продлеваться сама. Отвязать можно в любой момент.</span>
              {onPay && <Button variant="primary" onClick={onPay} icon={<Icon name="crown" size={15} stroke={2} />}>Оплатить подписку</Button>}
            </Glass>
          </div>
          <div className="col">
            <div className="scr-note ui-rise" style={{ '--i': 2 }}>
              <Icon name="shieldCheck" size={15} stroke={2} />
              <span>Платежи проходят через ЮKassa — данные карты у нас не хранятся.</span>
            </div>
          </div>
        </div>
      )}

      {card && (
        <div className="cols-2 scr-cols">
          <div className="col">
            <div className="pm-card ui-rise" style={{ '--i': 1 }}>
              <div className="pm-card-top">
                <span className="pm-chip" aria-hidden="true" />
                <Icon name="contactless" size={20} stroke={1.8} />
              </div>
              <div className="pm-card-num num">•••• {card.last4}</div>
              <div className="pm-card-bottom">
                <span>{card.exp ? `действует до ${card.exp}` : 'карта для автопродления'}</span>
                {card.brand && <b className="pm-brand">{card.brand}</b>}
              </div>
            </div>

            <Glass className="scr-card pm-renew ui-rise" style={{ '--i': 2 }}>
              <div className="pm-renew-head">
                <span className="pm-renew-title"><Icon name="refresh" size={14} stroke={2} />Автопродление</span>
                <span className={`scr-pill scr-pill--${card.autoRenew ? 'ok' : 'muted'}`}><i />{card.autoRenew ? 'Включено' : 'Выключено'}</span>
              </div>
              {card.next ? (
                <>
                  <div className="pm-renew-label">Следующее списание</div>
                  <div className="pm-renew-row">
                    <span className="pm-renew-sum num">{fmtDayMonth(card.next.at)}{card.next.kopeks != null ? ` — ${rub(card.next.kopeks)}` : ''}</span>
                    <span className="pm-renew-in">{inDaysLabel(card.next.at)}</span>
                  </div>
                  {(card.next.title || card.next.days) && (
                    <div className="pm-renew-tariff">{[card.next.title, card.next.days ? `${card.next.days} ${daysWord(card.next.days)}` : ''].filter(Boolean).join(' · ')}</div>
                  )}
                </>
              ) : (
                <div className="pm-renew-label">Списаний не запланировано</div>
              )}
            </Glass>
          </div>

          <div className="col">
            <Glass className="set-card ui-rise" style={{ '--i': 2 }}>
              <div className="set-row">
                <span className="set-ico" aria-hidden="true"><Icon name="receipt" size={16} stroke={2} /></span>
                <span className="set-row-text">
                  <span className="set-row-title">Чек приходит на почту</span>
                  <span className="set-row-sub">{profile?.email || 'почта не привязана'}</span>
                </span>
              </div>
              <div className="set-row">
                <span className="set-ico" aria-hidden="true"><Icon name="shieldCheck" size={16} stroke={2} /></span>
                <span className="set-row-text">
                  <span className="set-row-title">Платежи через ЮKassa</span>
                  <span className="set-row-sub">Данные карты у нас не хранятся</span>
                </span>
              </div>
            </Glass>

            {err && !dialog && <div className="scr-error scr-error--block" role="alert">{err}</div>}

            <button type="button" className="pm-unlink ui-rise" style={{ '--i': 3 }} onClick={() => { setErr(''); setDialog(true) }}>
              <Icon name="unlink" size={16} stroke={2} />
              <span>Отвязать карту</span>
            </button>
            {blockedUntil && blockedUntil > Date.now() && (
              <div className="scr-hint scr-hint--left"><Icon name="clock" size={13} stroke={2} />Карту привязали недавно — отвязать можно {whenLabel(blockedUntil)}</div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={dialog}
        icon="warning"
        tone="warn"
        title="Отвязать карту?"
        confirmLabel="Отвязать"
        cancelLabel="Оставить карту"
        busy={busy}
        error={err}
        onConfirm={unlink}
        onCancel={() => { if (!busy) setDialog(false) }}
      >
        <p>{unlinkText(card, untilLabel)}</p>
        <p className="pm-dialog-note"><Icon name="clock" size={13} stroke={2} />Отвязать карту снова получится только через 24 часа после новой привязки.</p>
      </ConfirmDialog>
    </Screen>
  )
}
