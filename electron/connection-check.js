// «Проверка соединения»: что видят сайты через активный VPN.
//
// Запросы делает main-процесс тем же путём, что и обычный трафик (транспорт
// подставляет main.js: в TUN — напрямую через систему, в режиме прокси — через
// 127.0.0.1:<httpPort>). Результаты никуда не отправляются — только в окно.
//
// Модуль без зависимостей от Electron: сеть и DNS передаются снаружи
// (fetchText, lookup), поэтому оценка результатов покрыта юнит-тестами.

const net = require('net')

const TRACE_URLS = {
  chatgpt: 'https://chatgpt.com/cdn-cgi/trace',
  cloudflare: 'https://www.cloudflare.com/cdn-cgi/trace',
}
// Сайты, доступные только по IPv6: ответ = ваш IPv6-адрес.
// Первым — IPv6-литерал без DNS: в TUN AAAA-запросы всегда пустые (ipv4_only), и проверка по
// имени показала бы «заблокирован» даже при IPv6-маршруте мимо Wintun. Литерал ловит такую утечку.
const IPV6_URLS = ['https://[2606:4700:4700::1111]/cdn-cgi/trace', 'https://ipv6.icanhazip.com', 'https://api6.ipify.org']
// Authoritative-сервер Akamai отвечает IP резолвера, который его спросил.
const DNS_WHOAMI_HOST = 'whoami.akamai.net'
const TIMEOUT_MS = 8000

// Страны, где OpenAI не работает (по trace Cloudflare loc).
const OPENAI_BLOCKED = new Set(['RU', 'BY', 'CN', 'HK', 'MO', 'IR', 'KP', 'SY', 'CU'])

// Публичные IPv4-диапазоны Cloudflare (https://www.cloudflare.com/ips-v4).
// Через них выходит DoH 1.1.1.1, который ядро использует в туннеле.
const CLOUDFLARE_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22', '1.1.1.0/24', '1.0.0.0/24',
]

const FALLBACK_COUNTRIES = {
  DE: 'Германия', NL: 'Нидерланды', FI: 'Финляндия', SE: 'Швеция', FR: 'Франция',
  GB: 'Великобритания', US: 'США', PL: 'Польша', LV: 'Латвия', LT: 'Литва',
  EE: 'Эстония', KZ: 'Казахстан', TR: 'Турция', AE: 'ОАЭ', RU: 'Россия', BY: 'Беларусь',
}

// ─── Разбор и справочники ────────────────────────────────────────────────────

// Ответ /cdn-cgi/trace: строки key=value.
function parseTrace(text) {
  const out = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  const loc = /^[A-Za-z]{2}$/.test(out.loc || '') ? out.loc.toUpperCase() : ''
  return { ip: net.isIP(out.ip || '') ? out.ip : '', loc, colo: out.colo || '' }
}

let displayNames = null
function countryName(code) {
  const c = String(code || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(c)) return 'неизвестно'
  if (c === 'XX' || c === 'T1') return 'не определена'
  try {
    if (!displayNames) displayNames = new Intl.DisplayNames(['ru'], { type: 'region' })
    const name = displayNames.of(c)
    if (name && name !== c) return name
  } catch { /* нет ICU — берём таблицу */ }
  return FALLBACK_COUNTRIES[c] || c
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc * 256) + Number(o), 0)
}

function inCidr(ip, cidr) {
  const [base, bitsStr] = cidr.split('/')
  const bits = Number(bitsStr)
  const size = 2 ** (32 - bits)
  const start = Math.floor(ipv4ToInt(base) / size) * size
  const n = ipv4ToInt(ip)
  return n >= start && n < start + size
}

function isCloudflareIp(ip) {
  if (!net.isIPv4(ip || '')) return false
  return CLOUDFLARE_V4.some(c => inCidr(ip, c))
}

function shortError(err) {
  const m = String(err && (err.message || err) || '').trim()
  if (!m) return 'нет ответа'
  if (/abort|timeout|timed out/i.test(m)) return 'нет ответа за ' + Math.round(TIMEOUT_MS / 1000) + ' с'
  const net0 = m.match(/net::ERR_[A-Z_]+/)
  if (net0) return net0[0]
  return m.split('\n')[0].slice(0, 120)
}

// ─── Проверка ────────────────────────────────────────────────────────────────

function withTimeout(promise, ms) {
  let t
  return Promise.race([
    promise,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms) }),
  ]).finally(() => clearTimeout(t))
}

async function probeIpv6(fetchText, timeoutMs) {
  let lastErr = null
  for (const url of IPV6_URLS) {
    try {
      const body = String(await fetchText(url, timeoutMs)).trim()
      const ip = body.includes('ip=') ? parseTrace(body).ip : body.split(/\s+/)[0] || ''
      return { reachable: true, ip }
    } catch (e) {
      lastErr = e
    }
  }
  return { reachable: false, error: shortError(lastErr) }
}

