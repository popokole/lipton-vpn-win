import EarthSymbols from './EarthSymbols'

export default function ConnectButton({ status, onConnect }) {
  const isPending = status === 'connecting' || status === 'disconnecting'
  // Земля ярче, когда подключены; приглушена в покое.
  const globeOpacity =
    status === 'connected' ? 0.95 :
    isPending ? 0.7 :
    0.5

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
        <div className="power-globe">
          <EarthSymbols grid={7} fps={30} opacity={globeOpacity} />
        </div>
        <svg className="power-icon" width="34" height="34" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
          <line x1="12" y1="2" x2="12" y2="12"/>
        </svg>
      </button>
    </div>
  )
}
