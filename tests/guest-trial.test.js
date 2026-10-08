// Гостевой доступ «15 минут без регистрации» и «15 минут бесплатно» (npm test).

const test = require('node:test')
const assert = require('node:assert/strict')

const g = require('../electron/guest-trial')
const bd = require('../electron/bypass-domains')

const MIN = 60 * 1000
const NOW = Date.UTC(2026, 9, 8, 11, 0, 0)

test('guest: длительность и флаг из /config (оба формата), мусор → 15 минут', () => {
  assert.equal(g.guestMinutes({ guest_trial: { enabled: true, minutes: 20 } }), 20)
  assert.equal(g.guestMinutes({ trial_guest_minutes: 30 }), 30)
  assert.equal(g.guestMinutes({ guest_trial: { minutes: -1 } }), 15)
  assert.equal(g.guestMinutes(null), 15)
  assert.equal(g.serverGuestEnabled({ guest_trial: { enabled: true } }), true)
  assert.equal(g.serverGuestEnabled({ trial_guest_enabled: true }), true)
  assert.equal(g.serverGuestEnabled({ guest_trial: { enabled: false }, trial_guest_enabled: true }), false)
  assert.equal(g.serverGuestEnabled({}), false)
})

test('guest: состояние из settings — мусор не ломает', () => {
  assert.deepEqual(g.normalizeGuest(null), {
    session: false, startedAt: null, expiresAt: null, retryAt: null, source: null, serverName: '', minutes: 15,
  })
  const st = g.normalizeGuest({ session: true, startedAt: NOW, expiresAt: '2026-10-08T11:15:00Z', source: 'server', serverName: 'Авто-баланс' })
  assert.equal(st.session, true)
  assert.equal(st.expiresAt, NOW + 15 * MIN)
  assert.equal(st.source, 'server')
  assert.equal(g.normalizeGuest({ source: 'evil' }).source, null)
})

test('guest: раз в сутки без сервера — от начала прошлой попытки', () => {
  assert.equal(g.localRetryAt(null, NOW), null)
  assert.equal(g.localRetryAt({ startedAt: NOW - 2 * 60 * MIN }, NOW), NOW - 2 * 60 * MIN + g.DAY)
  assert.equal(g.localRetryAt({ startedAt: NOW - g.DAY - 1 }, NOW), null)
  // retry_at от сервера (429) учитываем, пока он в будущем
  assert.equal(g.localRetryAt({ retryAt: NOW + 5 * MIN }, NOW), NOW + 5 * MIN)
  assert.equal(g.localRetryAt({ retryAt: NOW - 5 * MIN }, NOW), null)
})

test('guest: retry_at и expires_at из ответа сервера', () => {
  assert.equal(g.retryFromResponse({ retry_at: '2026-10-09T08:05:00Z' }, NOW), Date.UTC(2026, 9, 9, 8, 5))
  assert.equal(g.retryFromResponse({ error: { retry_at: NOW + MIN } }, NOW), NOW + MIN)
  assert.equal(g.retryFromResponse({ retry_at: Math.floor((NOW + MIN) / 1000) }, NOW), NOW + MIN) // секунды
  assert.equal(g.retryFromResponse({}, NOW), NOW + g.DAY)
  assert.equal(g.expiryFromResponse({ expires_at: '2026-10-08T11:15:00Z' }, NOW), NOW + 15 * MIN)
  assert.equal(g.expiryFromResponse({ expires_at: '2020-01-01T00:00:00Z' }, NOW, 15), NOW + 15 * MIN)
  assert.equal(g.expiryFromResponse(null, NOW, 20), NOW + 20 * MIN)
})

test('guest: пробная подписка и её окончание', () => {
  const guest = g.buildTrialSub({ kind: 'guest', url: 'https://example.invalid/s', servers: [{ id: 'a' }], expiresAt: NOW + 15 * MIN, now: NOW })
  assert.equal(guest.isTrial, true)
  assert.equal(guest.guest, true)
  assert.equal(guest.daily, undefined)
  const daily = g.buildTrialSub({ kind: 'daily', url: 'https://example.invalid/d', expiresAt: NOW + 15 * MIN, now: NOW })
  assert.equal(daily.daily, true)
  assert.equal(daily.name, '15 минут бесплатно')

  const managed = { id: 'managed', managed: true, isTrial: true, expiresAt: NOW - MIN }
  const own = { id: 'own', url: 'x' }
  const subs = [guest, managed, own]
  assert.equal(g.nextTrialExpiry(subs, NOW), NOW + 15 * MIN)
  assert.deepEqual(g.splitExpiredTrials(subs, NOW).expired, [])
  const later = g.splitExpiredTrials(subs, NOW + 15 * MIN)
  assert.deepEqual(later.expired.map(s => s.id), [guest.id])
  // подписку аккаунта не трогаем, даже если её срок прошёл (её ведёт account:sync)
  assert.deepEqual(later.kept.map(s => s.id), ['managed', 'own'])
  assert.equal(g.nextTrialExpiry(later.kept, NOW + 15 * MIN), null)
})

test('guest: при синхронизации аккаунта — гостевой доступ убираем, «15 минут» оставляем без ссылки', () => {
  const subs = [
    { id: 'managed', managed: true },
    { id: 'guest', isTrial: true, guest: true },
    { id: 'legacy-test', isTrial: true },
    { id: 'daily', isTrial: true, daily: true },
    { id: 'own' },
  ]
  assert.deepEqual(g.keepOnSync(subs, false).map(s => s.id), ['daily', 'own'])
  assert.deepEqual(g.keepOnSync(subs, true).map(s => s.id), ['own'])
  assert.deepEqual(g.keepOnSync(null, true), [])
})

test('домены: чистка, проверка, лимит 50 и даты', () => {
  assert.equal(bd.cleanDomain(' https://Sub.Example.com/path?q=1 '), 'sub.example.com')
  assert.equal(bd.cleanDomain('domain:corp.example'), 'corp.example')
  assert.equal(bd.cleanDomain('*.example.org'), 'example.org')
  assert.equal(bd.isValidDomain('steampowered.com'), true)
  assert.equal(bd.isValidDomain('localhost'), false)
  assert.equal(bd.isValidDomain('bad domain.com'), false)

  let r = bd.addDomain([], {}, 'Example.com', NOW)
  assert.equal(r.success, true)
  assert.deepEqual(r.domains, ['example.com'])
  assert.equal(r.meta['example.com'], NOW)
  assert.equal(bd.addDomain(r.domains, r.meta, 'example.com').success, false)
  assert.equal(bd.addDomain(r.domains, r.meta, '').error, 'Введите домен')
  assert.equal(bd.addDomain(r.domains, r.meta, 'not a domain').error, 'Неверный формат домена')

  const full = Array.from({ length: bd.MAX_DOMAINS }, (_, i) => `d${i}.example.com`)
  const over = bd.addDomain(full, {}, 'one-more.com')
  assert.equal(over.success, false)
  assert.match(over.error, /до 50 доменов/)

  // старые домены без даты (добавлены до 2.2) — addedAt: null
  const items = bd.withDates(['old.example', 'example.com'], r.meta)
  assert.deepEqual(items, [{ domain: 'old.example', addedAt: null }, { domain: 'example.com', addedAt: NOW }])
  const rm = bd.removeDomain(['old.example', 'example.com'], r.meta, 'example.com')
  assert.deepEqual(rm.domains, ['old.example'])
  assert.equal('example.com' in rm.meta, false)
  // мусор в настройках не ломает
  assert.deepEqual(bd.withDates(null, null), [])
  assert.equal(bd.addDomain('oops', [], 'a.com').success, true)
})
