// Kill Switch без Брандмауэра Windows: разбор вывода netsh и план маршрутов (npm test).

const test = require('node:test')
const assert = require('node:assert/strict')

const { parseInterfaces, parseDefaultRoutes, pickNet, buildPlan, blockDeleteArgs } = require('../electron/route-guard')._internal

// Вывод с реального ПК: включён чужой VPN (happ-tun) и наш LiptonTUN.
const IFACES = `
Инд     Мет         MTU          Состояние               Имя
---  ----------  ----------  ------------  ---------------------------
  1          75  4294967295  connected     Loopback Pseudo-Interface 1
 16          65        1500  disconnected  Сетевое подключение Bluetooth
 33           0        1500  connected     happ-tun
 40           0        9000  connected     LiptonTUN
 11          25        1500  connected     Ethernet
 10          25        1500  connected     Ethernet 3
`
const ROUTES = `
Публикация  Тип      Мет  Префикс                    Инд  Имя шлюза/интерфейса
-------  --------  ---  ------------------------  ---  ------------------------
Нет      Вручную   0    0.0.0.0/0                  11  192.168.88.1
Нет      Вручную   0    0.0.0.0/0                  33  172.18.0.2
Нет      Вручную   0    0.0.0.0/0                  40  172.19.0.2
Нет      Система   256  127.0.0.0/8                 1  Loopback Pseudo-Interface 1
Нет      Система   256  192.168.56.0/24            10  Ethernet 3
`

test('route-guard: разбор интерфейсов и маршрутов по умолчанию', () => {
  const ifaces = parseInterfaces(IFACES)
  assert.deepEqual(ifaces.find(i => i.idx === 1), { idx: 1, metric: 75, name: 'Loopback Pseudo-Interface 1' })
  assert.equal(ifaces.length, 6)
  assert.deepEqual(parseDefaultRoutes(ROUTES).map(r => r.idx), [11, 33, 40])
})

test('route-guard: шлюз — физический адаптер, не VPN-туннели', () => {
  assert.deepEqual(pickNet(IFACES, ROUTES), { loopback: 1, gateway: { idx: 11, gw: '192.168.88.1' } })
  assert.deepEqual(pickNet(IFACES, ''), { loopback: 1, gateway: null })
})

test('route-guard: сначала исключения для серверов, потом маршруты «в никуда»', () => {
  const plan = buildPlan(['89.39.121.17', '77.88.8.8', '89.39.121.17', 'host.example', '2a00::1'], pickNet(IFACES, ROUTES))
  const add = plan.add.map(a => a.join(' '))
  assert.deepEqual(add, [
    'interface ipv4 add route 89.39.121.17/32 interface=11 nexthop=192.168.88.1 store=active',
    'interface ipv4 add route 77.88.8.8/32 interface=11 nexthop=192.168.88.1 store=active',
    'interface ipv4 add route 0.0.0.0/1 interface=1 store=active',
    'interface ipv4 add route 128.0.0.0/1 interface=1 store=active',
    'interface ipv6 add route ::/1 interface=1 store=active',
    'interface ipv6 add route 8000::/1 interface=1 store=active',
  ])
  // Снятие — в обратном порядке и теми же параметрами.
  assert.equal(plan.del[0].join(' '), 'interface ipv6 delete route 8000::/1 interface=1 store=active')
  assert.equal(plan.del.at(-1).join(' '), 'interface ipv4 delete route 89.39.121.17/32 interface=11 nexthop=192.168.88.1 store=active')
})

test('route-guard: без сети блокируем всё равно, без исключений', () => {
  const plan = buildPlan(['89.39.121.17'], { loopback: 1, gateway: null })
  assert.equal(plan.add.length, 4)
  assert.ok(plan.add.every(a => a.includes('interface=1')))
  assert.equal(blockDeleteArgs().length, 4)
})
