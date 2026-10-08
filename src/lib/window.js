import { useCallback, useEffect, useState } from 'react'

// Окно развёрнуто? Нужен заголовку (иконка кнопки) и рамке окна.
export function useWindowMaximized() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const api = window.api
    api?.isMaximized?.().then(v => setMaximized(!!v)).catch(() => {})
    const off = api?.onMaximizedChange?.(v => setMaximized(!!v))
    return () => off?.()
  }, [])

  const toggle = useCallback(() => {
    const api = window.api
    if (!api?.toggleMaximize) return
    api.toggleMaximize().then(v => setMaximized(!!v)).catch(() => {})
  }, [])

  return [maximized, toggle]
}

// Анимации на паузу, когда окно скрыто в трей или свёрнуто.
export function usePauseWhenHidden() {
  useEffect(() => {
    let ipcVisible = true
    const update = () => {
      const hidden = document.visibilityState === 'hidden' || !ipcVisible
      document.documentElement.toggleAttribute('data-paused', hidden)
    }
    const api = window.api
    api?.isWindowVisible?.().then(v => { ipcVisible = v !== false; update() }).catch(() => {})
    const off = api?.onWindowVisibility?.(v => { ipcVisible = v; update() })
    document.addEventListener('visibilitychange', update)
    update()
    return () => {
      off?.()
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
}

// Esc — закрыть верхний подэкран (если фокус не в поле ввода с текстом).
export function useEscape(handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      // В поле с текстом Esc не закрывает экран (например, недописанное сообщение в чате).
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.value) return
      handler(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handler, enabled])
}
