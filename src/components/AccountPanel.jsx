import { useState, useEffect } from 'react'

const SITE = 'https://site.popokole.online'

function rub(kopeks) {
  const v = (kopeks || 0) / 100
  return v.toLocaleString('ru-RU', { maximumFractionDigits: v % 1 ? 2 : 0 }) + ' ₽'
}
function fmtDate(s) {
  if (!s) return ''
  try { return new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return '' }
}

const SUB_LABEL = {
  active: 'Активна', trial: 'Пробная', grace: 'Льготный период',
  expiring: 'Истекает', expired: 'Истекла', inactive: 'Нет подписки',
}
const TX_KIND = {
  payment: 'Оплата', topup: 'Пополнение', charge: 'Списание',
  subscription: 'Подписка', refund: 'Возврат', bonus: 'Бонус', referral: 'Реферал',
}
const TX_STATUS = {
  succeeded: ['Проведён', 'ok'], success: ['Проведён', 'ok'],
  pending: ['В обработке', 'warn'], canceled: ['Отменён', 'err'],
  failed: ['Ошибка', 'err'],
}

export default function AccountPanel({ onClose, onLogout, onSupport, onBilling, onHistory, onNews }) {
  const [closing, setClosing] = useState(false)
  const [profile, setProfile] = useState(null)
  const [view, setView] = useState(null)
  const [txs, setTxs] = useState(null)
  const [busyCard, setBusyCard] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    const [p, s, t] = await Promise.all([
      window.api.accountProfile(),
      window.api.accountSync(),
      window.api.accountTransactions(),
    ])
    if (p.success) setProfile(p.profile)
    if (s.success) setView(s.view || null)
    if (t.success) setTxs(t.transactions || [])
    else setTxs([])
    if (!p.success) setErr(p.error || 'Не удалось загрузить профиль')
  }
  useEffect(() => { load() }, [])

  function close() { setClosing(true); setTimeout(() => onClose(), 260) }

  const removeCard = async () => {
    setBusyCard(true)
    const r = await window.api.accountDeleteCard()
    setBusyCard(false)
    if (r.success) { setProfile(p => ({ ...p, has_card: false, card_last4: null, auto_renew: false })) }
    else setErr(r.error || 'Не удалось отвязать карту')
  }

  const subStatus = view?.status || 'inactive'

  return (
    <div
      className={`settings-overlay${closing ? ' settings-overlay--closing' : ''}`}
      onClick={e => e.target === e.currentTarget && close()}
    >
      <div className={`settings-panel${closing ? ' settings-panel--closing' : ''}`}>
        <div className="settings-header">
          <span className="settings-title">Личный кабинет</span>
          <button className="settings-close" onClick={close}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1 1l8 8M9 1L1 9"/>
            </svg>
          </button>
        </div>

        <div className="settings-body">
          {err && <div className="acc-err">{err}</div>}

          {/* Профиль */}
          <div className="settings-section">
            <span className="settings-section-title">Профиль</span>
            <div className="acc-row">
              <span className="acc-k">Почта</span>
              <span className="acc-v">{profile?.email || '—'}</span>
            </div>
            <div className="acc-row">
              <span className="acc-k">Telegram</span>
              <span className="acc-v">{profile?.telegram_linked ? 'привязан' : '—'}</span>
            </div>
            {profile?.created_at && (
              <div className="acc-row">
                <span className="acc-k">С нами с</span>
                <span className="acc-v">{fmtDate(profile.created_at)}</span>
              </div>
            )}
          </div>

          {/* Подписка */}
          <div className="settings-section">
            <span className="settings-section-title">Подписка</span>
            <div className="acc-row">
              <span className="acc-k">Статус</span>
              <span className={`acc-badge acc-badge--${subStatus === 'active' || subStatus === 'trial' ? 'ok' : subStatus === 'expired' || subStatus === 'inactive' ? 'err' : 'warn'}`}>
                {SUB_LABEL[subStatus] || subStatus}
              </span>
            </div>
            {view?.current_period_end && (
              <div className="acc-row">
                <span className="acc-k">Действует до</span>
                <span className="acc-v">{fmtDate(view.current_period_end)}</span>
              </div>
            )}
            <button className="acc-btn acc-btn--cta" onClick={onBilling || (() => window.api.openExternal(`${SITE}/app/billing`))}>
              {subStatus === 'active' || subStatus === 'trial' ? 'Продлить подписку' : 'Оформить подписку'}
            </button>
          </div>

          {/* Оплата / карта */}
          <div className="settings-section">
            <span className="settings-section-title">Оплата</span>
            {profile?.has_card ? (
              <>
                <div className="acc-row">
                  <span className="acc-k">Карта</span>
                  <span className="acc-v">•••• {profile.card_last4 || '••••'}</span>
                </div>
                <div className="acc-row">
                  <span className="acc-k">Автоплатёж</span>
                  <span className="acc-v">{profile.auto_renew ? 'включён' : 'выключен'}</span>
                </div>
                <button className="acc-btn acc-btn--danger" onClick={removeCard} disabled={busyCard}>
                  {busyCard ? 'Отвязываем…' : 'Отвязать карту'}
                </button>
              </>
            ) : (
              <div className="acc-empty">Карта не привязана</div>
            )}
          </div>

          {/* История платежей — отдельным окном (с датой и временем) */}
          <div className="settings-section">
            <span className="settings-section-title">Платежи</span>
            <button className="acc-link-row" onClick={onHistory || (() => {})}>
              <span>🧾 История платежей{txs && txs.length ? ` (${txs.length})` : ''}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          {/* Статьи и гайды */}
          <div className="settings-section">
            <span className="settings-section-title">Полезное</span>
            {onNews && (
              <button className="acc-link-row" onClick={onNews}>
                <span>📰 Новости</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}
            {onSupport && (
              <button className="acc-link-row" onClick={onSupport}>
                <span>💬 Чат с поддержкой</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}
            <button className="acc-link-row" onClick={() => window.api.openArticles()}>
              <span>📖 Статьи и гайды</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button className="acc-link-row" onClick={() => window.api.openExternal(`${SITE}/app`)}>
              <span>Открыть кабинет на сайте</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          {/* Выход */}
          {onLogout && (
            <div className="settings-section">
              <button className="settings-logout-btn" onClick={() => { close(); onLogout() }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Выйти из аккаунта
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
