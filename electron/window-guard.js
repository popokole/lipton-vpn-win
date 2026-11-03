// Страховка окна от «чёрного экрана»: перерисовка после ресайза, перезагрузка
// интерфейса, если его процесс упал или GPU перезапустился, и запись причины в лог.
// Видели у пользователя: после растягивания окно целиком чёрное (два монитора,
// один — виртуальный spacedesk), а в логе только «Error sending from webFrameMain».

const REPAINT_DELAY_MS = 250
const RELOAD_WINDOW_MS = 60 * 1000
const MAX_RELOADS_PER_WINDOW = 3

/** Решает, можно ли ещё раз перезагрузить интерфейс: не больше N раз за минуту. */
function createReloadBudget({ max = MAX_RELOADS_PER_WINDOW, windowMs = RELOAD_WINDOW_MS, now = () => Date.now() } = {}) {
  let stamps = []
  return {
    take() {
      const t = now()
      stamps = stamps.filter(s => t - s < windowMs)
      if (stamps.length >= max) return false
      stamps.push(t)
      return true
    },
  }
}

function describe(details) {
  if (!details) return ''
  const { reason, exitCode, type, name } = details
  return [type, name, reason, exitCode != null ? `код ${exitCode}` : ''].filter(Boolean).join(', ')
}

/**
 * Подключает страховку к главному окну.
 * @param {import('electron').App} app
 * @param {import('electron').BrowserWindow} win
 */
function guardWindow(app, win, { log = console } = {}) {
  const wc = win.webContents
  const budget = createReloadBudget()
  let repaintTimer = null

  const alive = () => !win.isDestroyed() && !wc.isDestroyed()

  // После ресайза/перемещения просим перерисовать кадр: на некоторых драйверах
  // (виртуальные мониторы) окно иначе остаётся с пустым буфером.
  const scheduleRepaint = () => {
    clearTimeout(repaintTimer)
    repaintTimer = setTimeout(() => { if (alive()) wc.invalidate() }, REPAINT_DELAY_MS)
  }
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize', 'restore', 'show']) win.on(ev, scheduleRepaint)

  const reload = (why) => {
    if (!alive()) return
    if (!budget.take()) {
      log.error(`[Window] Интерфейс снова сломался (${why}) — больше не перезагружаем, слишком часто`)
      return
    }
    log.warn(`[Window] Перезагружаем интерфейс: ${why}`)
    wc.reload()
  }

  wc.on('render-process-gone', (_e, details) => {
    log.error(`[Window] Процесс интерфейса завершился: ${describe(details)}`)
    if (details?.reason !== 'clean-exit') reload('процесс интерфейса завершился')
  })
  wc.on('unresponsive', () => log.warn('[Window] Интерфейс не отвечает'))
  wc.on('responsive', () => log.log('[Window] Интерфейс снова отвечает'))
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (isMainFrame) log.error(`[Window] Не загрузился интерфейс: ${code} ${desc} ${url}`)
  })
  // Ошибки и предупреждения интерфейса — в app.log, чтобы их видела поддержка.
  wc.on('console-message', (_e, level, message, line, sourceId) => {
    if (level < 2 || /Electron Security Warning/.test(message)) return
    const src = sourceId ? ` (${String(sourceId).split('/').pop()}:${line})` : ''
    ;(level >= 3 ? log.error : log.warn)(`[Renderer] ${message}${src}`)
  })

  app.on('child-process-gone', (_e, details) => {
    if (details?.type !== 'GPU') return
    log.error(`[Window] Перезапуск GPU-процесса: ${describe(details)}`)
    // Chromium сам поднимает GPU заново; окно перерисовываем, а если не помогло — перезагружаем.
    setTimeout(() => {
      if (!alive()) return
      wc.invalidate()
      if (details.reason !== 'clean-exit') reload('перезапуск GPU-процесса')
    }, 500)
  })

  return { scheduleRepaint, reload }
}

module.exports = { guardWindow, createReloadBudget, describe }
