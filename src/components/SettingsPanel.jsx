import { useState, useEffect, useRef } from 'react'
import BypassDomainsScreen from './BypassDomainsScreen'

export default function SettingsPanel({ onClose }) {
  const [bypassScreen, setBypassScreen] = useState(false)
  const [autostart,   setAutostart]   = useState(false)
  const [bypassRu,    setBypassRu]    = useState(true)
  const [killSwitch,  setKillSwitch]  = useState(false)
  const [autoConnect, setAutoConnect] = useState(false)
  const [adBlock,     setAdBlock]     = useState(false)
  const [flushing,    setFlushing]    = useState(false)
  const [logs, setLogs]             = useState([])
  const [logLoading, setLogLoading] = useState(false)
  const [resetting, setResetting]     = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [checkStatus, setCheckStatus] = useState(null)
  const [trialState, setTrialState]   = useState(null) // null | 'loading' | 'ok' | 'error' | 'used' | 'claimed'
  const [canTrial, setCanTrial]       = useState(false)
  const [copied, setCopied]         = useState(false)
  const [closing, setClosing]       = useState(false)
  const logsRef = useRef(null)

  useEffect(() => {
    window.api.getAutostart().then(v   => setAutostart(!!v))
    window.api.getBypassRu().then(v    => setBypassRu(v !== false))
    window.api.getKillSwitch().then(v  => setKillSwitch(!!v))
    window.api.getAutoConnect().then(v => setAutoConnect(!!v))
    window.api.getAdBlock().then(v     => setAdBlock(!!v))
    window.api.canClaimTrial().then(r => {
      if (r?.canClaim) setCanTrial(true)
      else setTrialState('claimed')
    })
    loadLogs()
  }, [])

  function close() {
    setClosing(true)
    setTimeout(() => onClose(), 260)
  }

  async function loadLogs() {
    setLogLoading(true)
    const lines = await window.api.getLogs()
    setLogs(lines || [])
    setLogLoading(false)
    setTimeout(() => {
      if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight
    }, 50)
  }

  async function toggleAutostart() {
    const next = !autostart
    setAutostart(next)
    await window.api.setAutostart(next)
  }

  async function toggleBypassRu() {
    const next = !bypassRu
    setBypassRu(next)
    await window.api.setBypassRu(next)
  }

  async function toggleKillSwitch() {
    const next = !killSwitch
    setKillSwitch(next)
    await window.api.setKillSwitch(next)
  }

  async function toggleAutoConnect() {
    const next = !autoConnect
    setAutoConnect(next)
    await window.api.setAutoConnect(next)
  }

  async function toggleAdBlock() {
    const next = !adBlock
    setAdBlock(next)
    await window.api.setAdBlock(next)
  }

  async function handleFlushDns() {
    setFlushing(true)
    await window.api.flushDns()
    setTimeout(() => setFlushing(false), 1500)
  }

  async function handleClearLogs() {
    await window.api.clearLogs()
    setLogs([])
  }

  async function handleCopyLogs() {
    const text = logs.join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleClaimTrial() {
    setTrialState('loading')
    const result = await window.api.claimTrial()
    if (result?.success) {
      setTrialState('ok')
      setCanTrial(false)
    } else {
      setTrialState(result?.error?.includes('сегодня') ? 'used' : 'error')
      setTimeout(() => setTrialState(null), 3000)
    }
  }

  async function handleCheckUpdates() {
    setCheckStatus('checking')
    const result = await window.api.checkForUpdates()
    if (result?.status === 'available') {
      setCheckStatus('available')
      setTimeout(() => setCheckStatus(null), 4000)
    } else if (result?.status === 'latest') {
      setCheckStatus('latest')
      setTimeout(() => setCheckStatus(null), 3000)
    } else {
      setCheckStatus('error')
      setTimeout(() => setCheckStatus(null), 3000)
    }
  }

  async function handleReset() {
    setResetting(true)
    await window.api.resetProfile()
    setResetting(false)
    close()
  }

  if (bypassScreen) {
    return (
      <div
        className={`settings-overlay${closing ? ' settings-overlay--closing' : ''}`}
        onClick={e => e.target === e.currentTarget && close()}
      >
        <div className={`settings-panel${closing ? ' settings-panel--closing' : ''}`}>
          <BypassDomainsScreen onBack={() => setBypassScreen(false)} />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`settings-overlay${closing ? ' settings-overlay--closing' : ''}`}
      onClick={e => e.target === e.currentTarget && close()}
    >
      <div className={`settings-panel${closing ? ' settings-panel--closing' : ''}`}>

        {/* Header */}
        <div className="settings-header">
          <span className="settings-title">Настройки</span>
          <button className="settings-close" onClick={close}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1 1l8 8M9 1L1 9"/>
            </svg>
          </button>
        </div>

        <div className="settings-body">

          {/* Updates */}
          <div className="settings-section">
            <button
              className={`settings-update-btn settings-update-btn--${checkStatus || 'idle'}`}
              onClick={handleCheckUpdates}
              disabled={checkStatus === 'checking'}
            >
              {checkStatus === 'checking' && 'Проверяется...'}
              {checkStatus === 'latest'   && '✓ Версия актуальна'}
              {checkStatus === 'available'&& '⬆ Найдено обновление'}
              {checkStatus === 'error'    && '✕ Ошибка проверки'}
              {!checkStatus              && 'Проверить обновления'}
            </button>
          </div>

          {/* Daily trial */}
          {(canTrial || trialState) && (
            <div className="settings-section">
              <button
                className={`settings-trial-btn${
                  trialState === 'ok' || trialState === 'claimed' ? ' settings-trial-btn--ok' : ''
                }${
                  trialState === 'claimed' ? ' settings-trial-btn--claimed' : ''
                }`}
                onClick={canTrial ? handleClaimTrial : undefined}
                disabled={trialState === 'loading' || trialState === 'ok' || trialState === 'claimed'}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                {trialState === 'loading' && 'Активируется...'}
                {trialState === 'ok'      && '✓ Подписка активирована на 15 мин'}
                {trialState === 'used'    && 'Уже получена сегодня'}
                {trialState === 'error'   && 'Ошибка активации'}
                {trialState === 'claimed' && '✓ 15 минут уже получены сегодня'}
                {!trialState              && 'Получить 15 минут бесплатно'}
              </button>
            </div>
          )}

          {/* System toggles */}
          <div className="settings-section">
            <span className="settings-section-title">Система</span>
            <div className="settings-row">
              <div className="settings-row-info">
                <span className="settings-row-label">Автозапуск</span>
                <span className="settings-row-sub">Запускать при входе в Windows</span>
              </div>
              <button
                className={`toggle${autostart ? ' toggle--on' : ''}`}
                onClick={toggleAutostart}
                aria-label="Автозапуск"
              >
                <span className="toggle-thumb" />
              </button>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <span className="settings-row-label">Обход РУ трафика</span>
                <span className="settings-row-sub">Российские сайты работают без VPN</span>
              </div>
              <button
                className={`toggle${bypassRu ? ' toggle--on' : ''}`}
                onClick={toggleBypassRu}
                aria-label="Обход РУ трафика"
              >
                <span className="toggle-thumb" />
              </button>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <span className="settings-row-label">Kill Switch</span>
                <span className="settings-row-sub">Блокировать интернет при обрыве VPN</span>
              </div>
              <button className={`toggle${killSwitch ? ' toggle--on' : ''}`} onClick={toggleKillSwitch}>
                <span className="toggle-thumb" />
              </button>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <span className="settings-row-label">Подключаться при запуске</span>
                <span className="settings-row-sub">Автоматически включать VPN при старте</span>
              </div>
              <button className={`toggle${autoConnect ? ' toggle--on' : ''}`} onClick={toggleAutoConnect}>
                <span className="toggle-thumb" />
              </button>
            </div>

            <div className="settings-row">
              <div className="settings-row-info">
                <span className="settings-row-label">Блокировка рекламы</span>
                <span className="settings-row-sub">Фильтрация через AdGuard DNS</span>
              </div>
              <button className={`toggle${adBlock ? ' toggle--on' : ''}`} onClick={toggleAdBlock}>
                <span className="toggle-thumb" />
              </button>
            </div>

            <button className="settings-bypass-row" onClick={() => setBypassScreen(true)}>
              <div className="settings-row-info">
                <span className="settings-row-label">Свои домены для обхода</span>
                <span className="settings-row-sub">Добавить домены в исключения VPN</span>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>

            <button className="settings-flush-btn" onClick={handleFlushDns} disabled={flushing}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {flushing ? '✓ DNS кэш очищен' : 'Очистить DNS кэш'}
            </button>
          </div>

          {/* Logs */}
          <div className="settings-section">
            <div className="settings-section-header">
              <span className="settings-section-title">Логи приложения</span>
              <div style={{ display:'flex', gap:6 }}>
                <button className="settings-action-btn" onClick={loadLogs} disabled={logLoading}>
                  {logLoading ? '...' : 'Обновить'}
                </button>
                <button className="settings-action-btn" onClick={handleCopyLogs} disabled={!logs.length}>
                  {copied ? '✓' : 'Копировать'}
                </button>
                <button className="settings-action-btn" onClick={() => window.api.openLogFile()}>
                  Файл
                </button>
                <button className="settings-action-btn settings-action-btn--danger"
                  onClick={handleClearLogs} disabled={!logs.length}>
                  Очистить
                </button>
              </div>
            </div>
            <div className="settings-logs" ref={logsRef}>
              {logs.length === 0
                ? <span className="settings-logs-empty">Логи пусты. Подключитесь к VPN и обновите.</span>
                : logs.map((line, i) => (
                    <div key={i} className={`settings-log-line settings-log-line--${
                      line.includes('[ERROR]') ? 'error' :
                      line.includes('[WARN]')  ? 'warn'  : 'info'
                    }`}>{line}</div>
                  ))
              }
            </div>
          </div>

          {/* Reset proxy */}
          <div className="settings-section">
            <span className="settings-section-title">Прокси Windows</span>
            {confirmReset ? (
              <div className="settings-reset-confirm">
                <span className="settings-reset-confirm-text">Отключит VPN и сбросит прокси. Уверен?</span>
                <div className="settings-reset-confirm-btns">
                  <button className="settings-reset-confirm-yes" onClick={handleReset} disabled={resetting}>
                    {resetting ? 'Сброс...' : 'Да, сбросить'}
                  </button>
                  <button className="settings-reset-confirm-no" onClick={() => setConfirmReset(false)}>
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="settings-reset-btn"
                onClick={() => setConfirmReset(true)}
                disabled={resetting}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 1 0 .49-3.87"/>
                </svg>
                Сбросить прокси Windows
              </button>
            )}
            {!confirmReset && (
              <span className="settings-reset-hint">
                Отключит VPN и очистит системные настройки прокси
              </span>
            )}
          </div>

        </div>

        <div className="settings-footer">
          <span className="settings-footer-text">разработка</span>
          <span className="settings-footer-by">by popokole</span>
        </div>

      </div>
    </div>
  )
}
