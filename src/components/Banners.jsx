import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button, Glass, Icon, Logo, Progress } from './ui'

// Баннеры и экраны из админки (GET /app/banners): модальный экран (kind
// screen) и блокирующий экран «Обновите приложение» (kind update,
// dismissible=false, либо версия ниже /config.min_app_versions.windows).

const STYLE_ICON = { info: 'info', promo: 'gift', warning: 'warning' }
export const bannerIcon = (b) => (b?.kind === 'update' ? 'download' : STYLE_ICON[b?.style] || 'bell')
export const bannerTone = (b) => (b?.style === 'warning' ? 'warn' : b?.style === 'promo' ? 'ok' : 'info')

// Модальный экран поверх области контента. Закрыть — «Закрыть» (dismissible
// запоминается) или «Позже» (до перезапуска), Esc — то же.
export function BannerScreen({ banner, onAction, onClose }) {
  const closeRef = useRef(null)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    const t = setTimeout(() => closeRef.current?.focus(), 30)
    return () => { window.removeEventListener('keydown', onKey, true); clearTimeout(t) }
  }, [onClose])
  const host = document.querySelector('.content') || document.body
  return createPortal(
    <div className="dialog-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <Glass variant="panel" className={`bscreen bscreen--${banner.style}`} role="dialog" aria-modal="true" aria-label={banner.title}>
        <span className="bscreen-ico" aria-hidden="true"><Icon name={bannerIcon(banner)} size={22} stroke={2} /></span>
        <div className="bscreen-title">{banner.title}</div>
        {banner.text && <div className="bscreen-text">{banner.text}</div>}
        <div className="bscreen-actions">
          <Button ref={closeRef} onClick={onClose}>{banner.dismissible ? 'Закрыть' : 'Позже'}</Button>
          {(banner.ctaUrl || banner.kind === 'update') && (
            <Button variant="primary" onClick={onAction}>{banner.ctaText || (banner.kind === 'update' ? 'Обновить' : 'Подробнее')}</Button>
          )}
        </div>
      </Glass>
    </div>,
    host,
  )
}

// Обязательное обновление: на всё окно, только кнопка «Обновить».
// update — { state: 'idle'|'checking'|'downloading'|'ready'|'failed', percent }.
export function UpdateGate({ banner, version, update, onUpdate }) {
  const st = update?.state || 'idle'
  const busy = st === 'checking' || st === 'downloading' || st === 'ready'
  let label = banner?.ctaText || 'Обновить'
  if (st === 'checking') label = 'Ищем обновление…'
  if (st === 'downloading') label = `Скачиваем… ${update.percent ?? 0}%`
  if (st === 'ready') label = 'Устанавливаем…'
  return (
    <div className="update-gate">
      <Glass variant="panel" className="update-gate-card ui-rise">
        <span className="update-gate-logo"><Logo size={30} /></span>
        <h1 className="update-gate-title">{banner?.title || 'Обновите приложение'}</h1>
        <p className="update-gate-text">
          {banner?.text || 'Эта версия Lipton VPN больше не поддерживается. Обновление скачается и установится само — это займёт минуту.'}
        </p>
        {st === 'downloading' && <Progress value={(update.percent || 0) / 100} thick label="Загрузка обновления" />}
        {st === 'failed' && <div className="scr-error">Не получилось обновиться автоматически — откроем страницу загрузки.</div>}
        <Button variant="primary" size="lg" block onClick={onUpdate} disabled={busy}
          icon={busy ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : <Icon name="download" size={18} stroke={2} />}>
          {label}
        </Button>
        <div className="update-gate-ver num">Сейчас установлена версия {version || '—'}</div>
      </Glass>
    </div>
  )
}
