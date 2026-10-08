// Стекло: полупрозрачная плитка с обводкой, бликом и размытием фона.
// Tile — стеклянная плитка бенто с шапкой «иконка · подпись · мета».

export function Glass({ as: Tag = 'div', variant, edge = false, className = '', children, ...rest }) {
  const cls = ['ui-glass', variant ? `ui-glass--${variant}` : '', edge ? 'ui-glass--edge' : '', className]
    .filter(Boolean).join(' ')
  return <Tag className={cls} {...rest}>{children}</Tag>
}

export function Tile({ icon, title, meta, edge = false, className = '', children, index, style, ...rest }) {
  const st = index != null ? { ...(style || {}), '--i': index } : style
  return (
    <Glass edge={edge} className={`ui-tile${index != null ? ' ui-rise' : ''} ${className}`} style={st} {...rest}>
      {(title || meta) && (
        <div className="ui-tile-head">
          <span className="ui-tile-title">{icon}{title && <span>{title}</span>}</span>
          {meta != null && <span className="ui-tile-meta">{meta}</span>}
        </div>
      )}
      {children}
    </Glass>
  )
}

export default Glass
