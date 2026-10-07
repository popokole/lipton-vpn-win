// Генератор конфига sing-box 1.14 из серверов подписки.
//
// Вход — те же распарсенные серверы, что идут в xray-config.js
// (subscription-manager.js: protocol, address, port, uuid, flow, security,
// sni, pbk, sid, fp, network, path, host, serviceName, alpn, ...).
//
// Режимы:
//   tun   — весь трафик системы через Wintun (auto_route + strict_route),
//           DNS перехватывается (hijack-dns), IPv6 отклоняется.
//   proxy — mixed (HTTP+SOCKS) на 127.0.0.1:httpPort; системный прокси WinINet
//           ставит само приложение.
//
// Все серверы подписки кладутся отдельными outbound'ами за selector «proxy»:
// смена сервера — переключение selector'а через clash_api, без перезапуска ядра
// и без окна, когда трафик идёт мимо туннеля.

const path = require('path')

const TUN_INTERFACE = 'LiptonTUN'
const TUN_ADDRESS = ['172.19.0.1/30', 'fdfe:dcba:9876::1/126']
const DEFAULT_HTTP_PORT = 10809

const DNS_REMOTE = { type: 'https', tag: 'dns-remote', server: '1.1.1.1', path: '/dns-query', detour: 'proxy' }
const DNS_DIRECT_IP = '77.88.8.8'

// ИИ-сервисы всегда идут через VPN — даже если пользователь добавил их в обход.
const FORCE_PROXY_DOMAINS = [
  'openai.com', 'chatgpt.com', 'oaistatic.com', 'oaiusercontent.com',
  'anthropic.com', 'claude.ai',
]

// Оплата — всегда напрямую с российского IP (ЮKassa / YooMoney), независимо от «Обхода РФ».
const FORCE_DIRECT_DOMAINS = ['yookassa.ru', 'yoomoney.ru']

// Российские зоны и популярные сервисы вне .ru (дополнение к geosite-category-ru).
const RU_SUFFIXES = ['ru', 'su', 'xn--p1ai']
const RU_EXTRA_DOMAINS = [
  'vk.com', 'vk.me', 'vkuser.net', 'userapi.com', 'vk-cdn.net',
  'yandex.net', 'yandex.com', 'yastatic.net', 'yandexcloud.net',
  'mail.ru', 'ok.ru', 'rt.com',
]

const RULE_SET_FILES = {
  'geosite-ru': 'geosite-category-ru.srs',
  'geoip-ru': 'geoip-ru.srs',
}

const UTLS_FINGERPRINTS = ['chrome', 'firefox', 'edge', 'safari', '360', 'qq', 'ios', 'android', 'random', 'randomized']

function fingerprint(fp) {
  const v = String(fp || '').trim().toLowerCase()
  return UTLS_FINGERPRINTS.includes(v) ? v : 'chrome'
}

class UnsupportedServerError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UnsupportedServerError'
    this.code = 'UNSUPPORTED'
  }
}

// ─── Нормализация пользовательских доменов ───────────────────────────────────

function normalizeDomain(d) {
  return String(d || '')
    .trim()
    .toLowerCase()
    .replace(/^domain:/, '')
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^\*?\./, '')
    .replace(/\.$/, '')
}

function normalizeDomains(list) {
  const out = []
  for (const d of list || []) {
    const n = normalizeDomain(d)
    if (n && /^[a-z0-9.\-_]+$/.test(n) && !out.includes(n)) out.push(n)
  }
  return out
}

// ─── Outbound серверов ───────────────────────────────────────────────────────

function tlsOptions(s) {
  if (s.security === 'reality') {
    if (!s.pbk) throw new UnsupportedServerError('Reality без публичного ключа (pbk)')
    const tls = {
      enabled: true,
      server_name: s.sni || s.address,
      utls: { enabled: true, fingerprint: fingerprint(s.fp) },
      reality: { enabled: true, public_key: s.pbk },
    }
    if (s.sid) tls.reality.short_id = s.sid
    return tls
  }
  if (s.security === 'tls') {
    const tls = { enabled: true, server_name: s.sni || s.address, insecure: false }
    const alpn = String(s.alpn || '').split(',').map(x => x.trim()).filter(Boolean)
    if (alpn.length) tls.alpn = alpn
    if (s.fp) tls.utls = { enabled: true, fingerprint: fingerprint(s.fp) }
    return tls
  }
  return null
}

