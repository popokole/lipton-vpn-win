import { forwardRef } from 'react'

// Мелкие элементы дизайн-системы: капсула, тумблер, сегменты, кнопки, прогресс.

export function Capsule({ icon, tone, as: Tag = 'span', className = '', children, ...rest }) {
  return (
    <Tag className={`ui-capsule${tone ? ` ui-capsule--${tone}` : ''} ${className}`} {...rest}>
      {icon}
      {children != null && <span>{children}</span>}
    </Tag>
  )
}

// Тумблер 46×28 (role="switch"). onChange получает новое значение.
export function Switch({ checked, onChange, disabled, label, className = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      className={`ui-switch ${className}`}
      onClick={() => onChange?.(!checked)}
    />
  )
}

// Сегменты (radiogroup). options: [{ value, label, sub?, icon? }].
// onChange(value, event) — событие нужно, например, чтобы раскрыть тему кругом от кнопки.
export function Segmented({ options, value, onChange, label, tall = false, className = '' }) {
  return (
    <div role="radiogroup" aria-label={label} className={`ui-seg${tall ? ' ui-seg--tall' : ''} ${className}`}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className="ui-seg-btn"
          onClick={e => { if (o.value !== value) onChange?.(o.value, e) }}
        >
          {o.icon}
          <span>{o.label}</span>
          {tall && o.sub && <span className="ui-seg-sub">{o.sub}</span>}
        </button>
      ))}
    </div>
  )
}

// Кнопка: variant primary | glass | ghost | danger | danger-solid | warn; size sm | md | lg.
export const Button = forwardRef(function Button(
  { variant = 'glass', size, block = false, icon, className = '', children, type = 'button', ...rest },
  ref,
) {
  const cls = ['ui-btn', `ui-btn--${variant}`, size ? `ui-btn--${size}` : '', block ? 'ui-btn--block' : '', className]
    .filter(Boolean).join(' ')
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {icon}
      {children != null && <span>{children}</span>}
    </button>
  )
})

export function Progress({ value = 0, thick = false, label, className = '' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div className={`ui-progress${thick ? ' ui-progress--6' : ''} ${className}`} role="img" aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Dot({ pulse = false, className = '' }) {
  return <span className={`ui-dot${pulse ? ' ui-dot--pulse' : ''} ${className}`} aria-hidden="true" />
}
