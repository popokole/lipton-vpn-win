import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

// Тема интерфейса: настройка 'dark' | 'light' | 'system' хранится в main
// (settings.theme → nativeTheme), фактическая тема — data-theme на <html>.
// Смена темы раскрывается кругом из нажатой кнопки за 1,6 с (View Transitions);
// при «уменьшить движение» — мгновенно.

const THEMES = ['dark', 'light', 'system']

function systemEffective() {
  try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark' }
  catch { return 'dark' }
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.motion === 'reduce'
  } catch { return false }
}

function applyEffective(effective) {
  document.documentElement.dataset.theme = effective === 'light' ? 'light' : 'dark'
}

export function useTheme() {
  const [state, setState] = useState(() => ({
    theme: 'system',
    effective: document.documentElement.dataset.theme || systemEffective(),
  }))
  const stateRef = useRef(state)
  stateRef.current = state

  const commit = useCallback((next) => {
    if (!next) return
    const theme = THEMES.includes(next.theme) ? next.theme : 'system'
    const effective = next.effective === 'light' || next.effective === 'dark'
      ? next.effective
      : (theme === 'system' ? systemEffective() : theme)
    applyEffective(effective)
    setState({ theme, effective })
  }, [])

  useEffect(() => {
    let alive = true
    const api = window.api
    if (api?.getTheme) {
      api.getTheme().then(s => { if (alive) commit(s) }).catch(() => {})
    } else {
      commit({ theme: 'system' })
    }
    const off = api?.onThemeUpdate?.(s => commit(s))
    // Запасной путь: системная тема сменилась, а события от main нет.
    let mq = null
    const onMq = () => {
      if (stateRef.current.theme === 'system') commit({ theme: 'system', effective: systemEffective() })
    }
    try {
      mq = window.matchMedia('(prefers-color-scheme: light)')
      mq.addEventListener('change', onMq)
    } catch {}
    return () => {
      alive = false
      off?.()
      try { mq?.removeEventListener('change', onMq) } catch {}
    }
  }, [commit])

  // setTheme(theme, event?) — event нужен, чтобы круг раскрывался из кнопки.
  const setTheme = useCallback(async (theme, event) => {
    const api = window.api
    const save = async () => {
      let res = null
      try { res = await api?.setTheme?.(theme) } catch {}
      return res || { theme, effective: theme === 'system' ? systemEffective() : theme }
    }

    if (reducedMotion() || typeof document.startViewTransition !== 'function') {
      commit(await save())
      return
    }

    const r = event?.currentTarget?.getBoundingClientRect?.()
    const x = r ? r.left + r.width / 2 : (event?.clientX ?? window.innerWidth / 2)
    const y = r ? r.top + r.height / 2 : (event?.clientY ?? window.innerHeight / 2)
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))

    const transition = document.startViewTransition(async () => {
      const res = await save()
      flushSync(() => commit(res))
    })
    try {
      await transition.ready
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 1600, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      )
    } catch {}
  }, [commit])

  return { theme: state.theme, effective: state.effective, setTheme }
}