function transportOptions(s) {
  const network = s.network || 'tcp'
  switch (network) {
    case 'tcp':
    case 'raw':
      // TCP с http-маскировкой (headerType=http) в sing-box не реализован.
      if (s.headerType === 'http') throw new UnsupportedServerError('TCP с HTTP-маскировкой не поддерживается')
      return null
    case 'ws': {
      const t = { type: 'ws', path: s.path || '/' }
      if (s.host) t.headers = { Host: s.host }
      return t
    }
    case 'grpc':
      return { type: 'grpc', service_name: s.serviceName || '' }
    case 'h2':
    case 'http': {
      const t = { type: 'http', path: s.path || '/' }
      if (s.host) t.host = String(s.host).split(',').map(x => x.trim()).filter(Boolean)
      return t
    }
    case 'httpupgrade': {
      const t = { type: 'httpupgrade', path: s.path || '/' }
      if (s.host || s.sni) t.host = s.host || s.sni
      return t
    }
    default:
      // xhttp / splithttp / kcp / quic — нет в sing-box
      throw new UnsupportedServerError(`Транспорт ${network} не поддерживается`)
  }
}

function serverOutbound(s, tag) {
  if (!s || !s.address || !s.port) throw new UnsupportedServerError('Нет адреса или порта сервера')
  const base = { tag, server: s.address, server_port: Number(s.port) }
  let ob

  if (s.protocol === 'vless') {
    if (!s.uuid) throw new UnsupportedServerError('VLESS без UUID')
    ob = { type: 'vless', ...base, uuid: s.uuid, packet_encoding: 'xudp' }
    if (s.flow) ob.flow = s.flow
  } else if (s.protocol === 'vmess') {
    if (!s.uuid) throw new UnsupportedServerError('VMess без UUID')
    ob = {
      type: 'vmess', ...base, uuid: s.uuid,
      security: s.cipher || 'auto', alter_id: Number(s.alterId) || 0,
      packet_encoding: 'xudp',
    }
  } else if (s.protocol === 'trojan') {
    if (!s.password) throw new UnsupportedServerError('Trojan без пароля')
    ob = { type: 'trojan', ...base, password: s.password }
  } else {
    throw new UnsupportedServerError(`Протокол ${s.protocol} не поддерживается`)
  }

  const tls = tlsOptions(s)
  if (tls) ob.tls = tls
  else if (s.protocol === 'trojan') ob.tls = { enabled: true, server_name: s.sni || s.address }

  const transport = transportOptions(s)
  if (transport) {
    // Vision работает только поверх «голого» TCP.
    delete ob.flow
    ob.transport = transport
  }
  return ob
}

// ─── Основной генератор ──────────────────────────────────────────────────────

/**
 * @param {object[]} servers  серверы подписки (как в subscription-manager)
 * @param {object}   opts
 *   mode            'tun' | 'proxy'
 *   selectedId      id выбранного сервера (по умолчанию — первый поддерживаемый)
 *   httpPort        порт mixed-inbound в режиме proxy (10809)
 *   bypassRu        «Обход РФ» (по умолчанию true)
 *   bypassDomains   свои домены в обход VPN
 *   rulesDir        папка с geosite-category-ru.srs / geoip-ru.srs
 *   strictRoute     strict_route для TUN (по умолчанию true)
 *   stack           стек TUN (mixed)
 *   mtu             MTU TUN (9000)
 *   clashApi        { port, secret } — локальный API для готовности и смены сервера
 *   logLevel        уровень логов sing-box (warn)
 * @returns {{ config: object, tags: Object<string,string>, selectedTag: string, skipped: object[] }}
 */
