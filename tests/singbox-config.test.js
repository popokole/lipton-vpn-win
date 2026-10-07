// Юнит-тесты генератора конфига sing-box (npm test).
// Ядро запускается только как «sing-box check» и в режиме локального прокси
// на случайных портах — TUN, маршруты, системный прокси и брандмауэр не трогаются.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const net = require('net')
const http = require('http')
const { execFileSync, spawn } = require('child_process')

const { parseUri, pingAll } = require('../electron/subscription-manager')
const {
  generateSingboxConfig, configKey, UnsupportedServerError, FORCE_PROXY_DOMAINS, LOCAL_ZONES,
} = require('../electron/singbox-config')
const { buildBlockList, _internal: ipx } = require('../electron/firewall-guard')

const SB_DIR = path.join(__dirname, '..', 'resources', 'sing-box')
const SB_EXE = path.join(SB_DIR, 'sing-box.exe')
const RULES_DIR = path.join(SB_DIR, 'rules')
const HAS_SB = process.platform === 'win32' && fs.existsSync(SB_EXE)

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lipton-sb-test-'))
test.after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }) } catch {} })

// ─── Фикстуры (фиктивные uuid / ключи) ───────────────────────────────────────

const PBK = 'FrRbF2eqMdT8xOSY14OoHbWvkoZKIUcrP0QlAoDe45E'
const LINKS = {
  reality: `vless://11111111-2222-4333-8444-555555555555@nl1.example.com:443?type=tcp&security=reality&flow=xtls-rprx-vision&sni=www.example.org&pbk=${PBK}&sid=2861a2cf90a7725e&fp=firefox#%F0%9F%87%B3%F0%9F%87%B1%20NL-1`,
  reality2: `vless://11111111-2222-4333-8444-666666666666@203.0.113.17:8443?type=tcp&security=reality&flow=xtls-rprx-vision&sni=www.example.net&pbk=${PBK}&sid=ab&fp=chrome#Auto`,
  realityBadFp: `vless://11111111-2222-4333-8444-777777777777@de.example.com:443?type=tcp&security=reality&sni=a.example&pbk=${PBK}&fp=qqbrowser#DE`,
  wsTls: 'vless://11111111-2222-4333-8444-888888888888@ws.example.com:443?type=ws&security=tls&sni=ws.example.com&host=cdn.example.com&path=%2Fws&alpn=h2,http/1.1&fp=chrome#WS',
  grpc: 'vless://11111111-2222-4333-8444-999999999999@grpc.example.com:443?type=grpc&security=tls&serviceName=svc&sni=grpc.example.com#gRPC',
  trojan: 'trojan://secretpass@tr.example.com:443?security=tls&sni=tr.example.com&type=tcp#Trojan',
  vmess: 'vmess://' + Buffer.from(JSON.stringify({
    v: '2', ps: 'VMess', add: 'vm.example.com', port: '443', id: '11111111-2222-4333-8444-aaaaaaaaaaaa',
    aid: '0', scy: 'auto', net: 'ws', type: 'none', host: 'vm.example.com', path: '/vm', tls: 'tls', sni: 'vm.example.com',
  })).toString('base64'),
  xhttp: 'vless://11111111-2222-4333-8444-bbbbbbbbbbbb@x.example.com:443?type=xhttp&security=reality&sni=x.example&pbk=' + PBK + '#XHTTP',
}

const servers = Object.fromEntries(Object.entries(LINKS).map(([k, v]) => [k, parseUri(v)]))
const ALL = Object.values(servers)

function gen(opts = {}) {
  return generateSingboxConfig(ALL, { mode: 'tun', selectedId: servers.reality.id, rulesDir: RULES_DIR, ...opts })
}

function findRule(config, pred) {
  return config.route.rules.findIndex(pred)
}

function writeConfig(name, config) {
  const p = path.join(TMP, name)
  fs.writeFileSync(p, JSON.stringify(config, null, 2))
  return p
}

