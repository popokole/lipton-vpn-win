import { useState, useEffect, useRef } from 'react'

export default function BypassDomainsScreen({ onBack }) {
  const [domains, setDomains] = useState([])
  const [input, setInput]     = useState('')
  const [error, setError]     = useState('')
  const [closing, setClosing] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    window.api.getBypassDomains().then(d => setDomains(d || []))
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [])

  function back() {
    setClosing(true)
    setTimeout(onBack, 260)
  }

  async function handleAdd() {
    const val = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!val) { setError('Введите домен'); return }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(val)) { setError('Неверный формат домена'); return }
    setError('')
    const result = await window.api.addBypassDomain(val)
    if (result.success) {
      setDomains(result.domains)
      setInput('')
    } else {
      setError(result.error || 'Ошибка')
    }
  }

  async function handleRemove(domain) {
    const result = await window.api.removeBypassDomain(domain)
    if (result.success) setDomains(result.domains)
  }

  return (
    <div className={`bypass-screen${closing ? ' bypass-screen--closing' : ''}`}>

      <div className="bypass-header">
        <button className="bypass-back" onClick={back}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span className="bypass-title">Обход VPN</span>
      </div>

      <p className="bypass-hint">
        Трафик к этим доменам пойдёт напрямую, минуя VPN.
        Применится при следующем подключении.
      </p>

      <div className="bypass-add">
        <input
          ref={inputRef}
          className={`bypass-input${error ? ' error' : ''}`}
          value={input}
          onChange={e => { setInput(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="example.com"
        />
        <button className="bypass-add-btn" onClick={handleAdd}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
      {error && <div className="bypass-error">{error}</div>}

      <div className="bypass-list">
        {domains.length === 0 ? (
          <div className="bypass-empty">Нет добавленных доменов</div>
        ) : (
          domains.map(domain => (
            <div key={domain} className="bypass-item">
              <span className="bypass-domain">{domain}</span>
              <button className="bypass-remove" onClick={() => handleRemove(domain)}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M1 1l8 8M9 1L1 9"/>
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
