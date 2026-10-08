import { Icon, Button, Progress } from './ui'
import { daysWord, fmtMinSec } from '../lib/plan.mjs'

// Боковое меню 216 px: Главная / Серверы / Новости / Настройки,
// внизу карточка тарифа («Базовый · 24 дня · до 1 ноября · Продлить») и версия.

const NAV = [
  { page: 'home', label: 'Главная', icon: 'home' },
  { page: 'servers', label: 'Серверы', icon: 'globe' },
  { page: 'news', label: 'Новости', icon: 'bell' },
  { page: 'settings', label: 'Настройки', icon: 'settings' },
]

function PlanCard({ plan, onRenew, onLogin }) {
  if (!plan) return null

  if (plan.kind === 'guest') {
    return (
      <div className="plan-card">
        <div className="plan-card-head">
          <span className="plan-card-title"><Icon name="clock" size={14} stroke={2} /><span>Пробный доступ</span></span>
          <span className="plan-card-days">{fmtMinSec(plan.msLeft)}</span>
        </div>
        <div className="plan-card-sub">без аккаунта · на этом устройстве</div>
        <Progress value={plan.progress} label={`Осталось ${fmtMinSec(plan.msLeft)}`} />
        <Button size="sm" block onClick={onLogin}>Войти</Button>
      </div>
    )
  }

  if (plan.kind === 'none' || plan.kind === 'expired') {
    return (
      <div className="plan-card">
        <div className="plan-card-head">
          <span className="plan-card-title"><Icon name="crown" size={14} stroke={2} /><span>{plan.kind === 'expired' ? plan.title : 'Нет подписки'}</span></span>
          {plan.kind === 'expired' && <span className="plan-card-days">истекла</span>}
        </div>
        <div className="plan-card-sub">{plan.kind === 'expired' && plan.untilLabel ? plan.untilLabel.replace(/^до /, 'закончилась ') : 'оформите тариф'}</div>
        <Button size="sm" block onClick={onRenew}>{plan.kind === 'expired' ? 'Продлить' : 'Оформить'}</Button>
      </div>
    )
  }

  const days = `${plan.daysLeft} ${daysWord(plan.daysLeft)}`
  return (
    <div className="plan-card">
      <div className="plan-card-head">
        <span className="plan-card-title"><Icon name="crown" size={14} stroke={2} /><span>{plan.title}</span></span>
        <span className="plan-card-days">{days}</span>
      </div>
      <div className="plan-card-sub">{plan.kind === 'trial' ? `пробный период · ${plan.untilLabel}` : plan.untilLabel}</div>
      <Progress value={plan.progress} label={`Осталось ${days}`} />
      <Button size="sm" block onClick={onRenew}>Продлить</Button>
    </div>
  )
}

export default function Sidebar({ page, onNavigate, badges = {}, plan, version, onRenew, onLogin }) {
  return (
    <aside className="sidebar">
      <nav className="side-nav" aria-label="Разделы">
        {NAV.map(item => (
          <button
            key={item.page}
            type="button"
            className="side-nav-btn"
            aria-current={page === item.page ? 'page' : undefined}
            onClick={() => onNavigate(item.page)}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
            {badges[item.page] > 0 && <span className="ui-badge" aria-label={`Непрочитанных: ${badges[item.page]}`}>{badges[item.page]}</span>}
          </button>
        ))}
      </nav>

      <div className="side-bottom">
        <PlanCard plan={plan} onRenew={onRenew} onLogin={onLogin} />
        <div className="side-version">{version ? `v${version}` : ''}</div>
      </div>
    </aside>
  )
}
