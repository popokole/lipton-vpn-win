const test = require('node:test')
const assert = require('node:assert')
const { EventEmitter } = require('node:events')
const { guardWindow, createReloadBudget, describe } = require('../electron/window-guard')

function fakeWindow() {
  const win = new EventEmitter()
  const wc = new EventEmitter()
  wc.reloads = 0
  wc.invalidates = 0
  wc.reload = () => { wc.reloads++ }
  wc.invalidate = () => { wc.invalidates++ }
  wc.isDestroyed = () => false
  win.webContents = wc
  win.isDestroyed = () => false
  return win
}
const quietLog = { log() {}, warn() {}, error() {} }

test('window-guard: не больше трёх перезагрузок в минуту', () => {
  let t = 0
  const b = createReloadBudget({ now: () => t })
  assert.deepStrictEqual([b.take(), b.take(), b.take(), b.take()], [true, true, true, false])
  t += 61_000
  assert.strictEqual(b.take(), true)
})

test('window-guard: упавший интерфейс перезагружается, штатный выход — нет', () => {
  const app = new EventEmitter()
  const win = fakeWindow()
  guardWindow(app, win, { log: quietLog })
  win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: -1 })
  win.webContents.emit('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 })
  assert.strictEqual(win.webContents.reloads, 1)
})

test('window-guard: ошибки интерфейса уходят в лог', () => {
  const app = new EventEmitter()
  const win = fakeWindow()
  const errors = []
  guardWindow(app, win, { log: { ...quietLog, error: (m) => errors.push(m) } })
  win.webContents.emit('console-message', {}, 3, 'TypeError: x is undefined', 12, 'file:///app/dist/assets/index.js')
  win.webContents.emit('console-message', {}, 1, 'info', 1, '')
  assert.strictEqual(errors.length, 1)
  assert.match(errors[0], /\[Renderer\] TypeError: x is undefined \(index\.js:12\)/)
})

test('window-guard: после ресайза окно перерисовывается один раз', async () => {
  const app = new EventEmitter()
  const win = fakeWindow()
  guardWindow(app, win, { log: quietLog })
  for (let i = 0; i < 5; i++) win.emit('resize')
  await new Promise(r => setTimeout(r, 400))
  assert.strictEqual(win.webContents.invalidates, 1)
})

test('window-guard: описание причины', () => {
  assert.strictEqual(describe({ type: 'GPU', reason: 'crashed', exitCode: 5 }), 'GPU, crashed, код 5')
})
