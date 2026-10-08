import { forwardRef, useImperativeHandle, useRef, useState } from 'react'

// Поле кода по клеткам (4 цифры с сайта, 6 из письма): одно настоящее поле
// поверх клеток — работает вставка, автозаполнение кода и экранный диктор.
// flash: 'ok' | 'err' — подсветка после проверки (зелёная / покачивание).
// onComplete(code) — вызывается, когда набраны все цифры.
const CodeBoxes = forwardRef(function CodeBoxes(
  { length = 6, value, onChange, onComplete, flash = '', disabled = false, autoFocus = false, label = 'Код' },
  ref,
) {
  const inputRef = useRef(null)
  const [focused, setFocused] = useState(false)
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }))

  const digits = String(value || '').replace(/\D/g, '').slice(0, length)
  const active = Math.min(digits.length, length - 1)

  const change = (e) => {
    const next = e.target.value.replace(/\D/g, '').slice(0, length)
    onChange?.(next)
    if (next.length === length && next !== digits) onComplete?.(next)
  }

  return (
    <div
      className={`code-boxes${flash ? ` is-${flash}` : ''}${disabled ? ' is-disabled' : ''}`}
      style={{ '--n': length }}
      onMouseDown={e => { if (e.target !== inputRef.current) { e.preventDefault(); inputRef.current?.focus() } }}
    >
      {Array.from({ length }, (_, i) => (
        <span
          key={i}
          className={`code-box${digits[i] ? ' is-filled' : ''}${focused && i === active && !disabled ? ' is-active' : ''}`}
          aria-hidden="true"
        >
          {digits[i] || ''}
        </span>
      ))}
      <input
        ref={inputRef}
        className="code-boxes-input"
        value={digits}
        onChange={change}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        aria-label={label}
        disabled={disabled}
        autoFocus={autoFocus}
        spellCheck={false}
      />
    </div>
  )
})

export default CodeBoxes
