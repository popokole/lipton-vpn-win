// Статистика VPN для главной: итоги по дням, разбор потока clash_api /traffic,
// сессия (скорость, пинг). Запуск: npm test (node --test).
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createStats, dayKey, dayStart, normalizeDaily, addToDaily, pruneDaily, weekSeries, parseTrafficChunk,
  SPEED_POINTS, PING_POINTS,
} = require('../electron/vpn-stats')

// 8 октября 2026, 12:00 по местному времени
const NOW = new Date(2026, 9, 8, 12, 0, 0).getTime()
const DAY = 24 * 60 * 60 * 1000

test('итоги по дням: ключ дня, нормализация, сложение', () => {
  assert.equal(dayKey(NOW), '2026-10-08')
  assert.equal(dayKey(dayStart(NOW, -7)), '2026-10-01')
  assert.equal(new Date(dayStart(NOW)).getHours(), 0)

  // мусор из settings.json отбрасывается
  assert.deepEqual(normalizeDaily(null), {})
  assert.deepEqual(normalizeDaily([1, 2]), {})
  assert.deepEqual(
    normalizeDaily({ '2026-10-08': { up: 10, down: '20' }, 'bad': { up: 1 }, '2026-10-07': { up: -5, down: 0 }, '2026-10-06': 5 }),
    { '2026-10-08': { up: 10, down: 20 } },
  )

  const d = addToDaily(addToDaily({}, '2026-10-08', 100, 1000), '2026-10-08', 1, 2.6)
  assert.deepEqual(d, { '2026-10-08': { up: 101, down: 1003 } })
})

test('итоги по дням: храним 7 дней, неделя — от старого к сегодня', () => {
  const daily = {}
  for (let i = 0; i < 10; i++) daily[dayKey(dayStart(NOW, -i))] = { up: i, down: i * 10 }
  const kept = pruneDaily(daily, NOW)
  assert.equal(Object.keys(kept).length, 7)
  assert.ok(kept['2026-10-08'] && kept['2026-10-02'] && !kept['2026-10-01'])

  const week = weekSeries({ '2026-10-08': { up: 1, down: 2 }, '2026-10-05': { up: 10, down: 0 } }, NOW)
  assert.equal(week.length, 7)
  assert.equal(week[0].key, '2026-10-02')
  assert.equal(week[6].key, '2026-10-08')
  assert.equal(week[6].total, 3)
  assert.equal(week[3].total, 10)
  assert.equal(week[1].total, 0)
})

test('поток /traffic: строки JSON, куски режутся где угодно', () => {
  let p = parseTrafficChunk('', '{"up":10,"down":20}\n{"up":1')
  assert.deepEqual(p.samples, [{ up: 10, down: 20 }])
  assert.equal(p.rest, '{"up":1')
  p = parseTrafficChunk(p.rest, ',"down":2}\n\nмусор\n{"up":-3,"down":5}\n')
  assert.deepEqual(p.samples, [{ up: 1, down: 2 }, { up: 0, down: 5 }])
  assert.equal(p.rest, '')
  // бесконечная строка без перевода не копится
  assert.equal(parseTrafficChunk('', 'x'.repeat(70000)).rest, '')
})

test('сессия: байты, скорость, сохранение итогов дня раз в минуту и при остановке', () => {
  let t = NOW
  const saved = []
  const s = createStats({ now: () => t, load: () => ({ '2026-10-08': { up: 5, down: 50 } }), save: d => saved.push(d) })

  // до подключения — только итоги из настроек
  let snap = s.snapshot()
  assert.equal(snap.connectedAt, null)
  assert.equal(snap.live, false)
  assert.deepEqual(snap.today, { up: 5, down: 50 })

  s.addTraffic(100, 100) // без сессии не считается
  s.start(t)
  for (let i = 0; i < 40; i++) { t += 1000; s.addTraffic(1000, 8000) }
  snap = s.snapshot()
  assert.equal(snap.live, true)
  assert.deepEqual(snap.session, { up: 40000, down: 320000 })
  assert.deepEqual(snap.speed, { up: 1000, down: 8000 })
  assert.equal(snap.speedHistory.length, SPEED_POINTS)
  assert.deepEqual(snap.today, { up: 40005, down: 320050 })
  assert.equal(saved.length, 0) // минута ещё не прошла

  t += 30000
  // поток оборвался — «скорость сейчас» обнуляется
  assert.deepEqual(s.snapshot().speed, { up: 0, down: 0 })
  s.addTraffic(0, 0) // пустой сэмпл после минуты — сохранять нечего нового, но время пришло
  assert.equal(saved.length, 1)
  assert.deepEqual(saved[0]['2026-10-08'], { up: 40005, down: 320050 })

  s.addTraffic(1, 1)
  s.stop()
  assert.equal(saved.length, 2)
  assert.deepEqual(saved[1]['2026-10-08'], { up: 40006, down: 320051 })
  assert.equal(s.snapshot().connectedAt, null)
})

test('сессия: трафик после полуночи идёт в новый день', () => {
  let t = new Date(2026, 9, 8, 23, 59, 59).getTime()
  const s = createStats({ now: () => t })
  s.start(t)
  s.addTraffic(10, 10)
  t += 2000
  s.addTraffic(20, 20)
  const w = s.snapshot().week
  assert.equal(w[6].key, '2026-10-09')
  assert.equal(w[6].total, 40)
  assert.equal(w[5].total, 20)
})

test('сессия: пинг — последние замеры, null — нет ответа, новая сессия с нуля', () => {
  let t = NOW
  const s = createStats({ now: () => t })
  s.addPing(40) // без сессии не пишется
  s.start(t)
  for (let i = 0; i < PING_POINTS + 5; i++) { t += 60000; s.addPing(i % 10 === 0 ? null : 40 + (i % 3)) }
  let snap = s.snapshot()
  assert.equal(snap.pingHistory.length, PING_POINTS)
  assert.equal(snap.ping, snap.pingHistory.filter(p => p.ms != null).pop().ms)
  s.addPing(null)
  assert.notEqual(s.snapshot().ping, null) // последний удачный замер

  s.start(t + DAY)
  snap = s.snapshot()
  assert.deepEqual(snap.pingHistory, [])
  assert.equal(snap.ping, null)
  assert.deepEqual(snap.session, { up: 0, down: 0 })
})

test('сессия: запасное ядро без clash_api — live=false', () => {
  const s = createStats({ now: () => NOW })
  s.start(NOW, { live: false })
  const snap = s.snapshot()
  assert.equal(snap.connectedAt, NOW)
  assert.equal(snap.live, false)
})
