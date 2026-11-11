const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const { PassThrough } = require('node:stream')
const test = require('node:test')
const { parseUri, parseSubscriptionServers } = require('../electron/subscription-manager')
const { generateConfig } = require('../electron/xray-config')
const { generateSingboxConfig } = require('../electron/singbox-config')

const server = { protocol: 'vless', uuid: 'test', address: 'example.com', port: 443 }

async function withManager(run) {
  const filename = require.resolve('../electron/vpn-manager')
  const originalLoad = Module._load
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lipton-legacy-test-'))
  const calls = []
  const mock = {
    tun: {
      resolveEndpoint: async () => '192.0.2.10',
      start: async () => { calls.push('tun start') },
      stop: async () => { calls.push('tun stop') },
    },
    spawn: () => {
      const child = new EventEmitter()
      child.pid = 100
      child.exitCode = null
      child.signalCode = null
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.kill = () => {
        calls.push('xray stop')
        child.signalCode = 'SIGTERM'
        queueMicrotask(() => child.emit('exit', null, child.signalCode))
        return true
      }
      queueMicrotask(() => child.stdout.write('[Warning] Xray 26.3.27 started\n'))
      return child
    },
  }
  delete require.cache[filename]
  Module._load = function (id, parent, ...args) {
    if (parent?.filename === filename) {
      if (id === 'child_process') return { spawn: (...params) => mock.spawn(...params) }
      if (id === './tun-manager') return mock.tun
      if (id === './system-proxy') {
        return {
          setProxy: () => { calls.push('proxy set'); return true },
          clearProxy: () => calls.push('proxy clear'),
          getProxyServer: () => '127.0.0.1:10809',
        }
      }
    }
    return originalLoad.call(this, id, parent, ...args)
  }
  let manager
  try {
    manager = require(filename)
  } finally {
    Module._load = originalLoad
  }
  try {
    await run(manager, { calls, dataDir, mock })
  } finally {
    await manager.disconnect()
    delete require.cache[filename]
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
}

test('Xray startup does not count as a working VPN', () => withManager(async (manager, { calls, dataDir }) => {
  const result = await manager.connect(server, {
    dataDir,
    probeLegacy: async () => { throw new Error('no tunnel traffic') },
  })
  assert.deepEqual(result, { success: false, error: 'no tunnel traffic' })
  assert.equal(manager.getStatus(), 'disconnected')
  assert.deepEqual(calls, ['xray stop'])
}))

test('failed TUN is rolled back without falling back to system proxy', () => withManager(async (manager, { calls, dataDir, mock }) => {
  mock.tun.start = async () => { throw new Error('route failed') }
  const result = await manager.connect(server, { dataDir, tunMode: true, probeLegacy: async () => {} })
  assert.deepEqual(result, { success: false, error: 'route failed' })
  assert.equal(manager.getStatus(), 'disconnected')
  assert.deepEqual(calls, ['tun stop', 'xray stop'])
}))

test('TUN reports connected only after both traffic probes', () => withManager(async (manager, { calls, dataDir }) => {
  const result = await manager.connect(server, {
    dataDir,
    tunMode: true,
    probeLegacy: async mode => {
      assert.equal(manager.getStatus(), 'connecting')
      calls.push('probe ' + mode)
    },
  })
  assert.deepEqual(result, { success: true })
  assert.equal(manager.getStatus(), 'connected')
  assert.deepEqual(calls, ['probe proxy', 'tun start', 'probe tun'])
}))

test('disconnect cancels an in-flight probe and cleans up Xray', () => withManager(async (manager, { calls, dataDir }) => {
  let probing
  const enteredProbe = new Promise(resolve => { probing = resolve })
  const connecting = manager.connect(server, {
    dataDir,
    probeLegacy: async (_mode, _port, signal) => {
      probing()
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    },
  })
  await enteredProbe
  await manager.disconnect()
  assert.equal((await connecting).success, false)
  assert.equal(manager.getStatus(), 'disconnected')
  assert.deepEqual(calls, ['xray stop'])
}))

test('Xray keeps the XHTTP packet-up mode from the subscription', () => {
  const parsed = parseUri('vless://test@example.com:2053?type=xhttp&security=reality&mode=packet-up&path=%2Fstream')
  const transport = generateConfig(parsed).outbounds[0].streamSettings.xhttpSettings
  assert.equal(transport.mode, 'packet-up')
  assert.equal(transport.path, '/stream')
})

test('XHTTP links preserve extra settings through subscription storage and Xray config generation', () => {
  const extra = {
    uplinkHTTPMethod: 'GET',
    uplinkDataPlacement: 'header',
    uplinkDataKey: 'X-Test-Data',
    scMaxEachPostBytes: '8192',
    xmux: { maxConcurrency: '4-8' },
  }
  for (const network of ['xhttp', 'splithttp']) {
    const url = `vless://test@example.invalid?type=${network}&mode=packet-up&path=%2Fstream&extra=${encodeURIComponent(JSON.stringify(extra))}`
    const server = JSON.parse(JSON.stringify(parseUri(url)))
    const settings = generateConfig(server).outbounds[0].streamSettings[`${network}Settings`]
    assert.equal(settings.mode, 'packet-up')
    assert.deepEqual(settings.extra, extra)
  }
})

test('an invalid XHTTP extra leaves the base link usable', () => {
  const parsed = parseUri('vless://test@example.invalid?type=xhttp&mode=packet-up&extra=%7B')
  const settings = generateConfig(parsed).outbounds[0].streamSettings.xhttpSettings
  assert.equal(settings.mode, 'packet-up')
  assert.equal(settings.extra, undefined)
})

test('subscription refresh keeps the IDs of existing servers while applying new connection options', () => {
  const first = 'vless://test@example.invalid?type=tcp&fp=firefox#First'
  const second = 'vless://test@example.invalid?type=tcp#Second'
  const added = 'vless://test@example.invalid?type=tcp#New'
  const initial = parseSubscriptionServers([first, second, second].join('\n'))
  const updated = parseSubscriptionServers([second, first.replace('firefox', 'chrome'), second, added].join('\n'), initial)
  assert.deepEqual(updated.slice(0, 3).map(s => s.id), [initial[1].id, initial[0].id, initial[2].id])
  assert.equal(updated[1].fp, 'chrome')
  assert.ok(updated[3].id)
  assert.equal(new Set(updated.map(s => s.id)).size, updated.length)
})

test('Xray TUN has one DNS path and routes bypass traffic before it reaches Xray', () => {
  const xray = generateConfig(server, { tunFrontend: true, bypassDomains: ['example.ru'] })
  assert.equal(xray.dns, undefined)
  assert.equal(xray.routing.domainStrategy, 'AsIs')
  assert.deepEqual(xray.routing.rules.map(rule => rule.outboundTag), ['proxy'])

  const { config } = generateSingboxConfig([], {
    endpoint: '192.0.2.10', localSocksPort: 10808, bypassDomains: ['example.ru'],
  })
  const [tun] = config.inbounds
  assert.equal(tun.strict_route, true)
  assert.equal(tun.dns_mode, 'hijack')
  assert.deepEqual(tun.route_exclude_address, ['192.0.2.10/32'])
  assert.deepEqual(config.dns.servers.map(({ type, detour }) => ({ type, detour })), [
    { type: 'https', detour: 'proxy' },
  ])
  assert.equal(config.dns.rules.length, 0)
  assert.equal(config.outbounds[0].type, 'socks')
  const rules = config.route.rules
  const rejectBroadcast = rules.findIndex(rule => rule.ip_cidr?.includes('255.255.255.255/32'))
  assert.ok(rules.findIndex(rule => rule.action === 'hijack-dns') < rejectBroadcast)
  assert.ok(rejectBroadcast < rules.findIndex(rule => rule.ip_is_private))
  assert.ok(rules.some(rule => rule.outbound === 'direct' && rule.domain_suffix?.includes('example.ru')))
})
