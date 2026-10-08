import { Glass, Icon, Button } from './ui'

// Слот баннера над контентом главной: баннеры из админки (GET /app/banners —
// таргетинг по платформе, версии и аудитории), необязательное «Обновите
// приложение». Пустой список — слот не занимает места.
// banners: [{ id, tone?: 'info'|'warn'|'ok', icon?, title, text?, action?: { label, onClick }, onClose? }]
export default function BannerSlot({ banners = [] }) {
  if (!banners.length) return null
  return (
    <div className="banner-slot">
      {banners.map(b => (
        <Glass key={b.id} variant="card" edge className={`banner banner--${b.tone || 'info'}`}>
          <span className="banner-ico" aria-hidden="true"><Icon name={b.icon || 'bell'} size={16} stroke={2} /></span>
          <div className="banner-body">
            <div className="banner-title">{b.title}</div>
            {b.text && <div className="banner-text">{b.text}</div>}
          </div>
          {b.action && <Button size="sm" variant="primary" onClick={b.action.onClick}>{b.action.label}</Button>}
          {b.onClose && (
            <button type="button" className="ui-icon-btn" aria-label="Скрыть" onClick={b.onClose}>
              <Icon name="close" size={14} />
            </button>
          )}
        </Glass>
      ))}
    </div>
  )
}
