import { Icon } from '../components/ui'

// Подэкран настроек (макеты new-scr-*): «‹ Заголовок» и содержимое во всю
// область контента. fill — экран сам растягивается по высоте (чат, логи).
export default function Screen({ title, sub, onBack, right = null, fill = false, className = '', children }) {
  return (
    <div className={`scr${fill ? ' scr--fill' : ''} ${className}`}>
      <div className="scr-head">
        <button type="button" className="scr-back" onClick={onBack} aria-label="Назад" title="Назад (Esc)">
          <Icon name="chevronLeft" size={18} stroke={2.2} />
        </button>
        <div className="scr-titles">
          <h1 className="ui-h1">{title}</h1>
          {sub && <span className="ui-h1-sub">{sub}</span>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

// Заголовок группы внутри экрана: «ВАШИ ДОМЕНЫ · 3 из 50».
export function Overline({ children, meta }) {
  return (
    <div className="set-overline-row">
      <span className="ui-overline">{children}</span>
      {meta != null && <span className="set-overline-meta num">{meta}</span>}
    </div>
  )
}
