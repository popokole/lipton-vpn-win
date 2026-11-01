// Замер пинга: один адрес — один замер, лучший из нескольких, ограничение параллельности (npm test).

const test = require('node:test')
const assert = require('node:assert/strict')
const { measureServers } = require('../electron/ping-utils')

const srv = (id, address, port = 443, sni = 'a') => ({ id, address, port, sni })

test('одинаковые адреса меряются один раз и получают одно значение', async () => {
  const calls = []
  const list = [srv('de', '1.1.1.1'), srv('fr', '1.1.1.1'), srv('de2', '1.1.1.1'), srv('nl', '2.2.2.2')]
  const out = await measureServers(list, async s => { calls.push(s.address); return s.address === '1.1.1.1' ? 120 : 90 }, { samples: 1 })
  assert.deepEqual(out, { de: 120, fr: 120, de2: 120, nl: 90 })
  assert.equal(calls.length, 2)
})

test('берётся лучший из нескольких замеров, сбои пропускаются', async () => {
  const seq = [438, null, 124]
  const out = await measureServers([srv('de', '1.1.1.1')], async () => seq.shift())
  assert.equal(out.de, 124)
})

test('все замеры неудачные — null', async () => {
  const out = await measureServers([srv('x', '3.3.3.3')], async () => { throw new Error('timeout') })
  assert.equal(out.x, null)
})

test('одновременно не больше заданного числа адресов', async () => {
  let active = 0, peak = 0
  const list = Array.from({ length: 8 }, (_, i) => srv('s' + i, '10.0.0.' + i))
  await measureServers(list, async () => {
    active++; peak = Math.max(peak, active)
    await new Promise(r => setTimeout(r, 5))
    active--
    return 50
  }, { samples: 1, concurrency: 3 })
  assert.equal(peak, 3)
})

test('разный SNI на одном IP — разные адреса', async () => {
  let n = 0
  await measureServers([srv('a', '1.1.1.1', 443, 'x'), srv('b', '1.1.1.1', 443, 'y')], async () => { n++; return 1 }, { samples: 1 })
  assert.equal(n, 2)
})
