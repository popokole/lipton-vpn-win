import { Component } from 'react'
import { ActionButton } from './components/ui/Pressables'

// Ошибка в интерфейсе не должна оставлять пустое чёрное окно: показываем
// сообщение с кнопкой перезагрузки, а саму ошибку пишем в консоль —
// главный процесс переносит её в app.log (electron/window-guard.js).

window.addEventListener('error', (e) => {
  console.error('[UI] Необработанная ошибка:', e.message, e.filename ? `${e.filename}:${e.lineno}` : '')
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[UI] Необработанный промис:', e.reason?.message || String(e.reason))
})

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[UI] Интерфейс упал:', error?.message || String(error), info?.componentStack?.split('\n').slice(0, 4).join(' ') || '')
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="ui-crash" role="alert">
        <h1 className="ui-h1">Что-то пошло не так</h1>
        <p>VPN продолжает работать. Перезагрузите окно — ошибка уже записана в логи для поддержки.</p>
        <ActionButton onClick={() => window.location.reload()}>Перезагрузить окно</ActionButton>
      </div>
    )
  }
}
