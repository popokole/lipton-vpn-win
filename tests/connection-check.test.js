// Юнит-тесты «Проверки соединения» (npm test). Сеть и DNS — подставные,
// реальных запросов нет.

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  runConnectionCheck, parseTrace, countryName, isCloudflareIp,
  TRACE_URLS, IPV6_URLS, DNS_WHOAMI_HOST,
} = require('../electron/connection-check')

const trace = (ip, loc) => `fl=123\nh=chatgpt.com\nip=${ip}\nts=1\nvisit_scheme=https\nuag=x\ncolo=FRA\nhttp=http/2\nloc=${loc}\ntls=TLSv1.3\nwarp=off\n`

// Подставная сеть: map url → строка ответа или Error.
function fakeNet(map) {
  const calls = []
  const fetchText = async (url) => {
    calls.push(url)
    const v = map[url]
    if (v instanceof Error) throw v
    if (v === undefined) throw new Error('net::ERR_NAME_NOT_RESOLVED')
    return v
  }
  return { fetchText, calls }
}
const lookupOk = ip => async host => { assert.equal(host, DNS_WHOAMI_HOST); return ip }
const lookupFail = async () => { throw new Error('ENOTFOUND') }

const healthy = {
  [TRACE_URLS.chatgpt]: trace('203.0.113.221', 'DE'),
  [TRACE_URLS.cloudflare]: trace('203.0.113.221', 'DE'),
}

const item = (r, id) => r.items.find(i => i.id === id)

test('parseTrace: ip и loc из ответа /cdn-cgi/trace', () => {
  assert.deepEqual(parseTrace(trace('1.2.3.4', 'nl')), { ip: '1.2.3.4', loc: 'NL', colo: 'FRA' })
  assert.deepEqual(parseTrace('мусор'), { ip: '', loc: '', colo: '' })
  assert.equal(parseTrace('ip=999.1.1.1\nloc=DE').ip, '')
})

test('countryName: по-русски, с запасной таблицей', () => {
  assert.equal(countryName('DE'), 'Германия')
  assert.equal(countryName('nl'), 'Нидерланды')
  assert.equal(countryName(''), 'неизвестно')
  assert.equal(countryName('XX'), 'не определена')
})

test('isCloudflareIp: резолверы 1.1.1.1 и чужие адреса', () => {
  assert.equal(isCloudflareIp('172.70.12.5'), true)
  assert.equal(isCloudflareIp('162.158.1.1'), true)
  assert.equal(isCloudflareIp('1.1.1.1'), true)
  assert.equal(isCloudflareIp('77.88.8.8'), false)
  assert.equal(isCloudflareIp('95.167.1.1'), false)
  assert.equal(isCloudflareIp('2a06:98c0::1'), false)
})

test('VPN не подключён — запросов нет, понятная подсказка', async () => {
  const n = fakeNet(healthy)
  const r = await runConnectionCheck({ status: 'disconnected', mode: 'tun', fetchText: n.fetchText, lookup: lookupFail })
  assert.equal(n.calls.length, 0)
  assert.equal(r.verdict.level, 'fail')
  assert.equal(r.verdict.title, 'VPN не подключён')
  assert.match(r.verdict.hints[0], /Подключитесь/)

  const r2 = await runConnectionCheck({ status: 'reconnecting', mode: 'tun', fetchText: n.fetchText, lookup: lookupFail })
  assert.equal(r2.verdict.title, 'VPN переподключается')
  assert.equal(n.calls.length, 0)
})

test('TUN, всё хорошо — «Всё в порядке», ChatGPT видит Германию', async () => {
  const n = fakeNet(healthy) // IPv6-адреса не отвечают
  const r = await runConnectionCheck({ status: 'connected', mode: 'tun', fetchText: n.fetchText, lookup: lookupOk('172.70.100.1') })
  assert.equal(r.verdict.level, 'ok')
  assert.equal(r.verdict.title, 'Всё в порядке')
  assert.deepEqual(r.verdict.hints, [])
  assert.equal(item(r, 'chatgpt').value, 'Германия')
  assert.equal(item(r, 'chatgpt').detail, 'IP 203.0.113.221')
  assert.equal(item(r, 'ipv6').value, 'Заблокирован')
  assert.equal(item(r, 'dns').value, 'Через VPN')
  // Проверены оба адреса IPv6, прежде чем считать его заблокированным.
  for (const u of IPV6_URLS) assert.ok(n.calls.includes(u))
})

