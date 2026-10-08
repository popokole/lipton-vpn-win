import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Field, Glass, Icon } from '../components/ui'
import Screen, { Overline } from './Screen'
import { sanitizeHtml } from '../lib/sanitize.js'

// База знаний (макет new-scr-kb): поиск, разделы, статьи блога
// (/content/articles). Пока этой ручки нет — частые вопросы /faq списком.
// Статья открывается здесь же (HTML очищается), «Открыть на сайте» — в окне блога.

const CATEGORY_ICON = [
  [/подключ/i, 'bolt'],
  [/оплат|тариф/i, 'card'],
  [/устройств|телефон|iphone|android/i, 'phone'],
  [/обход|блокир/i, 'shuffle'],
]
const categoryIcon = c => (CATEGORY_ICON.find(([re]) => re.test(String(c || ''))) || [null, 'book'])[1]
const minutesLabel = m => (Number(m) > 0 ? `${m} мин` : '')

function Article({ slug, onClose }) {
  const [state, setState] = useState({ loading: true })
  const bodyRef = useRef(null)

  useEffect(() => {
    let alive = true
    window.api?.contentArticle?.(slug).then(r => {
      if (!alive) return
      if (r?.success && r.article) setState({ article: r.article, html: sanitizeHtml(r.article.html || '') })
      else setState({ error: r?.error || 'Не удалось открыть статью' })
    }).catch(() => alive && setState({ error: 'Не удалось открыть статью' }))
    return () => { alive = false }
  }, [slug])

  // Ссылки из статьи — в браузере, а не внутри окна приложения.
  const onClick = (e) => {
    const a = e.target.closest?.('a')
    if (!a) return
    e.preventDefault()
    const href = a.getAttribute('href')
    if (href) window.api?.openExternal?.(href)
  }

  const a = state.article
  return (
    <div className="kb-article ui-rise" style={{ '--i': 1 }}>
      <div className="kb-article-bar">
        <button type="button" className="onb-link onb-link--line kb-back" onClick={onClose}><Icon name="chevronLeft" size={14} stroke={2.2} />Все статьи</button>
        <Button size="sm" icon={<Icon name="external" size={13} stroke={2} />} onClick={() => window.api?.openArticles?.(slug)}>Открыть на сайте</Button>
      </div>
      {state.loading && <div className="scr-loading"><span className="ui-spinner" aria-label="Загрузка" /></div>}
      {state.error && <div className="scr-error scr-error--block">{state.error}</div>}
      {a && (
        <Glass className="kb-article-card">
          <div className="kb-article-meta">{[a.category, minutesLabel(a.minutes || a.reading_minutes)].filter(Boolean).join(' · ')}</div>
          <h2 className="kb-article-title">{a.title}</h2>
          {/* HTML очищен sanitizeHtml: только разметка текста, ссылки https */}
          <div className="kb-article-body" ref={bodyRef} onClick={onClick} dangerouslySetInnerHTML={{ __html: state.html }} />
        </Glass>
      )}
    </div>
  )
}

