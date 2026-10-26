// Kill Switch: список адресов для remoteip у netsh (npm test).

const test = require('node:test')
const assert = require('node:assert/strict')

const fg = require('../electron/firewall-guard')

test('в правило не попадают служебные адреса, которые netsh не принимает', () => {
  const list = fg.buildBlockList(['89.39.121.17', '77.88.8.8'])
  const all = list.join(',')
  assert.ok(!all.includes('0.0.0.0'), 'нет 0.0.0.0/8')
  assert.ok(!list.includes('0:0:0:0:0:0:0:0'), 'нет «::» одиночным адресом')
  assert.ok(!/(^|,)2(4|5)\d\./.test(all), 'нет 240.0.0.0/4')
  assert.equal(list[0], '1.0.0.0-9.255.255.255')
})

test('серверы VPN и DNS остаются разрешёнными', () => {
  const list = fg.buildBlockList(['89.39.121.17', '77.88.8.8'])
  assert.ok(list.includes('77.88.8.9-89.39.121.16'))
  assert.ok(list.includes('89.39.121.18-126.255.255.255'))
  assert.ok(list.every(r => !r.startsWith('127.')), 'петля не блокируется')
})