function singboxCheck(file) {
  try {
    execFileSync(SB_EXE, ['check', '-c', file, '-D', TMP], { stdio: 'pipe', windowsHide: true, timeout: 30000 })
    return ''
  } catch (e) {
    return String(e.stderr || e.stdout || e.message)
  }
}

// ─── Парсинг ссылок ─────────────────────────────────────────────────────────

test('ссылки подписки распарсены', () => {
  for (const [k, s] of Object.entries(servers)) assert.ok(s, `не распарсилась ${k}`)
  assert.equal(servers.reality.flow, 'xtls-rprx-vision')
  assert.equal(servers.reality.pbk, PBK)
})

// ─── TUN ────────────────────────────────────────────────────────────────────

test('TUN: inbound, auto_route, strict_route, IPv6-адрес, auto_detect_interface', () => {
  const { config } = gen()
  assert.equal(config.inbounds.length, 1)
  const tun = config.inbounds[0]
  assert.equal(tun.type, 'tun')
  assert.equal(tun.auto_route, true)
  assert.equal(tun.strict_route, true)
  assert.equal(tun.stack, 'mixed')
  assert.ok(tun.address.some(a => a.includes(':')), 'нужен IPv6-адрес на TUN')
  assert.ok(tun.address.some(a => /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(a)))
  assert.equal(config.route.auto_detect_interface, true)
  assert.equal(config.route.final, 'proxy')
})

test('TUN: режим совместимости отключает strict_route', () => {
  assert.equal(gen({ strictRoute: false }).config.inbounds[0].strict_route, false)
})

test('DNS: ipv4_only, DoH через туннель, РФ — напрямую', () => {
  const { config } = gen()
  assert.equal(config.dns.strategy, 'ipv4_only')
  assert.equal(config.dns.final, 'dns-remote')
  const remote = config.dns.servers.find(s => s.tag === 'dns-remote')
  assert.equal(remote.type, 'https')
  assert.equal(remote.detour, 'proxy')
  const direct = config.dns.servers.find(s => s.tag === 'dns-direct')
  assert.equal(direct.type, 'udp')
  assert.equal(config.dns.rules[0].server, 'dns-remote')
  assert.deepEqual(config.dns.rules[0].domain_suffix, FORCE_PROXY_DOMAINS)
  assert.ok(config.dns.rules.some(r => r.rule_set?.includes('geosite-ru') && r.server === 'dns-direct'))
  assert.equal(config.route.default_domain_resolver.server, 'dns-direct')
})

test('маршруты: sniff → hijack-dns → IPv6 reject → … → QUIC reject', () => {
  const { config } = gen()
  const sniff = findRule(config, r => r.action === 'sniff')
  const hijack = findRule(config, r => r.action === 'hijack-dns')
  const v6 = findRule(config, r => r.ip_version === 6 && r.action === 'reject')
  const quic = findRule(config, r => r.protocol === 'quic' && r.action === 'reject')
  assert.equal(sniff, 0)
  assert.ok(hijack > sniff)
  assert.ok(v6 > hijack)
  assert.equal(quic, config.route.rules.length - 1)
  const h = config.route.rules[hijack]
  assert.deepEqual(h.rules, [{ protocol: 'dns' }, { port: 53 }])
})

test('обход РФ: rule_set локальные, бинарные, файлы существуют', () => {
  const { config } = gen()
  const sets = config.route.rule_set
  assert.equal(sets.length, 2)
  for (const rs of sets) {
    assert.equal(rs.type, 'local')
    assert.equal(rs.format, 'binary')
    assert.ok(path.isAbsolute(rs.path))
    assert.ok(fs.existsSync(rs.path), `нет файла ${rs.path}`)
  }
  assert.ok(config.route.rules.some(r => r.rule_set?.includes('geosite-ru') && r.outbound === 'direct'))
  assert.ok(config.route.rules.some(r => r.rule_set?.includes('geoip-ru') && r.outbound === 'direct'))
  assert.ok(config.route.rules.some(r => r.domain_suffix?.includes('ru') && r.outbound === 'direct'))
})