test('ChatGPT видит Россию — проблема с подсказкой', async () => {
  const n = fakeNet({ ...healthy, [TRACE_URLS.chatgpt]: trace('95.1.2.3', 'RU') })
  const r = await runConnectionCheck({ status: 'connected', mode: 'tun', fetchText: n.fetchText, lookup: lookupOk('172.70.100.1') })
  assert.equal(r.verdict.level, 'fail')
  assert.equal(item(r, 'chatgpt').status, 'fail')
  assert.equal(item(r, 'chatgpt').value, 'Россия')
  assert.ok(r.verdict.hints.some(h => /ChatGPT видит Россию/.test(h)))
})

test('страна, где OpenAI не работает — просим выбрать другой сервер', async () => {
  const n = fakeNet({ [TRACE_URLS.chatgpt]: trace('1.2.3.4', 'HK'), [TRACE_URLS.cloudflare]: trace('1.2.3.4', 'HK') })
  const r = await runConnectionCheck({ status: 'connected', mode: 'tun', fetchText: n.fetchText, lookup: lookupOk('172.70.100.1') })
  assert.equal(r.verdict.level, 'fail')
  assert.ok(r.verdict.hints.some(h => /OpenAI не работает/.test(h)))
})

test('IPv6 отвечает — утечка', async () => {
  const n = fakeNet({ ...healthy, [IPV6_URLS[0]]: '2a00:1370:8000::1\n' })
  const r = await runConnectionCheck({ status: 'connected', mode: 'tun', fetchText: n.fetchText, lookup: lookupOk('172.70.100.1') })
  assert.equal(item(r, 'ipv6').status, 'fail')
  assert.equal(item(r, 'ipv6').detail, 'IP 2a00:1370:8000::1')
  assert.equal(r.verdict.level, 'fail')
  assert.ok(r.verdict.hints.some(h => /IPv6/.test(h)))
})

test('DNS провайдера в TUN — замечание и совет про кэш DNS', async () => {
  const n = fakeNet(healthy)
  const r = await runConnectionCheck({ status: 'connected', mode: 'tun', fetchText: n.fetchText, lookup: lookupOk('95.167.10.10') })
  assert.equal(item(r, 'dns').status, 'warn')
  assert.equal(r.verdict.level, 'warn')
  assert.ok(r.verdict.hints.some(h => /Очистить DNS кэш/.test(h)))
})

test('разные страны у ChatGPT и других сайтов — замечание', async () => {
  const n = fakeNet({ [TRACE_URLS.chatgpt]: trace('1.1.1.10', 'DE'), [TRACE_URLS.cloudflare]: trace('2.2.2.20', 'NL') })
  const r = await runConnectionCheck({ status: 'connected', mode: 'tun', fetchText: n.fetchText, lookup: lookupOk('172.70.100.1') })
  assert.equal(item(r, 'cloudflare').status, 'warn')
  assert.equal(r.verdict.level, 'warn')
  assert.ok(r.verdict.hints.some(h => /разные страны/.test(h)))
})

test('ChatGPT не отвечает — проблема', async () => {
  const n = fakeNet({ [TRACE_URLS.chatgpt]: new Error('net::ERR_CONNECTION_RESET'), [TRACE_URLS.cloudflare]: trace('1.2.3.4', 'DE') })
  const r = await runConnectionCheck({ status: 'connected', mode: 'tun', fetchText: n.fetchText, lookup: lookupOk('172.70.100.1') })
  assert.equal(item(r, 'chatgpt').status, 'fail')
  assert.equal(item(r, 'chatgpt').detail, 'net::ERR_CONNECTION_RESET')
  assert.equal(r.verdict.level, 'fail')
})

test('режим прокси: браузеры в порядке, но подсказка про «весь трафик»', async () => {
  const n = fakeNet(healthy)
  const r = await runConnectionCheck({ status: 'connected', mode: 'proxy', fetchText: n.fetchText, lookup: lookupOk('95.167.10.10') })
  assert.equal(r.verdict.level, 'warn')
  assert.equal(r.verdict.title, 'Браузеры защищены')
  assert.equal(item(r, 'dns').status, 'info') // DNS провайдера в режиме прокси — ожидаемо
  assert.equal(r.verdict.hints.length, 1)
  assert.match(r.verdict.hints[0], /голосовой ChatGPT, игры и часть приложений идут напрямую/)
  assert.match(r.verdict.hints[0], /VPN для всего трафика/)
})

test('зависший запрос не вешает проверку (таймаут)', async () => {
  const hang = () => new Promise(() => {})
  const r = await runConnectionCheck({ status: 'connected', mode: 'tun', fetchText: hang, lookup: hang, timeoutMs: 50 })
  assert.equal(item(r, 'chatgpt').status, 'fail')
  assert.equal(item(r, 'ipv6').status, 'ok') // не ответил = заблокирован
  assert.equal(r.verdict.level, 'fail')
})
