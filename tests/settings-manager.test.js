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

test('оба файла битые: запись не затирает их настройками по умолчанию', () => {
  fs.writeFileSync(FILE, '{broken')
  fs.writeFileSync(FILE + '.bak', '{broken')
  sm.set('theme', 'light')
  assert.equal(fs.readFileSync(FILE, 'utf-8'), '{broken', 'основной файл не перезаписан')
})