test('ИИ-сервисы → proxy выше пользовательских доменов; ChatGPT нельзя увести в обход', () => {
  const { config } = gen({ bypassDomains: ['example.ru', 'domain:My-Site.com', 'https://chatgpt.com/', 'api.openai.com', ''] })
  const ai = findRule(config, r => r.outbound === 'proxy' && r.domain_suffix?.includes('chatgpt.com'))
  const user = findRule(config, r => r.outbound === 'direct' && r.domain_suffix?.includes('my-site.com'))
  assert.ok(ai >= 0 && user > ai)
  const userRule = config.route.rules[user]
  assert.deepEqual(userRule.domain_suffix, ['example.ru', 'my-site.com'])
  // Оплата — напрямую
  assert.ok(config.route.rules.some(r => r.outbound === 'direct' && r.domain_suffix?.includes('yookassa.ru')))
  // 2ip больше не в обходе
  assert.ok(!JSON.stringify(config).includes('2ip'))
})

test('обход РФ выключен: нет rule_set, свои домены и оплата всё равно напрямую', () => {
  const { config } = gen({ bypassRu: false, bypassDomains: ['corp.example'] })
  assert.equal(config.route.rule_set, undefined)
  assert.ok(!JSON.stringify(config.route.rules).includes('geoip-ru'))
  assert.ok(!config.dns.rules.some(r => r.rule_set))
  assert.ok(config.route.rules.some(r => r.outbound === 'direct' && r.domain_suffix?.includes('corp.example')))
  assert.ok(config.route.rules.some(r => r.outbound === 'direct' && r.domain_suffix?.includes('yoomoney.ru')))
})

test('служебные хосты (API, подписка) — напрямую и через dns-direct, ИИ туда не увести', () => {
  const { config } = gen({ directDomains: ['liptonone.online', 'https://sub.example.net/abc', 'chatgpt.com', 'yookassa.ru'] })
  const direct = config.route.rules.find(r => r.outbound === 'direct' && r.domain_suffix?.includes('yookassa.ru'))
  assert.deepEqual(direct.domain_suffix, ['yookassa.ru', 'yoomoney.ru', 'liptonone.online', 'sub.example.net'])
  const ai = findRule(config, r => r.outbound === 'proxy' && r.domain_suffix?.includes('chatgpt.com'))
  assert.ok(ai >= 0 && ai < config.route.rules.indexOf(direct))
  const dnsRule = config.dns.rules.find(r => r.domain_suffix?.includes('liptonone.online'))
  assert.equal(dnsRule.server, 'dns-direct')
  assert.ok(!dnsRule.domain_suffix.includes('chatgpt.com'))
  // без служебных хостов — только оплата
  const plain = gen().config.route.rules.find(r => r.outbound === 'direct' && r.domain_suffix?.includes('yookassa.ru'))
  assert.deepEqual(plain.domain_suffix, ['yookassa.ru', 'yoomoney.ru'])
})

test('DNS: локальные зоны, имена без точки и свои домены — системным DNS (dns-local)', () => {
  const { config } = gen({ bypassDomains: ['intranet.company.ru'] })
  const local = config.dns.servers.find(s => s.tag === 'dns-local')
  assert.deepEqual(local, { type: 'local', tag: 'dns-local' })
  assert.ok(config.dns.rules.some(r => r.server === 'dns-local' && r.domain_suffix?.includes('lan') && r.domain_suffix.includes('home.arpa')))
  assert.ok(config.dns.rules.some(r => r.server === 'dns-local' && r.domain_regex?.includes('^[^.]+$')))
  const user = config.dns.rules.findIndex(r => r.domain_suffix?.includes('intranet.company.ru'))
  assert.equal(config.dns.rules[user].server, 'dns-local')
  // свои домены резолвятся раньше правила РФ (иначе .ru ушёл бы на 77.88.8.8)
  const ru = config.dns.rules.findIndex(r => r.rule_set?.includes('geosite-ru'))
  assert.ok(user < ru)
  // ИИ-сервисы — по-прежнему первым правилом через туннель
  assert.equal(config.dns.rules[0].server, 'dns-remote')
  // локальные зоны — напрямую
  assert.ok(config.route.rules.some(r => r.outbound === 'direct' && r.domain_suffix?.includes('local')))
  // адреса серверов VPN — по-прежнему через 77.88.8.8 (он разрешён правилом Kill Switch)
  assert.equal(config.route.default_domain_resolver.server, 'dns-direct')
})

