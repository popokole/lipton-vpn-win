import { useState, useEffect } from 'react'

function rub(kopeks) {
  const v = (kopeks || 0) / 100
  return v.toLocaleString('ru-RU', { maximumFractionDigits: v % 1 ? 2 : 0 }) + ' ₽'
}

function periodLabel(days) {
  if (days >= 360) return 'Год'
  if (days >= 180) return 'Полгода'
  if (days >= 90) return '3 месяца'
  if (days >= 28 && days <= 31) return 'Месяц'
  return days + ' дней'
}

export default function BillingPanel({ onClose }) {
  const [closing, setClosing] = useState(false)
  const [tariff, setTariff] = useState(null)
  const [periods, setPeriods] = useState([])
  const [sel, setSel] = useState(null)
  const [promo, setPromo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)

  useEffect(() => {
    window.api.accountConfig().then(r => {
      if (!r.success || !r.config?.tariffs?.length) { setErr('Не удалось загрузить тарифы'); return }
      // основной тариф — первый; периоды сортируем по длительности
      const t = r.config.tariffs[0]
      const ps = [...(t.periods || [])].sort((a, b) => a.days - b.days)
      setTariff(t)
      setPeriods(ps)
      // по умолчанию — самый выгодный (максимальный период)
      setSel(ps.length ? ps[ps.length - 1].id : null)
    }).catch(() => setErr('Не удалось загрузить тарифы'))
  }, [])

  function close() { setClosing(true); setTimeout(() => onClose(), 260) }

  // расчёт «в месяц» для подсветки выгоды
  const monthly = (p) => Math.round((p.price_kopeks / p.days) * 30)
  const baseMonthly = periods.length ? monthly(periods[0]) : 0

  const buy = async () => {
    if (!sel || busy) return
    setBusy(true); setErr('')
    const r = await window.api.paymentCheckout({
      tariffCode: tariff?.code, periodId: sel, promoCode: promo.trim() || undefined,
    })
    setBusy(false)
    if (r.success) { setOk(true) }
    else setErr(r.error || 'Не удалось создать платёж')
  }

  return (
    <div
      className={`settings-overlay${closing ? ' settings-overlay--closing' : ''}`}
      onClick={e => e.target === e.currentTarget && close()}
    >
      <div className={`settings-panel${closing ? ' settings-panel--closing' : ''}`}>
        <div className="settings-header">
          <span className="settings-title">Оформление подписки</span>
          <button className="settings-close" onClick={close}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1 1l8 8M9 1L1 9"/>
            </svg>
          </button>
        </div>

        <div className="settings-body">
          {err && <div className="acc-err">{err}</div>}

          {ok ? (
            <div className="bill-ok">
              <div className="bill-ok-ico">✓</div>
              <div className="bill-ok-title">Платёж создан</div>
              <div className="bill-ok-text">Открыли оплату в браузере. После оплаты подписка обновится автоматически — вернитесь и нажмите «Обновить».</div>
              <button className="acc-btn acc-btn--cta" onClick={() => window.api.accountSync().then(close)}>Обновить и закрыть</button>
            </div>
          ) : (
            <>
              <div className="settings-section">
                <span className="settings-section-title">Выберите срок — чем дольше, тем выгоднее</span>
                <div className="bill-periods">
                  {periods.map(p => {
                    const m = monthly(p)
                    const save = baseMonthly > 0 ? Math.round((1 - m / baseMonthly) * 100) : 0
                    return (
                      <button
                        key={p.id}
                        className={`bill-period${sel === p.id ? ' bill-period--on' : ''}`}
                        onClick={() => setSel(p.id)}
                      >
                        <div className="bill-period-top">
                          <span className="bill-period-name">{periodLabel(p.days)}</span>
                          {save > 0 && <span className="bill-period-save">−{save}%</span>}
                        </div>
                        <span className="bill-period-price">{rub(p.price_kopeks)}</span>
                        <span className="bill-period-per">{rub(m)}/мес</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="settings-section">
                <span className="settings-section-title">Промокод</span>
                <input
                  className="auth-input"
                  value={promo}
                  onChange={e => setPromo(e.target.value)}
                  placeholder="Если есть"
                  spellCheck={false}
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              <button className="acc-btn acc-btn--cta" onClick={buy} disabled={busy || !sel}>
                {busy ? 'Создаём платёж…' : 'Перейти к оплате'}
              </button>
              <div className="bill-note">Оплата картой РФ через ЮKassa. Откроется защищённая страница оплаты.</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
