import { forwardRef } from 'react'
import Icon from './Icon'

// Поле ввода в стекле: иконка слева, справа — галочка (ok) или своё (right).
// tone: 'error' — красная обводка.
const Field = forwardRef(function Field(
  { icon, ok = false, tone = '', right = null, className = '', ...rest },
  ref,
) {
  return (
    <label className={`ui-field${tone ? ` ui-field--${tone}` : ''}${ok ? ' ui-field--ok' : ''} ${className}`}>
      {icon && <Icon name={icon} size={18} stroke={1.8} className="ui-field-ico" />}
      <input ref={ref} className="ui-field-input" spellCheck={false} {...rest} />
      {right}
      {ok && !right && <span className="ui-field-ok" aria-hidden="true"><Icon name="check" size={12} stroke={2.6} /></span>}
    </label>
  )
})

export default Field