// ─── Outbound'ы ─────────────────────────────────────────────────────────────

test('VLESS Reality Vision: поля uuid/flow/sni/pbk/sid/fp/порт', () => {
  const { config, tags } = gen()
  const ob = config.outbounds.find(o => o.tag === tags[servers.reality.id])
  assert.equal(ob.type, 'vless')
  assert.equal(ob.server, 'nl1.example.com')
  assert.equal(ob.server_port, 443)
  assert.equal(ob.uuid, servers.reality.uuid)
  assert.equal(ob.flow, 'xtls-rprx-vision')
  assert.equal(ob.packet_encoding, 'xudp')
  assert.equal(ob.tls.server_name, 'www.example.org')
  assert.deepEqual(ob.tls.utls, { enabled: true, fingerprint: 'firefox' })
  assert.deepEqual(ob.tls.reality, { enabled: true, public_key: PBK, short_id: '2861a2cf90a7725e' })
  assert.equal(ob.transport, undefined)
  const ob2 = config.outbounds.find(o => o.tag === tags[servers.reality2.id])
  assert.equal(ob2.server, '203.0.113.17')
  assert.equal(ob2.server_port, 8443)
  // неизвестный fp → chrome
  const ob3 = config.outbounds.find(o => o.tag === tags[servers.realityBadFp.id])
  assert.equal(ob3.tls.utls.fingerprint, 'chrome')
})

test('WS/gRPC/Trojan/VMess поддержаны, xhttp пропущен', () => {
  const { config, tags, skipped } = gen()
  const ws = config.outbounds.find(o => o.tag === tags[servers.wsTls.id])
  assert.deepEqual(ws.transport, { type: 'ws', path: '/ws', headers: { Host: 'cdn.example.com' } })
  assert.deepEqual(ws.tls.alpn, ['h2', 'http/1.1'])
  const grpc = config.outbounds.find(o => o.tag === tags[servers.grpc.id])
  assert.deepEqual(grpc.transport, { type: 'grpc', service_name: 'svc' })
  const tr = config.outbounds.find(o => o.tag === tags[servers.trojan.id])
  assert.equal(tr.type, 'trojan')
  assert.equal(tr.password, 'secretpass')
  assert.equal(tr.tls.enabled, true)
  const vm = config.outbounds.find(o => o.tag === tags[servers.vmess.id])
  assert.equal(vm.type, 'vmess')
  assert.equal(vm.transport.type, 'ws')
  assert.equal(tags[servers.xhttp.id], undefined)
  assert.equal(skipped.length, 1)
  assert.match(skipped[0].reason, /xhttp/)
})

test('selector: все серверы, выбранный по умолчанию, обрыв старых соединений при смене', () => {
  const { config, tags, selectedTag } = gen({ selectedId: servers.grpc.id })
  const sel = config.outbounds.find(o => o.tag === 'proxy')
  assert.equal(sel.type, 'selector')
  assert.equal(sel.default, tags[servers.grpc.id])
  assert.equal(selectedTag, sel.default)
  assert.equal(sel.interrupt_exist_connections, true)
  assert.equal(sel.outbounds.length, ALL.length - 1)
  assert.ok(config.outbounds.some(o => o.tag === 'direct' && o.type === 'direct'))
})

test('configKey не зависит от выбранного сервера и clash_api', () => {
  const a = gen({ selectedId: servers.reality.id, clashApi: { port: 1111, secret: 'a' } }).config
  const b = gen({ selectedId: servers.trojan.id, clashApi: { port: 2222, secret: 'b' } }).config
  const c = gen({ selectedId: servers.trojan.id, bypassRu: false }).config
  assert.equal(configKey(a), configKey(b))
  assert.notEqual(configKey(a), configKey(c))
})