function generateSingboxConfig(servers, opts = {}) {
  const mode = opts.mode === 'proxy' ? 'proxy' : 'tun'
  const bypassRu = opts.bypassRu !== false
  const bypassDomains = normalizeDomains(opts.bypassDomains).filter(d => !FORCE_PROXY_DOMAINS.some(p => d === p || d.endsWith('.' + p)))
  const httpPort = Number(opts.httpPort) || DEFAULT_HTTP_PORT
  const rulesDir = opts.rulesDir || path.join(__dirname, '..', 'resources', 'sing-box', 'rules')

  const list = Array.isArray(servers) ? servers : [servers]
  const serverOutbounds = []
  const tags = {}
  const skipped = []

  list.forEach((s, i) => {
    const tag = `srv-${i}`
    try {
      serverOutbounds.push(serverOutbound(s, tag))
      if (s && s.id != null) tags[s.id] = tag
    } catch (e) {
      if (!(e instanceof UnsupportedServerError)) throw e
      skipped.push({ id: s && s.id, remark: s && (s.remark || s.address), reason: e.message })
      if (s && opts.selectedId != null && s.id === opts.selectedId) {
        throw new UnsupportedServerError(`Сервер «${s.remark || s.address}» не поддерживается новым ядром: ${e.message}`)
      }
    }
  })

  if (serverOutbounds.length === 0) {
    throw new UnsupportedServerError(skipped[0]?.reason || 'Нет серверов для подключения')
  }

  const selectedTag = (opts.selectedId != null && tags[opts.selectedId]) || serverOutbounds[0].tag

  // ── DNS ──
  const dnsRules = [{ domain_suffix: FORCE_PROXY_DOMAINS, server: 'dns-remote' }]
  dnsRules.push({ domain_suffix: FORCE_DIRECT_DOMAINS, server: 'dns-direct' })
  if (bypassDomains.length) dnsRules.push({ domain_suffix: bypassDomains, server: 'dns-direct' })
  if (bypassRu) {
    dnsRules.push({ rule_set: ['geosite-ru'], server: 'dns-direct' })
    dnsRules.push({ domain_suffix: [...RU_SUFFIXES, ...RU_EXTRA_DOMAINS], server: 'dns-direct' })
  }

  const dns = {
    servers: [
      { ...DNS_REMOTE },
      { type: 'udp', tag: 'dns-direct', server: DNS_DIRECT_IP },
    ],
    rules: dnsRules,
    final: 'dns-remote',
    strategy: 'ipv4_only',
    cache_capacity: 4096,
  }

  // ── Inbound ──
  let inbound
  if (mode === 'tun') {
    inbound = {
      type: 'tun',
      tag: 'tun-in',
      interface_name: TUN_INTERFACE,
      address: [...TUN_ADDRESS],
      mtu: Number(opts.mtu) || 9000,
      auto_route: true,
      strict_route: opts.strictRoute !== false,
      stack: opts.stack || 'mixed',
    }
  } else {
    inbound = { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: httpPort }
  }

  // ── Маршрутизация ──
  const rules = [
    { action: 'sniff' },
    { type: 'logical', mode: 'or', rules: [{ protocol: 'dns' }, { port: 53 }], action: 'hijack-dns' },
    // У нод нет IPv6-выхода: отклоняем, приложения сразу уходят на IPv4 через туннель.
    { ip_version: 6, action: 'reject' },
    { ip_is_private: true, outbound: 'direct' },
    { domain_suffix: FORCE_PROXY_DOMAINS, outbound: 'proxy' },
    { domain_suffix: FORCE_DIRECT_DOMAINS, outbound: 'direct' },
  ]
  if (bypassDomains.length) rules.push({ domain_suffix: bypassDomains, outbound: 'direct' })

  const ruleSets = []
  if (bypassRu) {
    rules.push({ rule_set: ['geosite-ru'], outbound: 'direct' })
    rules.push({ domain_suffix: [...RU_SUFFIXES, ...RU_EXTRA_DOMAINS, 'gosuslugi.ru'], outbound: 'direct' })
    // В режиме прокси приходит домен, а не IP: чтобы сработал geoip-ru, резолвим
    // (через DoH в туннеле). В TUN у соединения уже есть IP.
    if (mode === 'proxy') rules.push({ action: 'resolve', strategy: 'ipv4_only' })
    rules.push({ rule_set: ['geoip-ru'], outbound: 'direct' })
    for (const [tag, file] of Object.entries(RULE_SET_FILES)) {
      ruleSets.push({ type: 'local', tag, format: 'binary', path: path.join(rulesDir, file) })
    }
  }
  // QUIC через туннель не пускаем (по протоколу после sniff, не по порту) —
  // браузеры откатываются на TCP; WebRTC/голос по UDP не задеваются.
  rules.push({ protocol: 'quic', action: 'reject' })

  const route = {
    rules,
    final: 'proxy',
    default_domain_resolver: { server: 'dns-direct', strategy: 'ipv4_only' },
  }
  if (ruleSets.length) route.rule_set = ruleSets
  if (mode === 'tun') route.auto_detect_interface = true

  const config = {
    log: { level: opts.logLevel || 'warn', timestamp: true },
    dns,
    inbounds: [inbound],
    outbounds: [
      {
        type: 'selector',
        tag: 'proxy',
        outbounds: serverOutbounds.map(o => o.tag),
        default: selectedTag,
        interrupt_exist_connections: true,
      },
      ...serverOutbounds,
      { type: 'direct', tag: 'direct' },
    ],
    route,
  }

  if (opts.clashApi && opts.clashApi.port) {
    config.experimental = {
      clash_api: {
        external_controller: `127.0.0.1:${opts.clashApi.port}`,
        secret: opts.clashApi.secret || '',
      },
    }
  }

  return { config, tags, selectedTag, skipped }
}

// Ключ «содержимого» конфига без выбранного сервера и без clash_api —
// если он не изменился, сервер можно сменить на лету через selector.
function configKey(config) {
  const c = JSON.parse(JSON.stringify(config))
  delete c.experimental
  const sel = (c.outbounds || []).find(o => o.type === 'selector' && o.tag === 'proxy')
  if (sel) delete sel.default
  return JSON.stringify(c)
}

module.exports = {
  generateSingboxConfig,
  configKey,
  normalizeDomains,
  UnsupportedServerError,
  FORCE_PROXY_DOMAINS,
  FORCE_DIRECT_DOMAINS,
  TUN_INTERFACE,
  DNS_DIRECT_IP,
}
