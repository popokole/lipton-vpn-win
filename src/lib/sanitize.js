// Очистка HTML статей базы знаний перед вставкой в окно: только разметка
// текста (абзацы, заголовки, списки, ссылки https, картинки https, таблицы).
// Скрипты, стили, формы, обработчики и прочие атрибуты удаляются — статья не
// может ничего выполнить в окне приложения.

const ALLOWED = {
  P: [], H2: [], H3: [], H4: [], UL: [], OL: [], LI: [], STRONG: [], B: [], EM: [], I: [], U: [], S: [],
  A: ['href'], CODE: [], PRE: [], BLOCKQUOTE: [], BR: [], HR: [], IMG: ['src', 'alt'],
  TABLE: [], THEAD: [], TBODY: [], TR: [], TH: [], TD: [], SPAN: [], DIV: [], FIGURE: [], FIGCAPTION: [],
  SMALL: [], MARK: [], SUP: [], SUB: [],
}
// Удаляем вместе с содержимым.
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA',
  'SELECT', 'SVG', 'MATH', 'LINK', 'META', 'BASE', 'NOSCRIPT', 'TEMPLATE', 'VIDEO', 'AUDIO', 'CANVAS', 'FRAME', 'FRAMESET'])

const HTTPS = /^https:\/\/[^\s"'<>]+$/i

function clean(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 8) { child.remove(); continue } // комментарии
    if (child.nodeType !== 1) continue
    const tag = child.tagName.toUpperCase()
    if (DROP.has(tag)) { child.remove(); continue }
    const allowed = ALLOWED[tag]
    if (!allowed) {
      // неизвестный тег — оставляем только содержимое
      clean(child)
      child.replaceWith(...child.childNodes)
      continue
    }
    for (const attr of [...child.attributes]) {
      if (!allowed.includes(attr.name.toLowerCase())) child.removeAttribute(attr.name)
    }
    if (tag === 'A') {
      const href = child.getAttribute('href') || ''
      if (!HTTPS.test(href)) child.removeAttribute('href')
    }
    if (tag === 'IMG') {
      const src = child.getAttribute('src') || ''
      if (!HTTPS.test(src)) { child.remove(); continue }
      child.setAttribute('loading', 'lazy')
      child.setAttribute('referrerpolicy', 'no-referrer')
    }
    clean(child)
  }
}

export function sanitizeHtml(html) {
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(`<div>${String(html || '')}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return ''
  clean(root)
  return root.innerHTML
}