test('неподдерживаемый выбранный сервер — понятная ошибка', () => {
  assert.throws(() => gen({ selectedId: servers.xhttp.id }), UnsupportedServerError)
  assert.throws(() => generateSingboxConfig([servers.xhttp], { mode: 'tun' }), UnsupportedServerError)
})

// ─── Proxy ──────────────────────────────────────────────────────────────────

test('proxy: mixed на 127.0.0.1:10809, без TUN-опций, resolve перед geoip-ru', () => {
  const { config } = gen({ mode: 'proxy' })
  assert.deepEqual(config.inbounds, [{ type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 10809 }])
  assert.equal(config.route.auto_detect_interface, undefined)
  const resolve = findRule(config, r => r.action === 'resolve' && !r.domain_suffix)
  const geoip = findRule(config, r => r.rule_set?.includes('geoip-ru'))
  assert.ok(resolve >= 0 && geoip > resolve)
  // свои домены и локальные имена — резолв системным DNS перед direct
  const { config: c2 } = gen({ mode: 'proxy', bypassDomains: ['corp.example'] })
  const lr = findRule(c2, r => r.action === 'resolve' && r.server === 'dns-local')
  const user = findRule(c2, r => r.outbound === 'direct' && r.domain_suffix?.includes('corp.example'))
  assert.ok(lr >= 0 && user > lr)
  assert.deepEqual(c2.route.rules[lr].domain_suffix, [...LOCAL_ZONES, 'corp.example'])
  // в TUN такого правила нет — у соединения уже IP
  assert.equal(findRule(gen({ bypassDomains: ['corp.example'] }).config, r => r.action === 'resolve'), -1)
  assert.ok(findRule(config, r => r.ip_version === 6 && r.action === 'reject') >= 0)
  assert.equal(config.dns.strategy, 'ipv4_only')
})

// ─── sing-box check ─────────────────────────────────────────────────────────

const CHECK_CASES = {
  'tun-bypass': { mode: 'tun', directDomains: ['liptonone.online', 'sub.example.net'], bypassDomains: ['corp.example'] },
  'tun-nobypass': { mode: 'tun', bypassRu: false, bypassDomains: ['corp.example'] },
  'tun-compat': { mode: 'tun', strictRoute: false },
  'proxy-bypass': { mode: 'proxy', bypassDomains: ['example.ru'], directDomains: ['liptonone.online'], clashApi: { port: 19999, secret: 's' } },
  'proxy-nobypass': { mode: 'proxy', bypassRu: false },
}
for (const [name, opts] of Object.entries(CHECK_CASES)) {
  test(`sing-box check: ${name}`, { skip: !HAS_SB && 'нет resources/sing-box/sing-box.exe' }, () => {
    const file = writeConfig(`${name}.json`, gen(opts).config)
    const err = singboxCheck(file)
    assert.equal(err, '', err)
  })
}

// ─── Запуск в режиме локального прокси (случайные порты, без системного прокси) ─

function freePort() {
  return new Promise(resolve => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
  })
}

function clash(port, secret, method, p, body) {
  return new Promise(resolve => {
    const data = body ? JSON.stringify(body) : null
    const req = http.request({
      host: '127.0.0.1', port, path: p, method, timeout: 8000,
      headers: { Authorization: `Bearer ${secret}`, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    }, res => { let b = ''; res.on('data', c => { b += c }); res.on('end', () => resolve({ status: res.statusCode, body: b })) })
    req.on('error', () => resolve({ status: 0 }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0 }) })
    if (data) req.write(data)
    req.end()
  })
}

