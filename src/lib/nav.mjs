// Навигация окна ПК: раздел из бокового меню + стек подэкранов поверх него.
// Чистый редьюсер (useReducer) — проверяется node --test (tests/renderer-lib.test.mjs).
//
// state = { page: 'home' | 'servers' | 'news' | 'settings', stack: [{ screen, params }] }
// Подэкраны (оплата, поддержка, проверка соединения, история…) открываются в
// области контента; Esc и «Назад» закрывают верхний.

export const PAGES = ['home', 'servers', 'news', 'settings']

export const initialNav = { page: 'home', stack: [] }

export function navReducer(state, action) {
  const s = state || initialNav
  switch (action?.type) {
    case 'go': {
      if (!PAGES.includes(action.page)) return s
      if (s.page === action.page && s.stack.length === 0) return s
      return { page: action.page, stack: [] }
    }
    case 'open': {
      if (!action.screen) return s
      const entry = { screen: action.screen, params: action.params || null }
      const top = s.stack[s.stack.length - 1]
      // тот же экран сверху — обновляем параметры, не плодим копии
      if (top && top.screen === entry.screen) return { ...s, stack: [...s.stack.slice(0, -1), entry] }
      // экран уже открыт ниже — возвращаемся к нему
      const idx = s.stack.findIndex(e => e.screen === entry.screen)
      if (idx >= 0) return { ...s, stack: [...s.stack.slice(0, idx), entry] }
      return { ...s, stack: [...s.stack, entry] }
    }
    case 'replace': {
      if (!action.screen) return s
      const entry = { screen: action.screen, params: action.params || null }
      return { ...s, stack: [...s.stack.slice(0, -1), entry] }
    }
    case 'back': {
      if (!s.stack.length) return s
      return { ...s, stack: s.stack.slice(0, -1) }
    }
    case 'close': {
      // закрыть конкретный экран (и всё, что открыто поверх него)
      const idx = s.stack.findIndex(e => e.screen === action.screen)
      if (idx < 0) return s
      return { ...s, stack: s.stack.slice(0, idx) }
    }
    case 'reset':
      return initialNav
    default:
      return s
  }
}

export function topScreen(state) {
  const st = state?.stack || []
  return st.length ? st[st.length - 1] : null
}
