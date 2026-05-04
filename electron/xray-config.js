// Generates xray-core JSON config for a given server object

function streamSettings(s) {
  const ss = { network: s.network || 'tcp' }

  if (s.security === 'reality') {
    ss.security = 'reality'
    ss.realitySettings = {
      fingerprint: s.fp || 'chrome',
      serverName: s.sni,
      publicKey: s.pbk,
      shortId: s.sid,
      spiderX: s.path || '/',
    }
  } else if (s.security === 'tls') {
    ss.security = 'tls'
    ss.tlsSettings = {
      serverName: s.sni,
      allowInsecure: false,
      fingerprint: s.fp || '',
      alpn: s.alpn ? s.alpn.split(',') : [],
    }
  } else {
    ss.security = 'none'
  }

  if (s.network === 'ws') {
    ss.wsSettings = { path: s.path || '/', headers: s.host ? { Host: s.host } : {} }
  } else if (s.network === 'grpc') {
    ss.grpcSettings = { serviceName: s.serviceName || '' }
  } else if (s.network === 'h2') {
    ss.httpSettings = { path: s.path || '/', host: s.host ? [s.host] : [] }
  } else if (s.network === 'httpupgrade') {
    ss.httpupgradeSettings = { path: s.path || '/', host: s.host || s.sni }
  }

  return ss
}

function vlessOutbound(s) {
  return {
    tag: 'proxy',
    protocol: 'vless',
    settings: {
      vnext: [{
        address: s.address,
        port: s.port,
        users: [{ id: s.uuid, encryption: 'none', flow: s.flow || '' }],
      }],
    },
    streamSettings: streamSettings(s),
    mux: { enabled: false },
  }
}

function vmessOutbound(s) {
  return {
    tag: 'proxy',
    protocol: 'vmess',
    settings: {
      vnext: [{
        address: s.address,
        port: s.port,
        users: [{ id: s.uuid, alterId: s.alterId || 0, security: s.cipher || 'auto' }],
      }],
    },
    streamSettings: streamSettings(s),
    mux: { enabled: false },
  }
}

function trojanOutbound(s) {
  return {
    tag: 'proxy',
    protocol: 'trojan',
    settings: {
      servers: [{ address: s.address, port: s.port, password: s.password }],
    },
    streamSettings: streamSettings(s),
    mux: { enabled: false },
  }
}

function generateConfig(server, opts = {}) {
  const socksPort = opts.socksPort || 10808
  const httpPort = opts.httpPort || 10809
  const bypassRu = opts.bypassRu !== false // default: true
  const bypassDomains = (opts.bypassDomains || []).map(d => `domain:${d.replace(/^domain:/, '')}`)
  let outbound
  if (server.protocol === 'vless') outbound = vlessOutbound(server)
  else if (server.protocol === 'vmess') outbound = vmessOutbound(server)
  else if (server.protocol === 'trojan') outbound = trojanOutbound(server)
  else throw new Error(`Неизвестный протокол: ${server.protocol}`)

  const rules = []

  if (bypassDomains.length > 0) {
    rules.push({ type: 'field', domain: bypassDomains, outboundTag: 'direct' })
  }

  if (bypassRu) {
    rules.push({
      type: 'field',
      domain: [
        'geosite:category-ru',
        'domain:vk.com', 'domain:vkontakte.ru',
        'domain:gosuslugi.ru', 'domain:mos.ru',
        'domain:yandex.ru', 'domain:yandex.net',
        'domain:mail.ru', 'domain:ok.ru',
        'domain:sberbank.ru', 'domain:sbrf.ru',
        'domain:tinkoff.ru', 'domain:raiffeisen.ru',
        'domain:gazprombank.ru', 'domain:vtb.ru',
        'domain:mvd.ru', 'domain:kremlin.ru',
        'domain:government.ru', 'domain:rbc.ru',
        'domain:1tv.ru', 'domain:ntv.ru', 'domain:rt.com',
        'domain:2ip.ru', 'domain:2ip.io',
      ],
      outboundTag: 'direct',
    })
    rules.push({
      type: 'field',
      ip: ['geoip:ru', 'geoip:private'],
      outboundTag: 'direct',
    })
  } else {
    // Only bypass private/loopback IPs, route everything else including RU through VPN
    rules.push({
      type: 'field',
      ip: ['geoip:private'],
      outboundTag: 'direct',
    })
  }

  rules.push({
    type: 'field',
    network: 'tcp,udp',
    outboundTag: 'proxy',
  })

  return {
    log: { access: '', error: '', loglevel: 'warning' },
    inbounds: [
      {
        tag: 'socks',
        port: socksPort,
        listen: '127.0.0.1',
        protocol: 'socks',
        settings: { auth: 'noauth', udp: true, ip: '127.0.0.1' },
        sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
      },
      {
        tag: 'http',
        port: httpPort,
        listen: '127.0.0.1',
        protocol: 'http',
        settings: { timeout: 300, allowTransparent: false },
        sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
      },
    ],
    outbounds: [
      outbound,
      { tag: 'direct', protocol: 'freedom', settings: {} },
      { tag: 'block', protocol: 'blackhole', settings: { response: { type: 'http' } } },
    ],
    routing: {
      domainStrategy: 'IPIfNonMatch',
      rules,
    },
    dns: {
      servers: ['8.8.8.8', '8.8.4.4', '1.1.1.1'],
    },
  }
}

module.exports = { generateConfig }