test('proxy: ядро стартует, clash_api отвечает, selector переключается', { skip: !HAS_SB && 'нет sing-box.exe', timeout: 40000 }, async () => {
  const [mixedPort, apiPort] = [await freePort(), await freePort()]
  const secret = 'test-' + Date.now()
  // Нерабочие адреса серверов — проверяем только управление ядром.
  const fake = [servers.reality, servers.reality2].map((s, i) => ({ ...s, address: '127.0.0.1', port: 9 + i }))
  const { config, tags } = generateSingboxConfig(fake, {
    mode: 'proxy', httpPort: mixedPort, rulesDir: RULES_DIR, clashApi: { port: apiPort, secret },
  })
  const file = writeConfig('run-proxy.json', config)
  const proc = spawn(SB_EXE, ['run', '-c', file, '-D', TMP], { stdio: 'ignore', windowsHide: true })
  try {
    let up = false
    for (let i = 0; i < 60 && !up; i++) {
      up = (await clash(apiPort, secret, 'GET', '/version')).status === 200
      if (!up) await new Promise(r => setTimeout(r, 250))
    }
    assert.ok(up, 'clash_api не поднялся')
    assert.equal((await clash(apiPort, 'wrong', 'GET', '/version')).status, 401)

    const sw = await clash(apiPort, secret, 'PUT', '/proxies/proxy', { name: tags[fake[1].id] })
    assert.equal(sw.status, 204)
    const info = JSON.parse((await clash(apiPort, secret, 'GET', '/proxies/proxy')).body)
    assert.equal(info.now, tags[fake[1].id])

    // До мёртвого сервера проверка задержки не проходит — менеджер не объявит «подключено».
    const d = await clash(apiPort, secret, 'GET', `/proxies/proxy/delay?timeout=1500&url=${encodeURIComponent('https://www.gstatic.com/generate_204')}`)
    assert.notEqual(d.status, 200)
    // Пинг конкретного сервера (srv-N) и проверка «есть ли интернет» (direct) —
    // эндпоинты существуют (не 404), мёртвый сервер не даёт 200.
    const ping = await clash(apiPort, secret, 'GET', `/proxies/${tags[fake[0].id]}/delay?timeout=1500&url=${encodeURIComponent('http://cp.cloudflare.com/generate_204')}`)
    assert.notEqual(ping.status, 404)
    assert.notEqual(ping.status, 200)
    const direct = await clash(apiPort, secret, 'GET', `/proxies/direct/delay?timeout=3000&url=${encodeURIComponent('https://www.gstatic.com/generate_204')}`)
    assert.notEqual(direct.status, 404)

    // mixed-inbound слушает
    await new Promise((resolve, reject) => {
      const s = net.connect(mixedPort, '127.0.0.1', () => { s.destroy(); resolve() })
      s.on('error', reject)
    })
  } finally {
    proc.kill()
  }
})

// ─── Пинг серверов ──────────────────────────────────────────────────────────

test('пинг: при подключённом TUN — значения ядра, без прямых TCP-соединений', async () => {
  const sub = { id: 's1', servers: [{ id: 'a', address: '127.0.0.1', port: 1 }, { id: 'b', address: '127.0.0.1', port: 2 }] }
  let asked = null
  const r = await pingAll(sub, [sub], async list => { asked = list.map(s => s.id); return { a: 140 } })
  assert.deepEqual(asked, ['a', 'b'])
  assert.deepEqual(r.subscriptions[0].servers.map(s => s.ping), [140, null])
})

// ─── Kill switch: список блокировки ─────────────────────────────────────────

function inRanges(list, ip) {
  const v6 = ip.includes(':')
  const n = v6 ? ipx.ipv6ToNum(ip) : ipx.ipv4ToNum(ip)
  return list.some(r => {
    if (r.includes(':') !== v6) return false
    const [a, b = a] = r.split('-')
    const s = v6 ? ipx.ipv6ToNum(a) : ipx.ipv4ToNum(a)
    const e = v6 ? ipx.ipv6ToNum(b) : ipx.ipv4ToNum(b)
    return n >= s && n <= e
  })
}

