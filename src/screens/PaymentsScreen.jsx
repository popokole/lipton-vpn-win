import { useEffect, useMemo, useState } from 'react'
import { Glass, Icon } from '../components/ui'
import Screen from './Screen'
import { rub } from '../lib/plan.mjs'
import { txGroups, txIcon, txMeta, txStatus, txSummary, txTitle } from '../lib/screens.mjs'

// История платежей (макет new-scr-payments): «Всего оплачено», счётчики,
// платежи по месяцам — тариф и срок, статус, дата и способ оплаты.
// Чек ЮKassa приходит на почту — отдельной колонки «Чек» нет.
export default function PaymentsScreen({ onBack }) {
  const [txs, setTxs] = useState(null)
  const [err, setErr] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    let alive = true
    window.api?.accountTransactions?.().then(r => {
      if (!alive) return
      if (r?.success) setTxs(r.transactions || [])
      else { setTxs([]); setErr(r?.error || 'Не удалось загрузить историю') }
    }).catch(() => { if (alive) { setTxs([]); setErr('Не удалось загрузить историю') } })
    window.api?.accountProfile?.().then(r => { if (alive && r?.success) setEmail(r.profile?.email || '') }).catch(() => {})
    return () => { alive = false }
  }, [])

  const sum = useMemo(() => txSummary(txs || []), [txs])
  const groups = useMemo(() => txGroups(txs || []), [txs])

  return (
    <Screen title="История платежей" onBack={onBack}>
      <Glass edge className="pay-sum ui-rise" style={{ '--i': 1 }}>
        <div className="pay-sum-head">
          <span className="pay-sum-label"><Icon name="receipt" size={14} stroke={2} />Всего оплачено</span>
          {sum.sinceLabel && <span className="pay-sum-since">{sum.sinceLabel}</span>}
        </div>
        <div className="pay-sum-value display">
          {(sum.paidKopeks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}<span>₽</span>
        </div>
        {sum.chips.length > 0 && (
          <div className="pay-sum-chips">
            {sum.counts.ok > 0 && <span className="scr-pill scr-pill--ok"><i />{sum.chips[0]}</span>}
            {sum.counts.refunds > 0 && <span className="scr-pill scr-pill--info"><i />{sum.chips.find(c => /возврат/.test(c))}</span>}
            {sum.counts.failed > 0 && <span className="scr-pill scr-pill--warn"><i />{sum.chips.find(c => /не прош/.test(c))}</span>}
          </div>
        )}
      </Glass>

      {txs === null && <div className="scr-loading"><span className="ui-spinner" aria-label="Загрузка" /></div>}
      {err && <div className="scr-error scr-error--block" role="alert">{err}</div>}
      {txs !== null && !txs.length && !err && (
        <div className="scr-empty scr-empty--big">
          <Icon name="receipt" size={26} stroke={1.6} />
          <span>Платежей пока нет — здесь появятся оплаты и продления.</span>
        </div>
      )}

      {groups.map((g, gi) => (
        <section key={g.key} className="set-section pay-group">
          <div className="set-overline-row"><span className="ui-overline">{g.label}</span></div>
          <Glass className="set-card ui-rise" style={{ '--i': Math.min(gi + 2, 6) }}>
            {g.items.map(t => {
              const st = txStatus(t.status)
              const failed = st.tone === 'warn'
              return (
                <div key={t.id} className="set-row pay-row">
                  <span className={`set-ico${failed ? ' set-ico--warn' : ''}`} aria-hidden="true"><Icon name={txIcon(t)} size={16} stroke={2} /></span>
                  <span className="set-row-text">
                    <span className="set-row-title">{txTitle(t)}</span>
                    <span className="pay-row-meta">
                      <span className={`scr-pill scr-pill--${st.tone}`}>{st.label}</span>
                      <span className="set-row-sub">{txMeta(t)}</span>
                    </span>
                  </span>
                  <span className={`pay-amount num${failed ? ' is-struck' : ''}`}>{rub(t.amount_kopeks)}</span>
                </div>
              )
            })}
          </Glass>
        </section>
      ))}

      {txs && txs.length > 0 && (
        <div className="scr-foot"><Icon name="mail" size={13} stroke={2} />Чеки приходят на почту{email ? <> — <b>{email}</b></> : ''}</div>
      )}
    </Screen>
  )
}
