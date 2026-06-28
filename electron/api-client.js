// Клиент бэкенда Lipton (site.popokole.online). Хранит токены в settings.json,
// прозрачно обновляет access по refresh при 401. Платформа — windows.
const https = require('https')
const os = require('os')
const { URL } = require('url')
const settingsManager = require('./settings-manager')

const API_BASE = process.env.LIPTON_API_BASE || 'https://site.popokole.online'

function appVersion() {
  try { return require('../package.json').version } catch { return '0.0.0' }
}

// ─── Хранилище токенов ──────────────────────────────────────────────────────

function getTokens() { return settingsManager.get('auth') || null }

function setTokens(pair) {
  settingsManager.set('auth', {
    access: pair.access_token,
    refresh: pair.refresh_token,
    expiresAt: Date.now() + (pair.expires_in || 900) * 1000,
  })
}

function clearTokens() { settingsManager.set('auth', null) }

function isAuthed() {
  const t = getTokens()
  return !!(t && t.refresh)
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

function requestRaw(method, path, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(API_BASE + path)
    const payload = body !== undefined ? JSON.stringify(body) : null
    const headers = {
      'Accept': 'application/json',
      'User-Agent': `LiptonVPN/${appVersion()} (Windows; x64)`,
      'X-Platform': 'windows',
      'X-Device-Label': os.hostname(),
    }
    if (payload) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = Buffer.byteLength(payload)
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      headers,
      timeout: 20000,
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        let json = null
        try { json = data ? JSON.parse(data) : null } catch {}
        resolve({ status: res.statusCode, json })
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Таймаут запроса')) })
    if (payload) req.write(payload)
    req.end()
  })
}

function errMsg(resp, fallback) {
  return resp?.json?.error?.message || resp?.json?.message || fallback || `Ошибка ${resp?.status}`
}

// ─── Refresh + защищённый запрос ────────────────────────────────────────────

async function refresh() {
  const t = getTokens()
  if (!t || !t.refresh) return false
  try {
    const resp = await requestRaw('POST', '/auth/refresh', { body: { refresh_token: t.refresh } })
    if (resp.status === 200 && resp.json?.access_token) { setTokens(resp.json); return true }
  } catch {}
  return false
}

// authed выполняет запрос с Bearer и одной попыткой refresh при 401.
async function authed(method, path, body, _retry = false) {
  const t = getTokens()
  const resp = await requestRaw(method, path, { body, token: t?.access })
  if (resp.status === 401 && !_retry) {
    if (await refresh()) return authed(method, path, body, true)
    clearTokens()
    throw Object.assign(new Error('Сессия истекла, войдите снова'), { code: 'unauthorized', status: 401 })
  }
  if (resp.status >= 400) throw Object.assign(new Error(errMsg(resp)), { status: resp.status })
  return resp.json
}

// ─── Публичные флоу входа ───────────────────────────────────────────────────

async function emailRequest(email) {
  const resp = await requestRaw('POST', '/auth/request-code', { body: { type: 'email', identifier: email } })
  if (resp.status >= 400) throw new Error(errMsg(resp, 'Не удалось отправить код'))
  return true
}

async function emailVerify(email, code) {
  const resp = await requestRaw('POST', '/auth/verify', { body: { type: 'email', identifier: email, code } })
  if (resp.status >= 400 || !resp.json?.access_token) throw new Error(errMsg(resp, 'Неверный код'))
  setTokens(resp.json)
  return true
}

async function tgInit() {
  const resp = await requestRaw('POST', '/auth/telegram/init', {})
  if (resp.status >= 400) throw new Error(errMsg(resp, 'Не удалось начать вход'))
  return resp.json // { link, link_token, ttl }
}

async function tgVerify(linkToken, code) {
  const resp = await requestRaw('POST', '/auth/telegram/verify', { body: { link_token: linkToken, code } })
  if (resp.status >= 400 || !resp.json?.access_token) throw new Error(errMsg(resp, 'Неверный код'))
  setTokens(resp.json)
  return true
}

async function deviceExchange(code) {
  const resp = await requestRaw('POST', '/auth/device/exchange', { body: { code } })
  if (resp.status >= 400 || !resp.json?.access_token) throw new Error(errMsg(resp, 'Неверный или истёкший код'))
  setTokens(resp.json)
  return true
}

async function logout() {
  try { await authed('POST', '/auth/logout') } catch {}
  clearTokens()
}

// ─── Данные аккаунта ────────────────────────────────────────────────────────

function getSubscription() { return authed('GET', '/me/subscription') }

module.exports = {
  API_BASE,
  isAuthed, getTokens, clearTokens, refresh,
  emailRequest, emailVerify, tgInit, tgVerify, deviceExchange, logout,
  getSubscription,
}
