// Юнит-тесты хранения настроек (npm test): вход в аккаунт не должен теряться,
// если settings.json побился при обновлении (обрыв записи, файл занят).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lipton-settings-'))
process.env.LIPTON_DATA_DIR = dir
const sm = require('../electron/settings-manager')
const FILE = path.join(dir, 'settings.json')

test('атомарная запись и резервная копия', () => {
  sm.set('auth', { access: 'a', refresh: 'r1' })
  assert.equal(sm.get('auth').refresh, 'r1')
  assert.ok(fs.existsSync(FILE + '.bak'), 'есть резервная копия')
  assert.ok(!fs.existsSync(FILE + '.tmp'), 'временный файл убран')
})

test('обрезанный settings.json: вход берётся из резервной копии', () => {
  sm.set('auth', { access: 'a', refresh: 'r2' })
  fs.writeFileSync(FILE, '{"auth": {"access": "a", "ref') // обрыв записи
  assert.equal(sm.get('auth').refresh, 'r2')
  // Следующая запись чинит основной файл, не теряя вход.
  sm.set('theme', 'dark')
  const saved = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
  assert.equal(saved.auth.refresh, 'r2')
  assert.equal(saved.theme, 'dark')
})

const corruptFiles = () => fs.readdirSync(dir).filter(f => f.includes('.corrupt-'))
const clearCorrupt = () => corruptFiles().forEach(f => fs.unlinkSync(path.join(dir, f)))

test('оба файла битые: откладываются в *.corrupt-*, настройки снова сохраняются', () => {
  clearCorrupt()
  fs.writeFileSync(FILE, '{broken')
  fs.writeFileSync(FILE + '.bak', '{broken')
  sm.set('theme', 'light')
  assert.equal(sm.get('theme'), 'light')
  assert.equal(JSON.parse(fs.readFileSync(FILE, 'utf-8')).theme, 'light')
  assert.equal(corruptFiles().length, 2, 'битые файлы сохранены рядом')
})

test('оба файла забиты нулями (обрыв записи при выключении ПК): приложение не застревает', () => {
  clearCorrupt()
  fs.writeFileSync(FILE, Buffer.alloc(9776))
  fs.writeFileSync(FILE + '.bak', Buffer.alloc(9776))
  assert.equal(sm.get('auth'), undefined)
  sm.set('auth', { access: 'a', refresh: 'r3' })
  assert.equal(sm.get('auth').refresh, 'r3')
  assert.equal(JSON.parse(fs.readFileSync(FILE + '.bak', 'utf-8')).auth.refresh, 'r3')
})

test('миграция при битом основном файле берёт данные из резервной копии', () => {
  sm.set('auth', { access: 'a', refresh: 'r4' })
  const stored = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
  delete stored.settingsVersion
  fs.writeFileSync(FILE + '.bak', JSON.stringify(stored))
  fs.writeFileSync(FILE, Buffer.alloc(100))
  assert.deepEqual(sm.migrate(), ['tunMode→true', 'coreLegacy→true'])
  const saved = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
  assert.equal(saved.auth.refresh, 'r4', 'вход не потерян')
  assert.equal(saved.settingsVersion, sm.SETTINGS_VERSION)
})

test('файл занят антивирусом: ничего не откладывается и не перезаписывается', () => {
  clearCorrupt()
  sm.set('auth', { access: 'a', refresh: 'r5' })
  const before = fs.readFileSync(FILE, 'utf-8')
  const orig = fs.readFileSync
  fs.readFileSync = (file, ...rest) => {
    if (String(file).startsWith(FILE)) throw Object.assign(new Error('busy'), { code: 'EBUSY' })
    return orig(file, ...rest)
  }
  try {
    sm.set('theme', 'dark')
    assert.deepEqual(sm.migrate(), [])
  } finally {
    fs.readFileSync = orig
  }
  assert.equal(fs.readFileSync(FILE, 'utf-8'), before, 'файл не тронут')
  assert.equal(corruptFiles().length, 0)
})
