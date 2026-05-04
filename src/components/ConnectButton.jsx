export default function ConnectButton({ status, onConnect }) {
  const isPending = status === 'connecting' || status === 'disconnecting'

  return (
    <div className="power-wrap">
      <div className={`power-ring-outer power-ring-outer--${status}`} />
      <div className={`power-ring power-ring--${status}`} />
      <button
        className={`power-btn power-btn--${status}`}
        onClick={onConnect}
        disabled={isPending}
        title={status === 'connected' ? 'Отключиться' : 'Подключиться'}
      >
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
          <line x1="12" y1="2" x2="12" y2="12"/>
        </svg>
      </button>
    </div>
  )
}
