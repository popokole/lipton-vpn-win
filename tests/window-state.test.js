// Окно редизайна: тема, сохранённый размер/положение, иконки трея (npm test).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const ws = require('../electron/window-state')
const { makeLogoPng } = require('../electron/tray-icon')

const SCREEN = { x: 0, y: 0, width: 1920, height: 1040 }
const SECOND = { x: 1920, y: 0, width: 1280, height: 984 }

test('тема: только dark/light/system, иначе — по умолчанию', () => {
  assert.equal(ws.normalizeTheme('dark'), 'dark')
  assert.equal(ws.normalizeTheme('light'), 'light')
  assert.equal(ws.normalizeTheme('system'), 'system')
  assert.equal(ws.normalizeTheme(undefined), ws.DEFAULT_THEME)
  assert.equal(ws.normalizeTheme('Dark'), ws.DEFAULT_THEME)
  assert.equal(ws.normalizeTheme({}), ws.DEFAULT_THEME)
  assert.equal(ws.themeBackground('light'), '#F3F1EC')
  assert.equal(ws.themeBackground('dark'), '#050807')
  assert.equal(ws.themeBackground(undefined), '#050807')
})

test('окно: без сохранённого — 960×620 по центру', () => {
  const b = ws.sanitizeBounds(null, [SCREEN])
  assert.deepEqual(b, { width: 960, height: 620, maximized: false })
  assert.deepEqual(ws.sanitizeBounds('мусор', [SCREEN]), { width: 960, height: 620, maximized: false })
})

test('окно: размер не меньше минимального и не больше монитора', () => {
  const small = ws.sanitizeBounds({ width: 390, height: 620 }, [SCREEN])
  assert.equal(small.width, ws.MIN_SIZE.width)
  assert.equal(small.height, 620)
  assert.equal(ws.sanitizeBounds({ width: 1000, height: 300 }, [SCREEN]).height, ws.MIN_SIZE.height)
  const huge = ws.sanitizeBounds({ width: 5000, height: 4000 }, [SCREEN, SECOND])
  assert.equal(huge.width, 1920)
  assert.equal(huge.height, 1040)
  const nan = ws.sanitizeBounds({ width: NaN, height: 'x' }, [SCREEN])
  assert.equal(nan.width, 960)
  assert.equal(nan.height, 620)
})

test('окно: положение — только если заголовок виден на мониторе', () => {
  const ok = ws.sanitizeBounds({ x: 100, y: 80, width: 1000, height: 700 }, [SCREEN])
  assert.equal(ok.x, 100)
  assert.equal(ok.y, 80)
  // второй монитор отключили — окно было на нём
  const gone = ws.sanitizeBounds({ x: 2200, y: 100, width: 960, height: 620 }, [SCREEN])
  assert.equal(gone.x, undefined)
  assert.equal(gone.y, undefined)
  // на втором мониторе — оставляем
  const second = ws.sanitizeBounds({ x: 2200, y: 100, width: 960, height: 620 }, [SCREEN, SECOND])
  assert.equal(second.x, 2200)
  // заголовок ушёл выше экрана
  const above = ws.sanitizeBounds({ x: 100, y: -300, width: 960, height: 620 }, [SCREEN])
  assert.equal(above.x, undefined)
  // виден лишь краешек (меньше 120 px)
  const edge = ws.sanitizeBounds({ x: 1850, y: 100, width: 960, height: 620 }, [SCREEN])
  assert.equal(edge.x, undefined)
})

test('окно: флаг «развёрнуто» и формат сохранения', () => {
  assert.equal(ws.sanitizeBounds({ maximized: true }, [SCREEN]).maximized, true)
  assert.equal(ws.sanitizeBounds({ maximized: 'yes' }, [SCREEN]).maximized, false)
  assert.deepEqual(
    ws.boundsToSave({ x: 10.4, y: 20.6, width: 1000, height: 700 }, true),
    { x: 10, y: 21, width: 1000, height: 700, maximized: true },
  )
  assert.deepEqual(ws.boundsToSave(null, false), { x: null, y: null, width: 960, height: 620, maximized: false })
})

function pngSize(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

test('трей: знак-логотип PNG 16 и 32 px для всех состояний', () => {
  for (const st of ['connected', 'disconnected', 'kill-switch', 'неизвестно']) {
    for (const size of [16, 32]) {
      const png = makeLogoPng(size, st)
      assert.deepEqual(pngSize(png), { w: size, h: size })
    }
  }
  // разные состояния — разные картинки
  assert.notDeepEqual(makeLogoPng(16, 'connected'), makeLogoPng(16, 'disconnected'))
})

test('настройки: тема и размер окна — новые ключи без смены версии схемы', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lipton-settings-'))
  try {
    // Старый settings.json версии 2 без новых ключей — получает значения по умолчанию,
    // миграция ничего не перезаписывает (токены и подписки целы).
    const file = path.join(dir, 'settings.json')
    fs.writeFileSync(file, JSON.stringify({ settingsVersion: 2, tunMode: false, auth: { access: 'x' } }))
    const script = `
      const sm = require(${JSON.stringify(path.join(__dirname, '..', 'electron', 'settings-manager.js'))})
      const applied = sm.migrate()
      const all = sm.getAll()
      sm.set('theme', 'light')
      process.stdout.write(JSON.stringify({ applied, version: sm.SETTINGS_VERSION, theme: all.theme,
        bounds: all.windowBounds, tun: all.tunMode, auth: all.auth, after: sm.get('theme') }))
    `
    const out = JSON.parse(execFileSync(process.execPath, ['-e', script], {
      env: { ...process.env, LIPTON_DATA_DIR: dir }, encoding: 'utf-8',
    }))
    assert.deepEqual(out.applied, [])
    assert.equal(out.version, 2)
    assert.equal(out.theme, ws.DEFAULT_THEME)
    assert.equal(out.bounds, null)
    assert.equal(out.tun, false)
    assert.deepEqual(out.auth, { access: 'x' })
    assert.equal(out.after, 'light')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
