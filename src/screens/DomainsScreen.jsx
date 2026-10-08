import { useEffect, useRef, useState } from 'react'
import { Button, Field, Glass, Icon, Switch } from '../components/ui'
import Screen, { Overline } from './Screen'
import { addedLabel } from '../lib/screens.mjs'

// Свои домены для обхода (макет new-scr-domains): добавить, список с датами,
// лимит 50; ниже — напоминание, что российские сайты и так идут напрямую.
export default function DomainsScreen({ onBack }) {
  const [items, setItems] = useState(null)
  const [limit, setLimit] = useState(50)
  const [input, setInput] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [bypassRu, setBypassRu] = useState(true)
  const inputRef = useRef(null)

  useEffect(() => {
    const api = window.api
    if (api?.getBypassDomainsMeta) {
      api.getBypassDomainsMeta().then(r => { setItems(r?.items || []); if (r?.limit) setLimit(r.limit) }).catch(() => setItems([]))
    } else {
      api?.getBypassDomains?.().then(list => setItems((list || []).map(domain => ({ domain, addedAt: null })))).catch(() => setItems([]))
    }
    api?.getBypassRu?.().then(v => setBypassRu(v !== false)).catch(() => {})
  }, [])

  const add = async (e) => {
    e?.preventDefault()
    if (busy) return
    if (!input.trim()) { setErr('Введите домен'); return }
    setBusy(true); setErr('')
    const r = await window.api.addBypassDomain(input).catch(x => ({ success: false, error: x?.message }))
    setBusy(false)
    if (r?.success) {
      setItems(r.items || (r.domains || []).map(domain => ({ domain, addedAt: null })))
      setInput('')
      inputRef.current?.focus()
    } else {
      setErr(r?.error || 'Не удалось добавить')
    }
  }

  const remove = async (domain) => {
    const r = await window.api.removeBypassDomain(domain).catch(() => null)
    if (r?.success) setItems(r.items || (r.domains || []).map(d => ({ domain: d, addedAt: null })))
  }

  const toggleRu = async (v) => {
    setBypassRu(v)
    try { await window.api?.setBypassRu?.(v) } catch { setBypassRu(!v) }
  }

  const list = items || []
  const full = list.length >= limit

  return (
    <Screen title="Свои домены для обхода" onBack={onBack}>
      <p className="scr-lead">Трафик к этим сайтам пойдёт напрямую, мимо VPN. Применится при следующем подключении.</p>
      <div className="cols-2 scr-cols">
        <div className="col">
          <Glass className="scr-card ui-rise" style={{ '--i': 1 }}>
            <form className="dom-add" onSubmit={add}>
              <label className="scr-label" htmlFor="dom-input">Домен</label>
              <div className="dom-add-row">
                <Field
                  id="dom-input"
                  ref={inputRef}
                  icon="globe"
                  value={input}
                  tone={err ? 'error' : ''}
                  onChange={e => { setInput(e.target.value); setErr('') }}
                  placeholder="example.com"
                  disabled={full}
                  autoFocus
                />
                <Button type="submit" variant="primary" disabled={busy || full} icon={<Icon name="plus" size={16} stroke={2.4} />}>Добавить</Button>
              </div>
              {err ? <div className="scr-error" role="alert">{err}</div> : (
                <div className="scr-hint"><Icon name="info" size={13} stroke={2} />{full ? `Достигнут лимит — ${limit} доменов` : `До ${limit} доменов · поддомены — тоже напрямую`}</div>
              )}
            </form>
          </Glass>

          <Glass className="scr-card dom-ru ui-rise" style={{ '--i': 2 }}>
            <div className="set-row">
              <span className="set-ico" aria-hidden="true"><Icon name="branch" size={16} stroke={2} /></span>
              <span className="set-row-text">
                <span className="set-row-title dom-ru-title">Российские сайты уже идут напрямую</span>
                <span className="set-row-sub">— их добавлять не нужно</span>
              </span>
            </div>
            <div className="set-row">
              <span className="set-ico" aria-hidden="true"><Icon name="shieldCheck" size={16} stroke={2} /></span>
              <span className="set-row-text">
                <span className="set-row-title">Обход российских сайтов</span>
                <span className="set-row-sub">Банки, Госуслуги, маркетплейсы</span>
              </span>
              <Switch checked={bypassRu} onChange={toggleRu} label="Обход российских сайтов" />
            </div>
          </Glass>
        </div>

        <div className="col">
          <section className="set-section">
            <Overline meta={`${list.length} из ${limit}`}>Ваши домены</Overline>
            <Glass className="set-card ui-rise" style={{ '--i': 2 }}>
              {items === null && <div className="set-row set-row--muted"><span className="ui-spinner ui-spinner--sm" aria-hidden="true" />Загружаем…</div>}
              {items !== null && !list.length && (
                <div className="scr-empty">
                  <Icon name="globe" size={22} stroke={1.8} />
                  <span>Пока пусто. Добавьте сайт, который должен открываться без VPN — например, банк или рабочий портал.</span>
                </div>
              )}
              {list.map(d => (
                <div key={d.domain} className="set-row dom-item">
                  <span className="set-ico" aria-hidden="true"><Icon name="globe" size={16} stroke={2} /></span>
                  <span className="set-row-text">
                    <span className="set-row-title">{d.domain}</span>
                    <span className="set-row-sub">{addedLabel(d.addedAt)}</span>
                  </span>
                  <button type="button" className="ui-icon-btn dom-remove" onClick={() => remove(d.domain)} aria-label={`Удалить ${d.domain}`} title="Удалить">
                    <Icon name="close" size={14} stroke={2} />
                  </button>
                </div>
              ))}
            </Glass>
          </section>
        </div>
      </div>
    </Screen>
  )
}
