import { Icon } from './ui'

// Кнопка подключения в hero (200×52, капсула): «Подключить» — светлая со
// свечением цвета состояния, «Отключить» — стеклянная. Пока идёт подключение
// или отключение — спиннер и кнопка неактивна (логика нажатия — в App).
export default function ConnectButton({ status, onConnect, disabled = false }) {
  const pending = status === 'connecting' || status === 'disconnecting'
  const on = status === 'connected' || status === 'reconnecting'
  const label =
    status === 'connecting' ? 'Подключение…' :
    status === 'disconnecting' ? 'Отключение…' :
    on ? 'Отключить' : 'Подключить'

  return (
    <button
      type="button"
      className={`connect-btn connect-btn--${on || pending ? 'on' : 'off'}`}
      onClick={onConnect}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
    >
      {pending ? <span className="ui-spinner" aria-hidden="true" /> : <Icon name="power" size={18} />}
      <span>{label}</span>
    </button>
  )
}
