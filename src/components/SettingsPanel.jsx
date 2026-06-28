import { useState, useEffect, useRef } from 'react'
import BypassDomainsScreen from './BypassDomainsScreen'

export default function SettingsPanel({ onClose, onLogout }) {
  const [bypassScreen, setBypassScreen] = useState(false)
  const [autostart,   setAutostart]   = useState(false)
  const [bypassRu,    setBypassRu]    = useState(true)
  const [killSwitch,  setKillSwitch]  = useState(false)
  const [autoConnect, setAutoConnect] = useState(false)
  const [tunMode,     setTunMode]     = useState(false)
  const [flushing,        setFlushing]        = useState(false)
  const [resettingNet,    setResettingNet]    = useState(false)
  const [confirmNetReset, setConfirmNetReset] = useState(false)
  const [netResetDone,    setNetResetDone]    = useState(false)
  const [logs, setLogs]       = useState([])
  const [logLoading, setLogLoading] = useState(false)
  const [checkStatus, setCheckStatus] = useState(null)
  const [copied, setCopied]         = useState(false)
  const [closing, setClosing]       = useState(false)
  const logsRef = useRef(null)

  useEffect(() => {
    window.api.getAutostart().then(v   => setAutostart(!!v))
    window.api.getBypassRu().then(v    => setBypassRu(v !== false))
    window.api.getKillSwitch().then(v  => setKillSwitch(!!v))
    window.api.getAutoConnect().then(v => setAutoConnect(!!v))
    window.api.getTunMode().then(v     => setTunMode(!!v))
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

  async function toggleTunMode() {
    const next = !tunMode
    setTunMode(next)
    await window.api.setTunMode(next)
  }

  async function handleFlushDns() {
    setFlushing(true)
    await window.api.flushDns()
    setTimeout(() => setFlushing(false), 1500)
  }

  async function handleResetNetwork() {
    setResettingNet(true)
    setConfirmNetReset(false)
    await window.api.resetNetwork()
    setResettingNet(false)
    setNetResetDone(true)
    setTimeout(() => setNetResetDone(false), 7000)
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
                <span className="settings-row-label">TUN режим</span>
                <span className="settings-row-sub">Весь трафик через VPN — фиксит игры и UDP</span>
              </div>
              <button className={`toggle${tunMode ? ' toggle--on' : ''}`} onClick={toggleTunMode}>
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

          {/* Combined system reset */}
          <div className="settings-section">
            <span className="settings-section-title">Сброс системы</span>

            {netResetDone ? (
              <div className="settings-reset-confirm">
                <span className="settings-reset-confirm-text" style={{ color: 'var(--green)' }}>
                  ✓ Готово — перезагрузи компьютер для полного применения
                </span>
              </div>
            ) : confirmNetReset ? (
              <div className="settings-reset-confirm">
                <span className="settings-reset-confirm-text">
                  Отключит VPN и сбросит все сетевые настройки. Уверен?
                </span>
                <div className="settings-reset-confirm-btns">
                  <button className="settings-reset-confirm-yes" onClick={handleResetNetwork} disabled={resettingNet}>
                    {resettingNet ? 'Сброс...' : 'Да, сбросить'}
                  </button>
                  <button className="settings-reset-confirm-no" onClick={() => setConfirmNetReset(false)}>
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button className="settings-reset-btn" onClick={() => setConfirmNetReset(true)} disabled={resettingNet}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 1 0 .49-3.87"/>
                </svg>
                Полный сброс настроек сети
              </button>
            )}
            {!confirmNetReset && !netResetDone && (
              <span className="settings-reset-hint">
                Отключает VPN · очищает прокси Windows · сбрасывает DNS на автоматический · удаляет TUN маршруты · сбрасывает Winsock и TCP/IP стек (требует перезагрузки)
              </span>
            )}
          </div>

          {/* Account */}
          {onLogout && (
            <div className="settings-section">
              <span className="settings-section-title">Аккаунт</span>
              <button className="settings-logout-btn" onClick={() => { close(); onLogout() }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Выйти из аккаунта
              </button>
            </div>
          )}

        </div>

        <div className="settings-footer">
          <span className="settings-footer-text">разработка</span>
          <span className="settings-footer-by">by popokole</span>
        </div>

      </div>
    </div>
  )
}