/**
 * @param {object} p
 * @param {string} p.status      статус VPN (connected | reconnecting | ...)
 * @param {'tun'|'proxy'} p.mode режим работающего ядра
 * @param {(url:string, timeoutMs:number)=>Promise<string>} p.fetchText
 * @param {(host:string)=>Promise<string>} p.lookup  системный резолвер, IPv4
 */
async function runConnectionCheck({ status, mode, fetchText, lookup, timeoutMs = TIMEOUT_MS }) {
  if (status !== 'connected') {
    return evaluate({ status, mode })
  }
  const traceOf = url => withTimeout(fetchText(url, timeoutMs), timeoutMs + 1000).then(parseTrace)
  const [chatgpt, cloudflare, ipv6, dnsRes] = await Promise.allSettled([
    traceOf(TRACE_URLS.chatgpt),
    traceOf(TRACE_URLS.cloudflare),
    withTimeout(probeIpv6(fetchText, timeoutMs), timeoutMs * IPV6_URLS.length + 1000),
    withTimeout(lookup(DNS_WHOAMI_HOST), timeoutMs),
  ])
  const settled = r => r.status === 'fulfilled' ? { ok: true, value: r.value } : { ok: false, error: shortError(r.reason) }
  return evaluate({
    status, mode,
    chatgpt: settled(chatgpt),
    cloudflare: settled(cloudflare),
    ipv6: ipv6.status === 'fulfilled' ? ipv6.value : { reachable: false, error: shortError(ipv6.reason) },
    dns: settled(dnsRes),
  })
}

/**
 * Что видят сайты без VPN (для плитки «Сайты видят вас» на главной, когда VPN
 * выключен): настоящий IP и страна по trace Cloudflare, есть ли IPv6.
 * Один-два запроса напрямую; результат только для окна, в лог не пишется.
 * @param {object} p
 * @param {(url:string, timeoutMs:number)=>Promise<string>} p.fetchText
 */
async function runDirectCheck({ fetchText, timeoutMs = 5000 }) {
  const [cf, v6] = await Promise.allSettled([
    withTimeout(fetchText(TRACE_URLS.cloudflare, timeoutMs), timeoutMs + 1000).then(parseTrace),
    withTimeout(fetchText(IPV6_URLS[0], timeoutMs), timeoutMs + 1000).then(parseTrace),
  ])
  const trace = cf.status === 'fulfilled' ? cf.value : { ip: '', loc: '' }
  const ipv6 = v6.status === 'fulfilled' && net.isIPv6(v6.value.ip || '') ? v6.value.ip : ''
  return {
    kind: 'direct',
    checkedAt: new Date().toISOString(),
    ok: !!trace.ip,
    ip: trace.ip || '',
    country: trace.loc || '',
    countryName: trace.loc ? countryName(trace.loc) : '',
    ipv6: !!ipv6,
  }
}

const RANK = { ok: 0, info: 0, warn: 1, fail: 2 }