test('kill switch: блокируется всё, кроме серверов, DNS, loopback и LAN', () => {
  const list = buildBlockList(['203.0.113.17', '77.88.8.8', 'not-an-ip'])
  for (const ip of ['8.8.8.8', '1.1.1.1', '203.0.113.16', '203.0.113.18', '0.0.0.1', '2001:4860:4860::8888', '2a00:1450::1']) {
    assert.ok(inRanges(list, ip), `должен блокироваться ${ip}`)
  }
  for (const ip of ['203.0.113.17', '77.88.8.8', '127.0.0.1', '192.168.1.1', '10.1.2.3', '172.19.0.1', '::1', 'fe80::1', 'fd00::1']) {
    assert.ok(!inRanges(list, ip), `не должен блокироваться ${ip}`)
  }
  assert.ok(list.length < 60)
})

// netsh не вызывается: child_process подменяется до загрузки модуля.
test('kill switch: правило заранее выключено, при падении ядра — одна команда без delete', async () => {
  const cp = require('child_process')
  const orig = { execFile: cp.execFile, execFileSync: cp.execFileSync }
  const calls = []
  cp.execFile = (cmd, args, opts, cb) => { calls.push(['async', ...args.slice(2, 4)]); setTimeout(() => cb(null, 'Ok.'), 5) }
  cp.execFileSync = (cmd, args) => { calls.push(['sync', ...args.slice(2, 4)]); return '' }
  const modPath = require.resolve('../electron/firewall-guard')
  delete require.cache[modPath]
  try {
    const fw = require('../electron/firewall-guard')
    await fw.prepare(['203.0.113.17'])
    assert.equal(fw.isActive(), false)
    assert.deepEqual(calls.map(c => c.join(' ')), ['async delete rule', 'async add rule'])
    assert.ok(cp.execFile !== orig.execFile)

    calls.length = 0
    fw.enableSync(['203.0.113.17'])           // падение ядра
    assert.equal(fw.isActive(), true)
    assert.deepEqual(calls.map(c => c.join(' ')), ['sync set rule'])

    // Очередь: disable и enable не перемешиваются, enable не удаляет правило.
    calls.length = 0
    const d = fw.disable()
    const e = fw.enable(['203.0.113.17'])
    await Promise.all([d, e])
    assert.equal(fw.isActive(), true)
    assert.deepEqual(calls.map(c => c.join(' ')), ['async set rule', 'async set rule'])

    calls.length = 0
    await fw.disable()
    await fw.disable()                         // повторно — без netsh
    assert.equal(calls.length, 1)
    await fw.remove()
    assert.deepEqual(calls.map(c => c.join(' ')), ['async set rule', 'async delete rule'])
    assert.equal(fw.isActive(), false)
  } finally {
    cp.execFile = orig.execFile
    cp.execFileSync = orig.execFileSync
    delete require.cache[modPath]
  }
})

// ─── Миграция настроек ──────────────────────────────────────────────────────

test('миграция: один раз включает «весь трафик», потом уважает выбор «прокси»', () => {
  const dir = path.join(TMP, 'data')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ tunMode: false, bypassRu: false, activeServerId: 'x' }))
  const prev = process.env.LIPTON_DATA_DIR
  process.env.LIPTON_DATA_DIR = dir
  delete require.cache[require.resolve('../electron/settings-manager')]
  const sm = require('../electron/settings-manager')
  try {
    assert.deepEqual(sm.migrate(), ['tunMode→true'])
    assert.equal(sm.get('tunMode'), true)
    assert.equal(sm.get('coreLegacy'), false)
    assert.equal(sm.get('bypassRu'), false)
    assert.equal(sm.get('activeServerId'), 'x')
    assert.equal(sm.get('settingsVersion'), sm.SETTINGS_VERSION)
    sm.set('tunMode', false)
    assert.deepEqual(sm.migrate(), [])
    assert.equal(sm.get('tunMode'), false)
  } finally {
    if (prev === undefined) delete process.env.LIPTON_DATA_DIR
    else process.env.LIPTON_DATA_DIR = prev
    delete require.cache[require.resolve('../electron/settings-manager')]
  }
})
