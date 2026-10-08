import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Glass } from './Glass'
import { Button } from './Controls'
import Icon from './Icon'

// Диалог-подтверждение поверх области контента (стекло по центру, фон размыт).
// Рисуется в .content (портал) — не прокручивается вместе со страницей.
// tone: 'danger' — красная кнопка подтверждения; 'warn' — рыжая иконка.
// Esc и клик по фону — «Отмена» (если не идёт запрос).
export default function ConfirmDialog({
  open,
  icon = 'warning',
  tone = 'warn',
  title,
  children,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  busy = false,
  confirmDisabled = false,
  error = '',
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = e => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        e.stopPropagation()
        onCancel?.()
      }
    }
    window.addEventListener('keydown', onKey, true)
    // фокус на «Отмена» — случайный Enter не подтвердит опасное действие
    const t = setTimeout(() => cancelRef.current?.focus(), 30)
    return () => { window.removeEventListener('keydown', onKey, true); clearTimeout(t) }
  }, [open, busy, onCancel])

  if (!open) return null
  const host = document.querySelector('.content') || document.body
  return createPortal(
    <div className="dialog-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel?.() }}>
      <Glass variant="panel" className={`dialog dialog--${tone}`} role="alertdialog" aria-modal="true" aria-label={title}>
        <span className="dialog-ico" aria-hidden="true"><Icon name={icon} size={20} stroke={2} /></span>
        <div className="dialog-title">{title}</div>
        <div className="dialog-text">{children}</div>
        {error && <div className="dialog-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <Button variant="glass" onClick={onCancel} disabled={busy} ref={cancelRef}>{cancelLabel}</Button>
          <Button
            variant={tone === 'danger' ? 'danger-solid' : 'primary'}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            icon={busy ? <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> : null}
          >
            {confirmLabel}
          </Button>
        </div>
      </Glass>
    </div>,
    host,
  )
}
