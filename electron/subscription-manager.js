const https = require('https')
const http = require('http')
const net = require('net')
const os = require('os')
const { URL } = require('url')
const crypto = require('crypto')

const ALLOWED_DOMAIN = 'sub.popokole.online'

// ─── Device identity ──────────────────────────────────────────────────────────

function getHwid() {
  const settingsManager = require('./settings-manager')
  let hwid = settingsManager.get('hwid')
  if (!hwid) {
    hwid = crypto.randomUUID()
    settingsManager.set('hwid', hwid)
  }
  return hwid
}

function getWindowsVersion() {
  // os.release() on Windows returns e.g. "10.0.26200"
  const rel = os.release()
  const build = parseInt((rel.split('.')[2] || '0'), 10)
  if (build >= 22000) return '11'
  return '10'
}

function getDeviceHeaders() {
  return {
    'x-hwid':         getHwid(),
    'x-device-os':    'Windows',
    'x-ver-os':       getWindowsVersion(),
    'x-device-model': os.hostname(),
  }
}

// ─── URL validation ───────────────────────────────────────────────────────────

function validateUrl(url) {
  let parsed
  try { parsed = new URL(url) } catch {
    throw new Error('Неверный формат ссылки')
  }
  if (parsed.hostname !== ALLOWED_DOMAIN) {
    throw new Error(`Разрешены только ссылки с домена ${ALLOWED_DOMAIN}`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Ссылка должна начинаться с https://')
  }
}

// ─── HTTP fetch ───────────────────────────────────────────────────────────────

function getAppVersion() {
  try { return require('../package.json').version } catch { return '1.0.0' }
}

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const lib = parsed.protocol === 'https:' ? https : http
    const ver = getAppVersion()

    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent':    `LiptonVPN/${ver} (Windows; x64)`,
        'X-App-Name':    'LiptonVPN',
        'X-App-Version': ver,
        'Accept':        'text/plain, application/json, */*',
        ...getDeviceHeaders(),
      },
      timeout: 15000,
    }, (res) => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })

    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Таймаут запроса')) })
    req.end()
  })
}

// ─── Parse subscription-userinfo header ──────────────────────────────────────

function parseUserInfo(headers) {
  const raw = headers['subscription-userinfo'] || ''
  const map = {}
  raw.split(';').forEach(p => {
    const [k, v] = p.trim().split('=')
    if (k && v !== undefined) map[k.trim()] = Number(v.trim()) || 0
  })
  return {
    upload: map.upload || 0,
    download: map.download || 0,
    total: map.total || 0,
    expire: map.expire || 0,
  }
}

// ─── URI parsers ──────────────────────────────────────────────────────────────

function parseVless(uri) {
  try {
    const u = new URL(uri)
    const p = Object.fromEntries(u.searchParams)
    return {
      id: crypto.randomUUID(),
      protocol: 'vless',
      address: u.hostname,
      port: parseInt(u.port) || 443,
      uuid: u.username,
      remark: decodeURIComponent(u.hash.slice(1)) || u.hostname,
      network: p.type || 'tcp',
      security: p.security || 'none',
      flow: p.flow || '',
      sni: p.sni || u.hostname,
      pbk: p.pbk || '',
      sid: p.sid || '',
      fp: p.fp || 'chrome',
      path: p.path || '/',
      host: p.host || '',
      alpn: p.alpn || '',
      serviceName: p.serviceName || '',
      ping: null,
    }
  } catch { return null }
}

function parseVmess(uri) {
  try {
    const json = JSON.parse(Buffer.from(uri.slice(8), 'base64').toString('utf-8'))
    return {
      id: crypto.randomUUID(),
      protocol: 'vmess',
      address: json.add,
      port: parseInt(json.port) || 443,
      uuid: json.id,
      remark: json.ps || json.add,
      network: json.net || 'tcp',
      security: json.tls || 'none',
      sni: json.sni || json.add,
      path: json.path || '/',
      host: json.host || '',
      alterId: parseInt(json.aid) || 0,
      cipher: json.scy || 'auto',
      flow: '',
      ping: null,
    }
  } catch { return null }
}

function parseTrojan(uri) {
  try {
    const u = new URL(uri)
    const p = Object.fromEntries(u.searchParams)
    return {
      id: crypto.randomUUID(),
      protocol: 'trojan',
      address: u.hostname,
      port: parseInt(u.port) || 443,
      password: u.username,
      remark: decodeURIComponent(u.hash.slice(1)) || u.hostname,
      network: p.type || 'tcp',
      security: p.security || 'tls',
      sni: p.sni || u.hostname,
      path: p.path || '/',
      host: p.host || '',
      flow: '',
      ping: null,
    }
  } catch { return null }
}

function parseUri(line) {
  const s = line.trim()
  if (s.startsWith('vless://')) return parseVless(s)
  if (s.startsWith('vmess://')) return parseVmess(s)
  if (s.startsWith('trojan://')) return parseTrojan(s)
  return null
}

function decodeContent(raw) {
  const t = raw.trim()
  try {
    const decoded = Buffer.from(t, 'base64').toString('utf-8')
    if (decoded.includes('://')) return decoded
  } catch {}
  return t
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchAndParse(url) {
  const resp = await fetchRaw(url)
  if (resp.status !== 200) throw new Error(`Ошибка сервера (${resp.status})`)

  const content = decodeContent(resp.body)
  const servers = content.split('\n').map(parseUri).filter(Boolean)

  if (servers.length === 0) throw new Error('В подписке не найдено серверов')

  return { servers, userInfo: parseUserInfo(resp.headers) }
}

async function add(url) {
  validateUrl(url)

  const settingsManager = require('./settings-manager')
  const subscriptions = settingsManager.get('subscriptions') || []

  if (subscriptions.some(s => s.url === url)) {
    return { success: false, error: 'Такая подписка уже добавлена' }
  }

  const paidCount = subscriptions.filter(s => !s.isTrial).length
  if (paidCount >= 1) {
    return { success: false, error: 'Можно добавить только 1 платную подписку. Удалите текущую, чтобы добавить новую.' }
  }

  const { servers, userInfo } = await fetchAndParse(url)

  const newSub = {
    id: crypto.randomUUID(),
    name: userInfo.name || 'Подписка',
    url,
    isTrial: false,
    addedAt: Date.now(),
    expiresAt: null,
    lastUpdated: Date.now(),
    servers,
    userInfo,
  }

  return { success: true, subscriptions: [...subscriptions, newSub], subscription: newSub }
}

async function refresh(sub, subscriptions) {
  const { servers, userInfo } = await fetchAndParse(sub.url)
  const updated = subscriptions.map(s =>
    s.id === sub.id ? { ...s, servers, userInfo, lastUpdated: Date.now() } : s
  )
  return { success: true, subscriptions: updated }
}

function pingServer(address, port) {
  return new Promise(resolve => {
    const start = Date.now()
    const sock = new net.Socket()
    sock.setTimeout(3000)
    sock.connect(port, address, () => { sock.destroy(); resolve(Date.now() - start) })
    sock.on('error', () => { sock.destroy(); resolve(null) })
    sock.on('timeout', () => { sock.destroy(); resolve(null) })
  })
}

async function pingAll(sub, subscriptions) {
  const servers = await Promise.all(
    (sub.servers || []).map(async s => ({ ...s, ping: await pingServer(s.address, s.port) }))
  )
  const updated = subscriptions.map(s => s.id === sub.id ? { ...s, servers } : s)
  return { success: true, subscriptions: updated }
}

module.exports = { validateUrl, fetchAndParse, add, refresh, pingAll }
