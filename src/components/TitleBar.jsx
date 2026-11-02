import { IconButton } from './ui/Pressables'
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
        <IconButton variant="titlebar" label="Свернуть" title="Свернуть" onClick={() => window.api?.minimize?.()}>
          <Icon name="minimize" size={14} />
        </IconButton>
        <IconButton variant="titlebar" label={maximized ? 'Свернуть в окно' : 'Развернуть'}
          title={maximized ? 'Свернуть в окно' : 'Развернуть'}
          onClick={onToggleMaximize}
        >
          <Icon name={maximized ? 'restore' : 'maximize'} size={14} />
        </IconButton>
        <IconButton variant="titlebarClose" label="Закрыть"
          title="Закрыть — VPN продолжит работать в трее"
          onClick={() => window.api?.close?.()}
        >
          <Icon name="close" size={14} />
        </IconButton>
      </div>
    </header>
  )
}
