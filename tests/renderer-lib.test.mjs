// Чистая логика окна ПК (редизайн): навигация, сводка тарифа, палитра свечения,
// разбор названий серверов. Запуск: npm test (node --test).
import test from 'node:test'
import assert from 'node:assert/strict'

import { navReducer, initialNav, topScreen, PAGES } from '../src/lib/nav.mjs'
import {
  planSummary, glowPalette, connectionLabel, guessPeriodDays, daysWord, fmtClock, fmtMinSec, isBypassTariff,
} from '../src/lib/plan.mjs'
import { flagCode, cleanRemark, flattenServers } from '../src/lib/servers.mjs'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 8, 12, 0, 0)

test('nav: разделы меню и стек подэкранов', () => {
  assert.deepEqual(PAGES, ['home', 'servers', 'news', 'settings'])
  let s = navReducer(undefined, { type: 'go', page: 'servers' })
  assert.deepEqual(s, { page: 'servers', stack: [] })
  // неизвестный раздел игнорируется
  assert.equal(navReducer(s, { type: 'go', page: 'nope' }), s)

  s = navReducer(s, { type: 'open', screen: 'account' })
  s = navReducer(s, { type: 'open', screen: 'billing', params: { overlay: 'bypass' } })
  assert.deepEqual(s.stack.map(e => e.screen), ['account', 'billing'])
  assert.deepEqual(topScreen(s), { screen: 'billing', params: { overlay: 'bypass' } })

  // тот же экран сверху — только новые параметры
  s = navReducer(s, { type: 'open', screen: 'billing' })
  assert.equal(s.stack.length, 2)
  assert.equal(topScreen(s).params, null)

  // экран ниже в стеке — возвращаемся к нему, верхние закрываются
  s = navReducer(s, { type: 'open', screen: 'account' })
  assert.deepEqual(s.stack.map(e => e.screen), ['account'])

  // «Назад» / Esc
  s = navReducer(s, { type: 'back' })
  assert.deepEqual(s.stack, [])
  assert.equal(navReducer(s, { type: 'back' }), s)
  assert.equal(topScreen(s), null)

  // переход в раздел закрывает подэкраны
  s = navReducer(navReducer(s, { type: 'open', screen: 'check' }), { type: 'go', page: 'servers' })
  assert.deepEqual(s, { page: 'servers', stack: [] })

  // close: экран и всё поверх него
  s = navReducer(navReducer(navReducer(s, { type: 'open', screen: 'a' }), { type: 'open', screen: 'b' }), { type: 'open', screen: 'c' })
  assert.deepEqual(navReducer(s, { type: 'close', screen: 'b' }).stack.map(e => e.screen), ['a'])
  assert.equal(navReducer(s, { type: 'close', screen: 'zzz' }), s)

  // replace и reset
  assert.deepEqual(navReducer(s, { type: 'replace', screen: 'd' }).stack.map(e => e.screen), ['a', 'b', 'd'])
  assert.equal(navReducer(s, { type: 'reset' }), initialNav)
})

test('plan: активная подписка — название из /config, дни и «до …»', () => {
  const p = planSummary({
    subscriptions: [{ id: 'managed', managed: true, status: 'active', expiresAt: NOW + 24 * DAY }],
    view: { status: 'active', tariff_code: 'base', current_period_end: new Date(NOW + 24 * DAY).toISOString(), subscription_url: 'https://x/sub' },
    config: { tariffs: [{ code: 'base', title: 'Базовый', periods: [{ id: 1, days: 30 }, { id: 2, days: 90 }] }] },
    now: NOW,
  })
  assert.equal(p.kind, 'active')
  assert.equal(p.title, 'Базовый')
  assert.equal(p.statusLabel, 'активна')
  assert.equal(p.daysLeft, 24)
  assert.match(p.untilLabel, /^до \d+ ноября$/)
  assert.equal(p.totalMs, 30 * DAY)
  assert.equal(p.progress, 24 / 30)
  assert.equal(p.bypass, false)
})

