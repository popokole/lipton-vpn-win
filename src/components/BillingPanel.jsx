import { useState, useEffect, useRef } from 'react'

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

function fmtDate(s) {
  if (!s) return ''
  try { return new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return '' }
}

// newKey — UUID на одну попытку смены тарифа (idempotency_key): повтор запроса
// с тем же ключом сервер не спишет второй раз.
function newKey() {
  try { if (window.crypto?.randomUUID) return window.crypto.randomUUID() } catch {}
  const b = window.crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const optKey = (o) => `${o.tariff_id}:${o.period_days}`
const isOverlay = (o) => o?.mode === 'overlay'

// Подпись кнопки подтверждения смены: что именно произойдёт с деньгами.
function confirmLabel(o) {
  if (!o) return 'Сменить тариф'
  if (!o.surcharge_kopeks) return 'Сменить без доплаты'
  const sum = rub(o.surcharge_kopeks)
  if (o.will_charge_card && o.card_last4) return `Списать ${sum} с карты •••• ${o.card_last4}`
  if (o.will_charge_card) return `Оплатить ${sum} по СБП`
  return `Оплатить ${sum}`
}

// OverlayNote — действующий «временный тариф»: что сейчас и к чему вернёмся.
function OverlayNote({ overlay }) {
  if (!overlay) return null
  return (
    <div className="bill-info">
      Сейчас действует «{overlay.tariff_title}» до {fmtDate(overlay.until)}.
      {overlay.revert_tariff_title && <> Потом снова «{overlay.revert_tariff_title}».</>}
    </div>
  )
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

  // ─── Смена тарифа ───
  const [view, setView] = useState(null)          // /me/subscription
  const [mode, setMode] = useState('buy')         // buy = продлить/купить, change = сменить тариф
  const [chg, setChg] = useState(null)            // ответ /me/subscription/change/options
  const [chgSel, setChgSel] = useState(null)      // ключ выбранного варианта
  const [preview, setPreview] = useState(null)    // вариант, пересчитанный на текущий момент
  const [previewBusy, setPreviewBusy] = useState(false)
  const [chgBusy, setChgBusy] = useState(false)
  const [chgErr, setChgErr] = useState('')
  const [chgNote, setChgNote] = useState('')      // подсказка (напр. после 409 от checkout)
  const [flow, setFlow] = useState('buy')         // что сейчас ждём: buy | change
  const [waitKind, setWaitKind] = useState('browser') // browser = страница оплаты, charge = списание с привязанного способа
  const [changed, setChanged] = useState(null)    // { option, new_period_end } — для экрана успеха
  const idemKey = useRef(null)
  const previewSeq = useRef(0)

  const canChange = view?.status === 'active' || view?.status === 'grace'

  const loadOptions = async () => {
    setChg(null)
    const r = await window.api.tariffChangeOptions()
    if (!r.success) { setChg({ available: false, reason: r.error || 'Не удалось загрузить варианты', options: [] }); return }
    setChg(r)
  }

  useEffect(() => {
    Promise.all([
      window.api.accountConfig(),
      window.api.accountSubscriptionView(),
    ]).then(([r, s]) => {
      const v = s?.success ? s.view : null
      setView(v)
      if (v?.status === 'active' || v?.status === 'grace') loadOptions()
      if (!r.success || !r.config?.tariffs?.length) { setErr('Не удалось загрузить тарифы'); return }
      // продлеваем текущий тариф подписки; если его нет в списке — основной (первый)
      const t = r.config.tariffs.find(x => v?.tariff_code && x.code === v.tariff_code) || r.config.tariffs[0]
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

  const openChange = (note = '') => {
    setMode('change'); setChgNote(note); setErr('')
    if (!chg) loadOptions()
  }

  const buy = async () => {
    if (!sel || busy) return
    setBusy(true); setErr('')
    const r = await window.api.paymentCheckout({
      tariffCode: tariff?.code, periodId: sel, promoCode: promo.trim() || undefined,
    })
    setBusy(false)
    if (!r.success) {
      // другой тариф при активной подписке покупается только через смену тарифа
      if (r.httpStatus === 409 && /смен[уы] тарифа/i.test(r.error || '')) { openChange(r.error); return }
      setErr(r.error || 'Не удалось создать платёж'); return
    }
    setFlow('buy'); setWaitKind('browser')
    if (r.status === 'succeeded') { onPaid(); return } // мгновенный успех (напр. зачётом)
    setTxId(r.transaction_id || null)
    setOk(true) // оплата открыта в браузере — дальше опрашиваем статус
  }

  // Выбор варианта смены → сразу предпросмотр (пересчёт на текущий момент).
  const pickOption = async (o) => {
    setChgSel(optKey(o)); setPreview(null); setChgErr('')
    idemKey.current = newKey() // новый выбор — новая попытка
    const seq = ++previewSeq.current
    setPreviewBusy(true)
    const r = await window.api.tariffChangePreview({ tariffId: o.tariff_id, periodDays: o.period_days })
    if (seq !== previewSeq.current) return // пользователь уже выбрал другой вариант
    setPreviewBusy(false)
    if (!r.success) { setChgErr(r.error || 'Не удалось рассчитать смену тарифа'); return }
    setPreview(r.option)
  }

  const confirmChange = async () => {
    if (!preview || chgBusy) return
    if (!idemKey.current) idemKey.current = newKey()
    setChgBusy(true); setChgErr('')
    const r = await window.api.tariffChange({
      tariffId: preview.tariff_id,
      periodDays: preview.period_days,
      idempotencyKey: idemKey.current,
      expectedSurchargeKopeks: preview.surcharge_kopeks,
    })
    setChgBusy(false)
    if (!r.success) { setChgErr(r.error || 'Не удалось сменить тариф'); return }
    setFlow('change')
    setChanged({ option: preview, new_period_end: r.new_period_end || preview.new_period_end })
    switch (r.status) {
      case 'changed':
        onPaid(); return
      case 'charged':
      case 'pending':
        setWaitKind('charge')
        if (r.transaction_id) { setTxId(r.transaction_id); setOk(true); return }
        if (r.status === 'charged') { onPaid(); return }
        setChgErr('Списание в обработке — загляните сюда через минуту'); return
      case 'payment_required':
        setWaitKind('browser')
        setTxId(r.transaction_id || null); setOk(true); return
      case 'failed':
        setChgErr('Банк отклонил оплату. Попробуйте ещё раз или другим способом.'); return
      default:
        setChgErr('Не удалось сменить тариф, попробуйте позже')
    }
  }

  const onPaid = () => {
    setPaid(true); setOk(true); setPayErr('')
    fireConfetti()
    window.api.accountSync() // подтянуть новую подписку в фоне
  }

  const retry = () => {
    setOk(false); setPaid(false); setPayErr(''); setTxId(null); setErr('')
    if (flow === 'change') {
      // новая попытка оплаты — новый ключ и свежий расчёт
      setChgErr('')
      const o = chg?.options?.find(x => optKey(x) === chgSel)
      if (o) pickOption(o)
    }
  }

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

  const chOpt = changed?.option

  return (
    <div
      className={`settings-overlay${closing ? ' settings-overlay--closing' : ''}`}
      onClick={e => e.target === e.currentTarget && close()}
    >
      <div className={`settings-panel${closing ? ' settings-panel--closing' : ''}`}>
        <div className="settings-header">
          <span className="settings-title">{mode === 'change' ? 'Смена тарифа' : 'Оформление подписки'}</span>
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
              {flow === 'change' ? (
                <>
                  <div className="bill-ok-title">Тариф изменён!</div>
                  <div className="bill-ok-text">
                    {isOverlay(chOpt)
                      ? <>«{chOpt.tariff_title}» действует до {fmtDate(chOpt.overlay_until)}. Потом снова «{chOpt.revert_tariff_title}» до {fmtDate(changed.new_period_end)}.</>
                      : <>Теперь у вас «{chOpt?.tariff_title}» до {fmtDate(changed?.new_period_end)}. Можно подключаться.</>}
                  </div>
                </>
              ) : (
                <>
                  <div className="bill-ok-title">Оплата прошла!</div>
                  <div className="bill-ok-text">Подписка активна. Можно подключаться.</div>
                </>
              )}
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
              {waitKind === 'charge' ? (
                <>
                  <div className="bill-ok-title">Проводим оплату…</div>
                  <div className="bill-ok-text">Списываем деньги с привязанного способа оплаты. Обычно это несколько секунд.</div>
                </>
              ) : (
                <>
                  <div className="bill-ok-title">Ожидаем оплату…</div>
                  <div className="bill-ok-text">Открыли защищённую страницу оплаты в браузере. Завершите оплату — статус обновится здесь автоматически.</div>
                </>
              )}
            </div>
          ) : (
            <>
              {canChange && (
                <div className="auth-tabs">
                  <button className={`auth-tab${mode === 'buy' ? ' auth-tab--on' : ''}`} onClick={() => setMode('buy')}>Продлить</button>
                  <button className={`auth-tab${mode === 'change' ? ' auth-tab--on' : ''}`} onClick={() => openChange()}>Сменить тариф</button>
                </div>
              )}

              {mode === 'change' ? (
                <ChangeBlock
                  view={view}
                  chg={chg}
                  note={chgNote}
                  sel={chgSel}
                  preview={preview}
                  previewBusy={previewBusy}
                  busy={chgBusy}
                  err={chgErr}
                  onPick={pickOption}
                  onConfirm={confirmChange}
                />
              ) : (
                <>
                  <OverlayNote overlay={view?.overlay} />

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
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ChangeBlock — варианты смены тарифа, предпросмотр выбранного и подтверждение.
function ChangeBlock({ view, chg, note, sel, preview, previewBusy, busy, err, onPick, onConfirm }) {
  if (!chg) return <div className="acc-empty">Загружаем варианты…</div>

  const current = chg.current
  return (
    <>
      {/* при недоступной смене сервер сам пишет причину (в т.ч. про действующий overlay) */}
      {chg.available && <OverlayNote overlay={view?.overlay} />}
      {note && <div className="bill-info">{note}</div>}

      {current && (
        <div className="settings-section">
          <span className="settings-section-title">Сейчас</span>
          <div className="acc-row">
            <span className="acc-k">Тариф</span>
            <span className="acc-v">«{current.tariff_title}» · {periodLabel(current.period_days)}</span>
          </div>
          {current.period_end && (
            <div className="acc-row">
              <span className="acc-k">Действует до</span>
              <span className="acc-v">{fmtDate(current.period_end)}</span>
            </div>
          )}
        </div>
      )}

      {!chg.available ? (
        <div className="acc-empty">{chg.reason || 'Смена тарифа сейчас недоступна'}</div>
      ) : !chg.options?.length ? (
        <div className="acc-empty">Перейти пока не на что — у вас уже самый полный вариант.</div>
      ) : (
        <div className="settings-section">
          <span className="settings-section-title">Выберите новый тариф</span>
          <div className="bill-periods">
            {chg.options.map(o => (
              <ChangeOptionCard key={optKey(o)} o={o} on={sel === optKey(o)} onClick={() => onPick(o)} />
            ))}
          </div>
        </div>
      )}

      {chg.available && sel && (previewBusy || preview) && (
        <div className="settings-section">
          <span className="settings-section-title">Проверьте перед подтверждением</span>
          {previewBusy ? (
            <div className="acc-empty">Считаем…</div>
          ) : (
            <>
              <PreviewRows o={preview} discountPercent={chg.discount_percent} />
              <button className="acc-btn acc-btn--cta" onClick={onConfirm} disabled={busy}>
                {busy ? 'Подождите…' : confirmLabel(preview)}
              </button>
              {preview.surcharge_kopeks > 0 && !preview.will_charge_card && (
                <div className="bill-note">Откроется защищённая страница оплаты ЮKassa — картой или по СБП.</div>
              )}
            </>
          )}
        </div>
      )}

      {err && <div className="acc-err" style={{ marginTop: 10 }}>{err}</div>}
    </>
  )
}

function ChangeOptionCard({ o, on, onClick }) {
  const overlay = isOverlay(o)
  return (
    <button className={`bill-period${on ? ' bill-period--on' : ''}`} onClick={onClick}>
      <div className="bill-period-top">
        <span className="bill-period-name">«{o.tariff_title}» · {periodLabel(o.period_days)}</span>
        {overlay && <span className="bill-tag">временно</span>}
      </div>
      {overlay ? (
        <>
          <span className="bill-period-price">
            {rub(o.price_kopeks)}{o.revert_tariff_title && <span className="bill-period-then">, потом снова «{o.revert_tariff_title}»</span>}
          </span>
          <span className="bill-period-per">
            «{o.tariff_title}» до {fmtDate(o.overlay_until)}, затем «{o.revert_tariff_title}» до {fmtDate(o.new_period_end)}
          </span>
        </>
      ) : (
        <>
          <span className="bill-period-price">
            {o.surcharge_kopeks > 0 ? `доплата ${rub(o.surcharge_kopeks)}` : 'без доплаты'}
          </span>
          {o.discount_kopeks > 0 && <span className="bill-period-per bill-good">скидка 10% — −{rub(o.discount_kopeks)}</span>}
          {o.extra_days > 0 && <span className="bill-period-per bill-good">+{o.extra_days} дн. перенесено</span>}
          <span className="bill-period-per">новая дата — {fmtDate(o.new_period_end)}</span>
        </>
      )}
    </button>
  )
}

function PreviewRows({ o, discountPercent }) {
  const row = (k, v, good = false) => (
    <div className="acc-row">
      <span className="acc-k">{k}</span>
      <span className={`acc-v${good ? ' bill-good' : ''}`}>{v}</span>
    </div>
  )
  if (isOverlay(o)) {
    return (
      <>
        {row('Тариф', `«${o.tariff_title}» · ${periodLabel(o.period_days)}`)}
        {row('К оплате', rub(o.surcharge_kopeks))}
        {row(`«${o.tariff_title}» до`, fmtDate(o.overlay_until))}
        {row(`Потом снова «${o.revert_tariff_title}» до`, fmtDate(o.new_period_end))}
        <div className="bill-note bill-note--left">
          Оставшиеся дни тарифа «{o.revert_tariff_title}» не пропадут: они начнутся, когда закончится «{o.tariff_title}».
        </div>
      </>
    )
  }
  return (
    <>
      {row('Тариф', `«${o.tariff_title}» · ${periodLabel(o.period_days)}`)}
      {row('Цена срока', rub(o.price_kopeks))}
      {o.credit_kopeks > 0 && row('Зачёт остатка', `−${rub(o.credit_kopeks)}`, true)}
      {o.discount_kopeks > 0 && row(`Скидка ${discountPercent || 10}% на доплату`, `−${rub(o.discount_kopeks)}`, true)}
      {row('К доплате', o.surcharge_kopeks > 0 ? rub(o.surcharge_kopeks) : 'без доплаты')}
      {o.extra_days > 0 && row('Перенесено днями', `+${o.extra_days} дн.`, true)}
      {row('Действует до', fmtDate(o.new_period_end))}
      <div className="bill-note bill-note--left">
        Дальше продление — {rub(o.price_kopeks)} за {periodLabel(o.period_days).toLowerCase()}.
      </div>
    </>
  )
}
