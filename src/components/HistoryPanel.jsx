import { useState, useEffect } from 'react'

function rub(kopeks) {
  const v = (kopeks || 0) / 100
  return v.toLocaleString('ru-RU', { maximumFractionDigits: v % 1 ? 2 : 0 }) + ' ₽'
}
// Дата + время платежа (в истории теперь видно и время).
function fmtDateTime(s) {
  if (!s) return { date: '', time: '' }
  try {
    const d = new Date(s)
    return {
      date: d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    }
  } catch { return { date: '', time: '' } }
}

const TX_KIND = {
  payment: 'Оплата', topup: 'Пополнение', charge: 'Списание',
  subscription: 'Подписка', renew: 'Продление', refund: 'Возврат', bonus: 'Бонус', referral: 'Реферал',
}
const TX_STATUS = {
  succeeded: ['Проведён', 'ok'], success: ['Проведён', 'ok'],
  pending: ['В обработке', 'warn'], canceled: ['Отменён', 'err'], failed: ['Ошибка', 'err'],
}

export default function HistoryPanel({ onClose }) {
  const [closing, setClosing] = useState(false)
  const [txs, setTxs] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    window.api.accountTransactions().then(r => {
      if (r.success) setTxs(r.transactions || [])
      else { setTxs([]); setErr(r.error || 'Не удалось загрузить историю') }
    }).catch(() => { setTxs([]); setErr('Не удалось загрузить историю') })
  }, [])

  function close() { setClosing(true); setTimeout(() => onClose(), 260) }

  return (
    <div
      className={`settings-overlay${closing ? ' settings-overlay--closing' : ''}`}
      onClick={e => e.target === e.currentTarget && close()}
    >
      <div className={`settings-panel${closing ? ' settings-panel--closing' : ''}`}>
        <div className="settings-header">
          <span className="settings-title">История платежей</span>
          <button className="settings-close" onClick={close}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1 1l8 8M9 1L1 9"/>
            </svg>
          </button>
        </div>

        <div className="settings-body">
          {err && <div className="acc-err">{err}</div>}
          {txs === null ? (
            <div className="acc-empty">Загрузка…</div>
          ) : txs.length === 0 ? (
            <div className="acc-empty" style={{ textAlign: 'center', padding: 24 }}>Платежей пока нет</div>
          ) : (
            <div className="acc-tx-list">
              {txs.map(t => {
                const [lbl, tone] = TX_STATUS[t.status] || [t.status, 'warn']
                const { date, time } = fmtDateTime(t.created_at)
                return (
                  <div key={t.id} className="acc-tx">
                    <div className="acc-tx-main">
                      <span className="acc-tx-kind">{TX_KIND[t.kind] || t.kind}</span>
                      <span className="acc-tx-date">{date}{time ? ` · ${time}` : ''}</span>
                    </div>
                    <div className="acc-tx-right">
                      <span className="acc-tx-amount">{rub(t.amount_kopeks)}</span>
                      <span className={`acc-tx-status acc-tx-status--${tone}`}>{lbl}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
