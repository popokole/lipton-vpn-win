import { forwardRef } from 'react'

// Все нажимаемые элементы окна, кроме Button: один вид — один вариант.
// Внешний вид живёт в CSS-классах экранов; здесь — какой класс у какого
// варианта, чтобы экраны не собирали кнопки руками.

const cx = (...parts) => parts.filter(Boolean).join(' ')

function pressable(displayName, variants, { active: activeClass } = {}) {
  const Comp = forwardRef(function Pressable(
    { variant = Object.keys(variants)[0], active = false, className = '', type = 'button', children, ...rest },
    ref,
  ) {
    const base = variants[variant] ?? variants[Object.keys(variants)[0]]
    const on = active && activeClass ? activeClass(base) : ''
    return (
      <button ref={ref} type={type} className={cx(base, on, className)} {...rest}>
        {children}
      </button>
    )
  })
  Comp.displayName = displayName
  return Comp
}

/** Кнопка-иконка. label обязателен: его читает скринридер и показывает подсказка. */
export const IconButton = forwardRef(function IconButton(
  { label, variant = 'icon', className = '', type = 'button', title, children, ...rest },
  ref,
) {
  const base = ICON_VARIANTS[variant] ?? ICON_VARIANTS.icon
  return (
    <button ref={ref} type={type} aria-label={label} title={title ?? label} className={cx(base, className)} {...rest}>
      {children}
    </button>
  )
})

const ICON_VARIANTS = {
  icon: 'ui-icon-btn',
  close: 'settings-close',
  back: 'scr-back',
  backBypass: 'bypass-back',
  backOnboarding: 'onb-back',
  titlebar: 'titlebar-btn',
  titlebarClose: 'titlebar-btn titlebar-btn--close',
  attach: 'chat-attach',
  send: 'chat-send',
  external: 'news-card2-ext',
}

/** Текстовая кнопка-ссылка. */
export const LinkButton = pressable('LinkButton', {
  link: 'onb-link',
  accent: 'onb-link onb-link--accent',
  line: 'onb-link onb-link--line',
  top: 'onb-top-link',
  resend: 'onb-resend',
  skip: 'onb-skip',
  hero: 'hero-link',
  license: 'license-link',
  small: 'set-small-link',
  privacy: 'priv-licenses',
  chat: 'chat-link',
  file: 'set-logs-file',
  danger: 'logs-clear',
})

/** Крупная кнопка действия экрана (оплата, повтор, подключение). */
export const ActionButton = pressable('ActionButton', {
  cta: 'acc-btn acc-btn--cta',
  secondary: 'acc-btn',
  check: 'settings-flush-btn check-again-btn',
  promo: 'bypass-promo-btn',
  try: 'onb-try',
  server: 'hero-server',
  guestTariffs: 'guest-ended-tariffs ui-glass',
  connectOff: 'connect-btn connect-btn--off',
  connectOn: 'connect-btn connect-btn--on',
})

/** Строка списка или карточка, нажимаемая целиком. */
export const RowButton = pressable('RowButton', {
  row: 'set-row set-row--link',
  dangerRow: 'set-row set-row--center set-danger-link',
  logs: 'set-row-text set-logs-open',
  news: 'news-card2-hit',
  onboardingItem: 'onb-item onb-item--link ui-glass',
  cancel: 'set-cancel ui-rise',
  unlink: 'pm-unlink ui-rise',
})

/** Чип: быстрый ответ, категория. */
export const Chip = pressable('Chip', {
  chat: 'chat-chip',
  ok: 'chat-chip chat-chip--ok',
  category: 'kb-cat',
})

/** Вкладка. active — выбранная. */
export const Tab = pressable(
  'Tab',
  {
    auth: 'auth-tab',
    onboarding: 'onb-tab',
    bottom: 'bottom-tab',
    side: 'side-nav-btn',
  },
  { active: (base) => (base === 'auth-tab' ? 'auth-tab--on' : '') },
)

/** Карточка выбора варианта (период, тариф, сервер). active — выбранная. */
export const OptionCard = pressable(
  'OptionCard',
  {
    period: 'bill-period',
    server: 'srv-row',
    auto: 'auto-card',
  },
  { active: (base) => (base === 'bill-period' ? 'bill-period--on' : 'is-active') },
)

const INPUT_VARIANTS = { auth: 'auth-input', chat: 'chat-field', plain: '' }

/** Однострочное поле. */
export const TextInput = forwardRef(function TextInput({ variant = 'auth', className = '', ...rest }, ref) {
  return <input ref={ref} className={cx(INPUT_VARIANTS[variant], className)} {...rest} />
})

/** Флажок; подпись — рядом, в label снаружи. */
export const Checkbox = forwardRef(function Checkbox({ className = '', ...rest }, ref) {
  return <input ref={ref} type="checkbox" className={cx('ui-check', className)} {...rest} />
})
