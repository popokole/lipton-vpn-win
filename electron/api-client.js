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

// Сетевая ошибка запроса (не HTTP-ответ) — main.js проверяет, жив ли туннель VPN.
let networkErrorHandler = null
function onNetworkError(fn) { networkErrorHandler = fn }
function notifyNetworkError() {
  try { networkErrorHandler?.() } catch {}
}

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
    req.on('error', e => { notifyNetworkError(); reject(e) })
    req.on('timeout', () => { req.destroy(); notifyNetworkError(); reject(new Error('Таймаут запроса')) })
    if (payload) req.write(payload)
    req.end()
  })
}

function errMsg(resp, fallback) {
  return resp?.json?.error?.message || resp?.json?.message || fallback || `Ошибка ${resp?.status}`
}

// Ошибка HTTP с кодом и телом ответа: status, code (error.code, code или строка
// error — например 'card_unlink_cooldown', 'guest_trial_used') и data (весь JSON,
// там available_at / retry_at). Текст — как раньше (errMsg).
function apiError(resp, fallback) {
  const j = resp?.json && typeof resp.json === 'object' ? resp.json : {}
  const code = (j.error && typeof j.error === 'object' ? j.error.code : null) ||
    (typeof j.code === 'string' ? j.code : null) ||
    (typeof j.error === 'string' ? j.error : null) || undefined
  return Object.assign(new Error(errMsg(resp, fallback)), { status: resp?.status, code, data: j })
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
  if (resp.status >= 400) throw apiError(resp)
  return resp.json
}

// Публичный запрос; если вошли — с токеном (например, баннеры с таргетингом по
// аудитории). Токен не принят — повторяем без него.
async function optionalAuthed(method, path, body) {
  if (isAuthed()) {
    try { return await authed(method, path, body) } catch (e) { if (e.status !== 401) throw e }
  }
  const resp = await requestRaw(method, path, { body })
  if (resp.status >= 400) throw apiError(resp)
  return resp.json
}

