import { Tab } from './ui/Pressables'
import { Icon } from './ui'

// Компактное окно (уже 760 px, макет new-combo-win-on): нижние вкладки вместо
// бокового меню. Показываются только в узком окне (см. shell.css).
const TABS = [
  { page: 'home', label: 'Главная', icon: 'home' },
  { page: 'servers', label: 'Серверы', icon: 'globe' },
  { page: 'news', label: 'Новости', icon: 'bell' },
  { page: 'settings', label: 'Профиль', icon: 'user' },
]

export default function BottomTabs({ page, onNavigate, badges = {} }) {
  return (
    <nav className="bottom-tabs" aria-label="Разделы">
      {TABS.map(t => (
        <Tab variant="bottom"
          key={t.page}
          aria-current={page === t.page ? 'page' : undefined}
          onClick={() => onNavigate(t.page)}
        >
          <span className="bottom-tab-ico">
            <Icon name={t.icon} size={18} stroke={1.9} />
            {badges[t.page] > 0 && <i className="bottom-tab-dot" aria-label={`Непрочитанных: ${badges[t.page]}`} />}
          </span>
          <span>{t.label}</span>
        </Tab>
      ))}
    </nav>
  )
}