// Чистая функция: сырые результаты → пункты и итог с подсказками.
function evaluate({ status, mode, chatgpt, cloudflare, ipv6, dns }) {
  const checkedAt = new Date().toISOString()
  if (status !== 'connected') {
    const reconnecting = status === 'reconnecting' || status === 'connecting'
    return {
      mode: mode || null,
      checkedAt,
      items: [],
      verdict: {
        level: 'fail',
        title: reconnecting ? 'VPN переподключается' : 'VPN не подключён',
        hints: [reconnecting
          ? 'Подождите несколько секунд и запустите проверку снова'
          : 'Подключитесь к VPN и запустите проверку снова'],
      },
    }
  }

  const isProxy = mode === 'proxy'
  const items = []
  const hints = []
  const hint = h => { if (!hints.includes(h)) hints.push(h) }
  const fullTrafficHint = 'Включите в настройках режим «VPN для всего трафика»'

  // ── ChatGPT ──
  if (!chatgpt.ok || !chatgpt.value.loc) {
    items.push({ id: 'chatgpt', label: 'ChatGPT видит', status: 'fail', value: 'Нет ответа', detail: chatgpt.ok ? 'страна не определена' : chatgpt.error })
    hint('ChatGPT не открывается через VPN — выберите другой сервер и повторите проверку')
  } else {
    const { ip, loc } = chatgpt.value
    const blocked = OPENAI_BLOCKED.has(loc)
    items.push({ id: 'chatgpt', label: 'ChatGPT видит', status: blocked ? 'fail' : 'ok', value: countryName(loc), country: loc, ip, detail: ip ? `IP ${ip}` : '' })
    if (loc === 'RU') {
      hint('ChatGPT видит Россию — его трафик идёт мимо VPN. Переподключитесь или выберите другой сервер; если не поможет — напишите в поддержку')
    } else if (blocked) {
      hint(`OpenAI не работает в стране «${countryName(loc)}» — выберите сервер другой страны`)
    }
  }

  // ── Остальные сайты ──
  if (!cloudflare.ok || !cloudflare.value.loc) {
    items.push({ id: 'cloudflare', label: 'Другие сайты видят', status: 'warn', value: 'Нет ответа', detail: cloudflare.ok ? 'страна не определена' : cloudflare.error })
    hint('cloudflare.com не ответил — проверьте интернет или выберите другой сервер')
  } else {
    const { ip, loc } = cloudflare.value
    let st = loc === 'RU' ? 'fail' : 'ok'
    if (loc === 'RU') {
      hint('Сайты видят Россию — трафик идёт мимо VPN. Переподключитесь; если вы добавили cloudflare.com в свои домены для обхода — уберите его')
    } else if (chatgpt.ok && chatgpt.value.loc && chatgpt.value.loc !== 'RU' && chatgpt.value.loc !== loc) {
      st = 'warn'
      hint(`ChatGPT и другие сайты видят разные страны (${countryName(chatgpt.value.loc)} и ${countryName(loc)}) — выберите конкретный сервер вместо «Авто» и переподключитесь`)
    }
    items.push({ id: 'cloudflare', label: 'Другие сайты видят', status: st, value: countryName(loc), country: loc, ip, detail: ip ? `IP ${ip}` : '' })
  }

  // ── IPv6 ──
  if (ipv6 && ipv6.reachable && net.isIPv6(ipv6.ip)) {
    items.push({ id: 'ipv6', label: 'IPv6', status: 'fail', value: 'Идёт мимо VPN', detail: `IP ${ipv6.ip}` })
    hint(isProxy
      ? `Сайты видят ваш настоящий IPv6-адрес. ${fullTrafficHint}`
      : 'Сайты видят ваш настоящий IPv6-адрес — переподключитесь. Если повторяется, напишите в поддержку и приложите логи')
  } else {
    items.push({
      id: 'ipv6', label: 'IPv6', status: 'ok',
      value: isProxy ? 'Недоступен' : 'Заблокирован',
      detail: isProxy ? 'через прокси IPv6 не используется' : 'утечки через IPv6 нет',
    })
  }

  // ── DNS ──
  if (!dns || !dns.ok || !net.isIPv4(String(dns.value || ''))) {
    items.push({ id: 'dns', label: 'DNS', status: isProxy ? 'info' : 'warn', value: 'Не удалось проверить', detail: dns && !dns.ok ? dns.error : '' })
    if (!isProxy) hint('Не удалось проверить DNS — нажмите «Очистить DNS кэш» в настройках и повторите проверку')
  } else {
    const resolver = dns.value
    const exitIps = [chatgpt, cloudflare].filter(r => r && r.ok && r.value.ip).map(r => r.value.ip)
    if (isCloudflareIp(resolver)) {
      items.push({ id: 'dns', label: 'DNS', status: 'ok', value: 'Через VPN', detail: `резолвер Cloudflare ${resolver}` })
    } else if (exitIps.includes(resolver)) {
      items.push({ id: 'dns', label: 'DNS', status: 'ok', value: 'Через VPN', detail: `резолвер ${resolver}` })
    } else if (isProxy) {
      items.push({ id: 'dns', label: 'DNS', status: 'info', value: 'Провайдера', detail: `резолвер ${resolver} · браузеры получают адреса через VPN` })
    } else {
      items.push({ id: 'dns', label: 'DNS', status: 'warn', value: 'Мимо VPN', detail: `резолвер ${resolver}` })
      hint('DNS-запросы идут мимо VPN — нажмите «Очистить DNS кэш» в настройках и повторите проверку. Если не помогло, отключите «безопасный DNS» в антивирусе или другие VPN')
    }
  }

  let level = items.reduce((lv, it) => RANK[it.status] > RANK[lv] ? it.status : lv, 'ok')
  if (level === 'info') level = 'ok'

  let title = level === 'ok' ? 'Всё в порядке' : level === 'warn' ? 'Есть замечания' : 'Есть проблема'
  if (isProxy && level !== 'fail') {
    if (level === 'ok') title = 'Браузеры защищены'
    level = 'warn'
    hint(`Режим «Только браузеры»: голосовой ChatGPT, игры и часть приложений идут напрямую. ${fullTrafficHint}`)
  }

  return { mode, checkedAt, items, verdict: { level, title, hints } }
}

module.exports = {
  runConnectionCheck,
  runDirectCheck,
  evaluate,
  parseTrace,
  countryName,
  isCloudflareIp,
  TRACE_URLS,
  IPV6_URLS,
  DNS_WHOAMI_HOST,
  OPENAI_BLOCKED,
}