async function publicGet(path, fallback) {
  const resp = await requestRaw('GET', path)
  if (resp.status >= 400) throw apiError(resp, fallback)
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

// ─── Устройства, ссылка подписки, способы входа, отмена ────────────────────
// Устройства (HWID) из панели и лимит: { devices: [{ hwid, platform, model, app, updated_at }], device_limit }.
function getDevices() { return authed('GET', '/me/devices') }
function revokeDevice(hwid) { return authed('POST', '/me/devices/revoke', { hwid }) }
function revokeAllDevices() { return authed('POST', '/me/devices/revoke-all') }
// «Обновить ссылку»: старая ссылка и все устройства на ней отключаются. expected_version —
// версия ссылки, которую видел пользователь (409, если её уже обновили). Ответ — View.
function relink(expectedVersion) {
  const body = Number.isInteger(expectedVersion) ? { expected_version: expectedVersion } : {}
  return authed('POST', '/me/subscription/relink', body)
}
// Способы входа: { identities: [{ id, type: 'email'|'telegram', identifier, is_primary, verified }] }.
function getIdentities() { return authed('GET', '/auth/identities') }
function deleteIdentity(id) { return authed('DELETE', '/auth/identities/' + encodeURIComponent(id)) }
// Отмена подписки: сразу, без возврата, привязанная карта удаляется.
function cancelSubscription() { return authed('POST', '/me/subscription/cancel', { confirm: true }) }
// Статус серверов (публичный): { servers: [{ name, country, status: up|down|unknown }], updated_at, stale }.
async function getServerStatus() {
  const resp = await requestRaw('GET', '/status/servers')
  if (resp.status >= 400) throw new Error(errMsg(resp, 'Не удалось получить статус серверов'))
  return resp.json
}

// ─── Оплата ───────────────────────────────────────────────────────────────
function checkout({ tariffCode, periodId, promoCode } = {}) {
  return authed('POST', '/payments/checkout', {
    tariff_code: tariffCode || '',
    period_id: periodId || '',
    promo_code: promoCode || '',
  })
}
// paymentStatus — активная проверка статуса платежа по transaction id (сервер
// сам дёрнет ЮKassa, если ещё pending). Возвращает { status, failure_reason }.
function paymentStatus(txId) { return authed('GET', '/payments/status/' + encodeURIComponent(txId)) }

// ─── Смена тарифа ───────────────────────────────────────────────────────────
// options — разрешённые переходы с текущей подписки (с зачётом остатка или
// «временный тариф» mode=overlay). available=false → reason показать как есть.
function changeOptions() { return authed('GET', '/me/subscription/change/options') }
// preview — один вариант, пересчитанный на текущий момент (перед подтверждением).
function changePreview({ tariffId, periodDays } = {}) {
  return authed('POST', '/me/subscription/change/preview', {
    tariff_id: tariffId,
    period_days: periodDays || 0,
  })
}
// change — подтверждение. idempotencyKey — один UUID на попытку (повтор с тем же
// ключом не спишет второй раз); expectedSurchargeKopeks — доплата из предпросмотра,
// чтобы сервер не списал другую сумму, если расчёт успел измениться.
function changeTariff({ tariffId, periodDays, idempotencyKey, expectedSurchargeKopeks } = {}) {
  const body = { tariff_id: tariffId, period_days: periodDays || 0 }
  if (idempotencyKey) body.idempotency_key = idempotencyKey
  if (typeof expectedSurchargeKopeks === 'number') body.expected_surcharge_kopeks = expectedSurchargeKopeks
  return authed('POST', '/me/subscription/change', body)
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

// ─── Пробный доступ ─────────────────────────────────────────────────────────
// Гость без аккаунта: 15 минут раз в сутки на устройство (device_id — HWID
// приложения). 200 { subscription_url, expires_at, server_name },
// 429 { error: 'guest_trial_used', retry_at }, 403 { error: 'guest_trial_disabled' }.
async function guestTrial({ deviceId, version } = {}) {
  const resp = await requestRaw('POST', '/guest/trial', {
    body: { device_id: String(deviceId || ''), platform: 'windows', app_version: version || appVersion() },
  })
  if (resp.status >= 400) throw apiError(resp, 'Не удалось включить пробный доступ')
  return resp.json
}
// Вошедший без подписки: 15 минут в день. 200 { expires_at, subscription_url },
// 409 { error: 'has_subscription' }, 429 { error: 'daily_trial_used', retry_at }.
function dailyTrial({ deviceId, version } = {}) {
  return authed('POST', '/me/daily-trial', { device_id: String(deviceId || ''), platform: 'windows', app_version: version || appVersion() })
}

// ─── Баннеры и экраны из админки ────────────────────────────────────────────
// { banners: [{ id, kind: banner|screen|update, style, title, text, cta_text,
// cta_url, dismissible, priority, starts_at, ends_at }] }
function getBanners(version) {
  return optionalAuthed('GET', `/app/banners?platform=windows&version=${encodeURIComponent(version || appVersion())}`)
}

// ─── Уведомления аккаунта ───────────────────────────────────────────────────
// { payment_reminders, news, telegram_messages } — о списаниях и оплатах
// сообщаем всегда, их не выключить.
function getNotifications() { return authed('GET', '/me/notifications') }
function setNotifications(prefs) { return authed('PUT', '/me/notifications', prefs || {}) }

// ─── Смена почты ────────────────────────────────────────────────────────────
// Код приходит на НОВЫЙ адрес (как привязка), затем /auth/email/change. Если
// адрес был у другого аккаунта, сервер их объединяет и отдаёт новые токены.
function emailChangeRequest(email) {
  return authed('POST', '/auth/link/request-code', { type: 'email', identifier: email })
}
async function emailChange(email, code) {
  const r = await authed('POST', '/auth/email/change', { new_email: email, code })
  if (r?.access_token && r?.refresh_token) setTokens(r)
  return r
}

// ─── Промокод ───────────────────────────────────────────────────────────────
// { valid, reason?, kind: percent|days, percent_off?, bonus_days? }. Сам код
// применяется при следующей оплате (promo_code в /payments/checkout).
function promoValidate(code) { return authed('POST', '/promo/validate', { code }) }

// ─── Поддержка: оценка ответа ИИ и оператор ─────────────────────────────────
function supportFeedback(messageId, helpful) {
  return authed('POST', '/support/ai/feedback', { message_id: messageId, helpful: !!helpful })
}
function supportOperator(dialogId) {
  return authed('POST', '/support/ai/operator', dialogId ? { dialog_id: dialogId } : {})
}

// ─── База знаний ────────────────────────────────────────────────────────────
// Статьи блога: [{ slug, title, category, minutes, excerpt }] и { …, html }.
// Пока ручки нет — частые вопросы /faq ({ items: [{ id, question, answer }] }).
function getArticles(category) {
  const q = category ? `?category=${encodeURIComponent(category)}` : ''
  return publicGet('/content/articles' + q, 'Не удалось загрузить статьи')
}
function getArticle(slug) {
  return publicGet('/content/articles/' + encodeURIComponent(String(slug || '')), 'Статья не найдена')
}
function getFaq() { return publicGet('/faq', 'Не удалось загрузить ответы') }

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
  getDevices, revokeDevice, revokeAllDevices, relink, getIdentities, deleteIdentity,
  cancelSubscription, getServerStatus,
  checkout, paymentStatus,
  changeOptions, changePreview, changeTariff,
  supportGet, supportCreate, supportSend,
  getAiDialog, aiChat, sendLogs,
  getNews,
  guestTrial, dailyTrial, getBanners, getNotifications, setNotifications,
  emailChangeRequest, emailChange, promoValidate, supportFeedback, supportOperator,
  getArticles, getArticle, getFaq,
  onNetworkError,
}
