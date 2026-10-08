import { Glass, Icon, Button } from './ui'

// Уведомления в правом нижнем углу области контента: тосты, «Обновление
// готово», Kill Switch, «Подписка заканчивается».
// items: [{ id, tone: 'ok'|'warn'|'error'|'info', icon, title, sub?, action?: { label, onClick }, onClose? }]
export default function Notices({ items = [] }) {
  if (!items.length) return null
  return (
    <div className="notices" aria-live="polite">
      {items.map(n => (
        <Glass key={n.id} variant="card" className={`notice notice--${n.tone || 'info'}`} role={n.tone === 'error' ? 'alert' : 'status'}>
          <span className="notice-ico" aria-hidden="true"><Icon name={n.icon || 'alert'} size={16} stroke={2} /></span>
          <div className="notice-body">
            <div className="notice-title">{n.title}</div>
            {n.sub && <div className="notice-sub">{n.sub}</div>}
          </div>
          {n.action && <Button size="sm" variant="primary" onClick={n.action.onClick}>{n.action.label}</Button>}
          {n.onClose && (
            <button type="button" className="ui-icon-btn" aria-label="Закрыть" onClick={n.onClose}>
              <Icon name="close" size={14} />
            </button>
          )}
        </Glass>
      ))}
    </div>
  )
}
