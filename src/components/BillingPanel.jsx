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

// fireConfetti — лёгкое конфети без зависимостей (Web Animations API).
function fireConfetti() {
  const colors = ['#34F5A3', '#0FA968', '#5b9dff', '#f0b429', '#ff5b6a', '#ffffff']
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999;overflow:hidden'
  document.body.appendChild(box)
  for (let i = 0; i < 90; i++) {
    const p = document.createElement('div')
    const size = 6 + Math.random() * 8
    const rot = Math.random() * 360
    p.style.cssText = `position:absolute;top:-24px;left:${Math.random() * 100}%;width:${size}px;height:${size * 0.6}px;background:${colors[i % colors.length]};opacity:.95;border-radius:2px;transform:rotate(${rot}deg)`
    p.animate(
      [
        { transform: `translateY(-24px) rotate(${rot}deg)`, opacity: 1 },
        { transform: `translateY(105vh) rotate(${rot + 480}deg)`, opacity: 0.85 },
      ],
      { duration: 1900 + Math.random() * 1500, delay: Math.random() * 250, easing: 'cubic-bezier(.2,.6,.35,1)', fill: 'forwards' },
    )
    box.appendChild(p)
  }
  setTimeout(() => box.remove(), 3600)
}

export default function BillingPanel({ onClose }) {
  const [closing, setClosing] = useState(false)
  const [tariff, setTariff] = useState(null)
  const [periods, setPeriods] = useState([])
  const [sel, setSel] = useState(null)
  const [promo, setPromo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)       // платёж создан, оплата открыта в браузере
  const [txId, setTxId] = useState(null)    // id транзакции для опроса статуса
  const [paid, setPaid] = useState(false)   // оплата подтверждена
  const [payErr, setPayErr] = useState('')  // оплата не прошла

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
    if (!r.success) { setErr(r.error || 'Не удалось создать платёж'); return }
    if (r.status === 'succeeded') { onPaid(); return } // мгновенный успех (напр. зачётом)
    setTxId(r.transaction_id || null)
    setOk(true) // оплата открыта в браузере — дальше опрашиваем статус
  }

  const onPaid = () => {
    setPaid(true); setOk(true); setPayErr('')
    fireConfetti()
    window.api.accountSync() // подтянуть новую подписку в фоне
  }

  const retry = () => { setOk(false); setPaid(false); setPayErr(''); setTxId(null); setErr('') }

  // Опрос статуса платежа: пока оплата открыта в браузере — каждые 3с спрашиваем
  // сервер (он сам дёргает ЮKassa). Успех → конфети; отказ → ошибка + «оплатить снова».
  useEffect(() => {
    if (!ok || !txId || paid || payErr) return
    let stop = false
    const started = Date.now()
    const iv = setInterval(async () => {
      if (stop) return
      if (Date.now() - started > 300000) { clearInterval(iv); setPayErr('timeout'); return } // 5 мин
      const r = await window.api.paymentStatus(txId)
      if (stop || !r.success) return
      if (r.status === 'succeeded') { clearInterval(iv); onPaid() }
      else if (r.status === 'failed' || r.status === 'canceled') { clearInterval(iv); setPayErr(r.failure_reason || 'failed') }
    }, 3000)
    return () => { stop = true; clearInterval(iv) }
  }, [ok, txId, paid, payErr])

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

          {ok && paid ? (
            <div className="bill-ok">
              <div className="bill-ok-ico" style={{ fontSize: 44 }}>🎉</div>
              <div className="bill-ok-title">Оплата прошла!</div>
              <div className="bill-ok-text">Подписка активна. Можно подключаться.</div>
              <button className="acc-btn acc-btn--cta" onClick={() => window.api.accountSync().then(close)}>Отлично, закрыть</button>
            </div>
          ) : ok && payErr ? (
            <div className="bill-ok">
              <div className="bill-ok-ico" style={{ fontSize: 40 }}>❌</div>
              <div className="bill-ok-title">Оплата не прошла</div>
              <div className="bill-ok-text">
                {payErr === 'timeout'
                  ? 'Не дождались оплаты. Если вы оплатили — нажмите «Проверить ещё раз».'
                  : 'Платёж отклонён или отменён. Попробуйте оплатить снова — можно другой картой или по СБП.'}
              </div>
              <button className="acc-btn acc-btn--cta" onClick={retry}>Оплатить снова</button>
              {payErr === 'timeout' && txId && (
                <button className="acc-btn" style={{ marginTop: 8 }} onClick={() => { setPayErr(''); }}>
                  Проверить ещё раз
                </button>
              )}
            </div>
          ) : ok ? (
            <div className="bill-ok">
              <div className="bill-ok-ico" style={{ fontSize: 40 }}>⏳</div>
              <div className="bill-ok-title">Ожидаем оплату…</div>
              <div className="bill-ok-text">Открыли защищённую страницу оплаты в браузере. Завершите оплату — статус обновится здесь автоматически.</div>
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
