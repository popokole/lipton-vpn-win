import { Logo, Icon } from './ui'

// Заголовок окна 40 px: знак, «Lipton VPN», свернуть / развернуть / закрыть.
// Окно перетаскивается за заголовок; двойной щелчок — развернуть (как в Windows).
// «Закрыть» прячет окно в трей — VPN продолжает работать.
export default function TitleBar({ maximized = false, onToggleMaximize, children }) {
  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <Logo size={14} boxed />
        <span className="titlebar-name">Lipton VPN</span>
        {children && <div className="titlebar-extra">{children}</div>}
      </div>
      <div className="titlebar-controls">
        <button type="button" className="titlebar-btn" aria-label="Свернуть" title="Свернуть" onClick={() => window.api?.minimize?.()}>
          <Icon name="minimize" size={14} />
        </button>
        <button
          type="button"
          className="titlebar-btn"
          aria-label={maximized ? 'Свернуть в окно' : 'Развернуть'}
          title={maximized ? 'Свернуть в окно' : 'Развернуть'}
          onClick={onToggleMaximize}
        >
          <Icon name={maximized ? 'restore' : 'maximize'} size={14} />
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn--close"
          aria-label="Закрыть"
          title="Закрыть — VPN продолжит работать в трее"
          onClick={() => window.api?.close?.()}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </header>
  )
}
