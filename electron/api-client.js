// Клиент бэкенда Lipton (liptonone.online). Хранит токены в settings.json,
// прозрачно обновляет access по refresh при 401. Платформа — windows.
const https = require('https')
const os = require('os')
const { URL } = require('url')
const settingsManager = require('./settings-manager')

const API_BASE = process.env.LIPTON_API_BASE || 'https://liptonone.online'

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

// single-flight: параллельные 401-запросы делят ОДИН refresh, иначе токен
// ротируется гонкой и сервер отвечает 429 «слишком много запросов».
let _refreshing = null
// refresh возвращает { ok, invalid }:
//   ok=true            — токены обновлены;
//   invalid=true       — сервер ЯВНО отклонил refresh-токен (401/400) → надо разлогинить;
//   invalid=false      — транзиентный сбой (сеть/5xx) → сессию НЕ трогаем.
// Важно: раньше при любом провале refresh (в т.ч. сетевом блипе — например при
// переподключении VPN после отвязки устройства) токены стирались и юзера
// выкидывало из аккаунта. Теперь разлогин только на реальный отказ токена.
function refresh() {
  if (_refreshing) return _refreshing
  _refreshing = (async () => {
    const t = getTokens()
    if (!t || !t.refresh) return { ok: false, invalid: true }
    try {
      const resp = await requestRaw('POST', '/auth/refresh', { body: { refresh_token: t.refresh } })
      if (resp.status === 200 && resp.json?.access_token) { setTokens(resp.json); return { ok: true, invalid: false } }
      return { ok: false, invalid: resp.status === 401 || resp.status === 400 }
    } catch {
      return { ok: false, invalid: false } // сеть/таймаут — не разлогиниваем
    }
  })().finally(() => { _refreshing = null })
  return _refreshing
}

// authed выполняет запрос с Bearer и одной попыткой refresh при 401.
async function authed(method, path, body, _retry = false) {
  const t = getTokens()
  const resp = await requestRaw(method, path, { body, token: t?.access })
  if (resp.status === 401 && !_retry) {
    const r = await refresh()
    if (r.ok) return authed(method, path, body, true)
    if (r.invalid) clearTokens() // только реальный отказ токена рвёт сессию
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

// tgPoll — авто-вход: опрашивает бэкенд, привязал ли бот chat к сессии. Пока нет
// — { done:false } (pending). Как только пользователь нажал Start в боте —
// сохраняет токены и возвращает { done:true }.
async function tgPoll(linkToken) {
  const resp = await requestRaw('POST', '/auth/telegram/poll', { body: { link_token: linkToken } })
  if (resp.status >= 400) throw new Error(errMsg(resp, 'Сессия входа истекла'))
  if (resp.json?.access_token) { setTokens(resp.json); return { done: true } }
  return { done: false }
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

// ─── Данные аккаунта (личный кабинет) ──────────────────────────────────────

function getSubscription() { return authed('GET', '/me/subscription') }
function getProfile() { return authed('GET', '/me') }
function getTransactions() { return authed('GET', '/me/transactions') }
// /config публичный (без токена) — нужен и на экране входа (тест-доступ).
async function getConfig() {
  const resp = await requestRaw('GET', '/config')
  if (resp.status >= 400) throw new Error(errMsg(resp, 'Не удалось получить конфиг'))
  return resp.json
}
function deleteCard() { return authed('DELETE', '/payments/card') }

// ─── Оплата ───────────────────────────────────────────────────────────────
function checkout({ tariffCode, periodId, promoCode } = {}) {
  return authed('POST', '/payments/checkout', {
    tariff_code: tariffCode || '',
    period_id: periodId || '',
    promo_code: promoCode || '',
  })
}

// ─── Поддержка ──────────────────────────────────────────────────────────────
function supportGet() { return authed('GET', '/support/ticket') }
function supportCreate(diagnostics, logs) {
  return authed('POST', '/support/tickets', { diagnostics: diagnostics || {}, logs: logs || [] })
}
function supportSend(body) { return authed('POST', '/support/messages', { body }) }

// ─── ИИ-помощник / единый чат поддержки ─────────────────────────────────────
// Тот же диалог, что и на сайте (таблица ai_dialogs): ИИ отвечает, оператор
// перехватывает вручную. Так чат в приложении и на сайте — общий.
function getAiDialog() { return authed('GET', '/support/ai/dialog') }
function aiChat(message) { return authed('POST', '/support/ai', { message }) }
// Логи уходят В ЧАТ: пользователь увидит «📎 отправлены логи», а ИИ/оператор —
// полную расшифровку (сервер прячет её в detail).
function sendLogs(logs, note) { return authed('POST', '/support/ai/logs', { logs, note }) }

// ─── Новости ─────────────────────────────────────────────────────────────────
// /news публичный (без токена) — лента VPN-новостей, как в веб-кабинете.
async function getNews() {
  const resp = await requestRaw('GET', '/news')
  if (resp.status >= 400) throw new Error(errMsg(resp, 'Не удалось загрузить новости'))
  return resp.json // { items: [...] }
}

module.exports = {
  API_BASE,
  isAuthed, getTokens, clearTokens, refresh,
  emailRequest, emailVerify, tgInit, tgPoll, tgVerify, deviceExchange, logout,
  getSubscription, getProfile, getTransactions, getConfig, deleteCard,
  checkout,
  supportGet, supportCreate, supportSend,
  getAiDialog, aiChat, sendLogs,
  getNews,
}