export default function KnowledgeScreen({ onBack, onSupport }) {
  const [articles, setArticles] = useState(null) // null — грузим
  const [faq, setFaq] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [open, setOpen] = useState(null) // slug статьи
  const [openFaq, setOpenFaq] = useState(null)

  useEffect(() => {
    let alive = true
    const api = window.api
    api?.contentArticles?.().then(r => {
      if (!alive) return
      if (r?.success && Array.isArray(r.items) && r.items.length) { setArticles(r.items); return }
      setArticles([])
      // запасной вариант: частые вопросы
      return api?.contentFaq?.().then(f => {
        if (!alive) return
        if (f?.success) setFaq(f.items || [])
        else { setFaq([]); setError(f?.error || 'Не удалось загрузить базу знаний') }
      })
    }).catch(() => { if (alive) { setArticles([]); setFaq([]); setError('Нет связи с сервером') } })
    return () => { alive = false }
  }, [])

  const categories = useMemo(() => {
    const seen = []
    for (const a of articles || []) if (a.category && !seen.includes(a.category)) seen.push(a.category)
    return seen
  }, [articles])

  const q = query.trim().toLowerCase()
  const shown = useMemo(() => (articles || []).filter(a =>
    (!category || a.category === category) &&
    (!q || `${a.title} ${a.excerpt || ''} ${a.category || ''}`.toLowerCase().includes(q))), [articles, category, q])
  const shownFaq = useMemo(() => (faq || []).filter(f =>
    !q || `${f.question} ${f.answer}`.toLowerCase().includes(q)), [faq, q])

  const loading = articles === null || (articles.length === 0 && faq === null && !error)
  const usingFaq = articles !== null && articles.length === 0

  return (
    <Screen title="База знаний" onBack={onBack}>
      {open ? <Article slug={open} onClose={() => setOpen(null)} /> : (
        <>
          <div className="kb-search ui-rise" style={{ '--i': 1 }}>
            <Field icon="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти ответ" aria-label="Поиск" />
          </div>
          {categories.length > 0 && (
            <div className="kb-cats ui-rise" style={{ '--i': 2 }}>
              {categories.map(c => (
                <button key={c} type="button" className="kb-cat" aria-pressed={category === c} onClick={() => setCategory(cur => (cur === c ? '' : c))}>
                  <Icon name={categoryIcon(c)} size={14} stroke={2} />{c}
                </button>
              ))}
            </div>
          )}

          {loading && <div className="scr-loading"><span className="ui-spinner" aria-label="Загрузка" /></div>}
          {error && <div className="scr-error scr-error--block">{error}</div>}

          {!usingFaq && articles && articles.length > 0 && (
            <section className="set-section">
              <Overline meta={category ? null : 'чаще всего читают'}>{category || 'Популярное'}</Overline>
              <Glass className="set-card ui-rise" style={{ '--i': 3 }}>
                {shown.map(a => (
                  <button key={a.slug} type="button" className="set-row set-row--link kb-row" onClick={() => setOpen(a.slug)}>
                    <span className="set-ico" aria-hidden="true"><Icon name={categoryIcon(a.category)} size={16} stroke={2} /></span>
                    <span className="set-row-text">
                      <span className="set-row-title kb-row-title">{a.title}</span>
                      <span className="set-row-sub">{[a.category, minutesLabel(a.minutes || a.reading_minutes)].filter(Boolean).join(' · ')}</span>
                    </span>
                    <Icon name="chevronRight" size={16} stroke={2} className="set-row-chev" />
                  </button>
                ))}
                {!shown.length && <div className="set-row set-row--muted">Ничего не нашлось — попробуйте другие слова</div>}
              </Glass>
            </section>
          )}

          {usingFaq && faq && faq.length > 0 && (
            <section className="set-section">
              <Overline>Частые вопросы</Overline>
              <Glass className="set-card ui-rise" style={{ '--i': 3 }}>
                {shownFaq.map(f => {
                  const isOpen = openFaq === f.id
                  return (
                    <div key={f.id} className={`kb-faq${isOpen ? ' is-open' : ''}`}>
                      <button type="button" className="set-row set-row--link" aria-expanded={isOpen} onClick={() => setOpenFaq(isOpen ? null : f.id)}>
                        <span className="set-ico" aria-hidden="true"><Icon name="info" size={16} stroke={2} /></span>
                        <span className="set-row-text"><span className="set-row-title kb-row-title">{f.question}</span></span>
                        <Icon name="chevronDown" size={16} stroke={2} className="set-row-chev kb-faq-chev" />
                      </button>
                      {isOpen && <div className="kb-faq-answer">{f.answer}</div>}
                    </div>
                  )
                })}
                {!shownFaq.length && <div className="set-row set-row--muted">Ничего не нашлось — попробуйте другие слова</div>}
              </Glass>
            </section>
          )}

          <Glass edge className="kb-help ui-rise" style={{ '--i': 4 }}>
            <span className="kb-help-ico" aria-hidden="true"><Icon name="sparkle" size={18} stroke={2} /></span>
            <span className="set-row-text">
              <span className="set-row-title">Не нашли ответ?</span>
              <span className="kb-help-sub">ИИ-помощник ответит сразу, а если нужно — подключится оператор.</span>
            </span>
            <Button variant="primary" size="sm" onClick={onSupport} icon={<Icon name="chatDots" size={14} stroke={2} />}>Написать в поддержку</Button>
          </Glass>
        </>
      )}
    </Screen>
  )
}
