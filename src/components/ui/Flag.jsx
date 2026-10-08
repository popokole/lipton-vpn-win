import Icon from './Icon'

// Круглый флаг страны (flag-icons, квадратный вариант в круге). Без страны —
// глобус; для «Авто-баланса» — значок перемешивания в градиентном круге.
// code — ISO-код ('de', 'RU'); size — диаметр; glow — свечение цвета состояния.
export default function Flag({ code, size = 22, auto = false, glow = false, className = '' }) {
  const st = { width: size, height: size }
  if (auto) {
    return (
      <span className={`ui-flag ui-flag--auto ${className}`} style={st} aria-hidden="true">
        <Icon name="shuffle" size={Math.round(size * 0.55)} stroke={2.4} />
      </span>
    )
  }
  const c = String(code || '').toLowerCase()
  if (!/^[a-z]{2}$/.test(c)) {
    return (
      <span className={`ui-flag ui-flag--none ${className}`} style={st} aria-hidden="true">
        <Icon name="globe" size={Math.round(size * 0.6)} />
      </span>
    )
  }
  return <span className={`ui-flag fi fis fi-${c}${glow ? ' ui-flag--glow' : ''} ${className}`} style={st} aria-hidden="true" />
}