test('plan: пробный период, истекла, нет подписки, гостевой доступ', () => {
  const trial = planSummary({
    view: { status: 'trial', current_period_end: new Date(NOW + 2.5 * DAY).toISOString(), subscription_url: 'https://x' },
    now: NOW,
  })
  assert.equal(trial.kind, 'trial')
  assert.equal(trial.statusLabel, 'пробный период')
  assert.equal(trial.daysLeft, 3)

  const expired = planSummary({ view: { status: 'expired', current_period_end: new Date(NOW - DAY).toISOString(), subscription_url: 'https://x' }, now: NOW })
  assert.equal(expired.kind, 'expired')
  assert.equal(expired.statusLabel, 'истекла')
  assert.equal(expired.progress, 0)

  const none = planSummary({ view: { status: 'inactive' }, now: NOW })
  assert.equal(none.kind, 'none')
  assert.equal(none.title, 'Нет подписки')

  const guest = planSummary({
    subscriptions: [{ id: 't', isTrial: true, addedAt: NOW - 5 * 60000, expiresAt: NOW + 10 * 60000 }],
    guest: true,
    now: NOW,
  })
  assert.equal(guest.kind, 'guest')
  assert.equal(guest.msLeft, 10 * 60000)
  assert.equal(Math.round(guest.progress * 100), 67)
  assert.equal(fmtMinSec(guest.msLeft), '10:00')
})

test('plan: «Обход глушилок» и палитра свечения', () => {
  const p = planSummary({
    view: { status: 'active', tariff_code: 'obhod', current_period_end: new Date(NOW + 10 * DAY).toISOString(), subscription_url: 'https://x' },
    config: { tariffs: [{ code: 'obhod', title: 'Обход глушилок', periods: [{ days: 30 }] }] },
    now: NOW,
  })
  assert.equal(p.bypass, true)
  assert.equal(glowPalette('connected', p), 'bypass')
  assert.equal(glowPalette('reconnecting', { bypass: false }), 'active')
  for (const st of ['disconnected', 'connecting', 'disconnecting', 'error', 'kill-switch']) {
    assert.equal(glowPalette(st, p), 'off', st)
  }
  // временный тариф (overlay) тоже считается «Обходом»
  assert.equal(planSummary({ view: { status: 'active', overlay: { tariff_title: 'Обход глушилок' }, subscription_url: 'x', current_period_end: new Date(NOW + DAY).toISOString() }, now: NOW }).bypass, true)
  assert.equal(isBypassTariff('Базовый', 'base'), false)
})

test('plan: длина периода, слова и время', () => {
  assert.equal(guessPeriodDays({ periods: [{ days: 365 }, { days: 30 }, { days: 90 }] }, 24), 30)
  assert.equal(guessPeriodDays({ periods: [{ days: 30 }, { days: 90 }] }, 80), 90)
  assert.equal(guessPeriodDays({ periods: [{ days: 30 }] }, 45), 30)
  assert.equal(guessPeriodDays(null, 10), 30)
  assert.equal(guessPeriodDays({ period_days: 7 }, 3), 7)
  assert.deepEqual([1, 2, 5, 11, 21, 24].map(daysWord), ['день', 'дня', 'дней', 'дней', 'день', 'дня'])
  assert.equal(fmtClock(45 * 60000 + 28000), '00:45:28')
  assert.equal(fmtClock(-5), '00:00:00')
  assert.equal(connectionLabel('connected'), 'Защищено')
  assert.equal(connectionLabel('???'), 'Не защищено')
})

test('servers: флаг и название без эмодзи', () => {
  assert.equal(flagCode('🇩🇪 Германия · Франкфурт'), 'de')
  assert.equal(flagCode('Авто-баланс'), null)
  assert.equal(cleanRemark('🇳🇱 Нидерланды'), 'Нидерланды')
  assert.equal(cleanRemark('🇩🇪'), '🇩🇪')
  const all = flattenServers([{ id: 's1', isTrial: true, servers: [{ id: 'a' }] }, { id: 's2', servers: [{ id: 'b' }, { id: 'c' }] }, null])
  assert.deepEqual(all.map(s => [s.id, s.subId, !!s.isTrial]), [['a', 's1', true], ['b', 's2', false], ['c', 's2', false]])
})
