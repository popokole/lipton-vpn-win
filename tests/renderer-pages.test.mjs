// Логика экранов окна ПК: плитки главной, серверы, новости, настройки.
// Запуск: npm test (node --test).
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  fmtNum, fmtBytes, fmtBytesText, fmtMbps, toMbps, pingStability, sparkline, barHeights, rangeHeights,
  lastN, weekLabels, weekRange, vsAverage, weekAverage, exposureView,
} from '../src/lib/stats.mjs'
import {
  isAutoBalance, isBypassServer, splitRemark, pingTag, signalLevel, pingTone, serverAccent, groupServers,
} from '../src/lib/servers.mjs'
import { planSummary, rub, tariffInfo, bypassOffer, cheapestMonthly } from '../src/lib/plan.mjs'
import { newsTag, newsKey, fmtNewsDate, unreadKeys, markRead, agoLabel } from '../src/lib/news.mjs'
import {
  lastSeenLabel, deviceInfo, sinceLabel, initialOf, domainsWord, domainName, cancelWarning,
} from '../src/lib/settings.mjs'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 9, 8, 12, 0, 0).getTime() // 8 октября 2026, 12:00 местного
const GB = 1024 ** 3
const CONFIG = {
  tariffs: [
    { code: 'base', title: 'Базовый', periods: [{ id: 1, days: 30, price_kopeks: 15900 }, { id: 2, days: 90, price_kopeks: 39900 }, { id: 3, days: 365, price_kopeks: 119900 }] },
    { code: 'obhod', title: 'Обход глушилок', periods: [{ id: 4, days: 30, price_kopeks: 49900 }] },
  ],
}

test('stats: ГБ, Мбит/с, числа по-русски', () => {
  assert.equal(fmtNum(1.84), '1,8')
  assert.deepEqual(fmtBytes(1.8 * GB), { value: '1,8', unit: 'ГБ' })
  assert.deepEqual(fmtBytes(221 * 1024 ** 2), { value: '221', unit: 'МБ' })
  assert.deepEqual(fmtBytes(0), { value: '0', unit: 'МБ' })
  assert.equal(fmtBytesText(512 * 1024), '512 КБ')
  assert.equal(toMbps(125000), 1)
  assert.equal(fmtMbps(23.3e6), '186,4')
  assert.equal(fmtMbps(0), '0')
  assert.equal(fmtMbps(5000), '0,04')
})

test('stats: стабильность пинга, спарклайн, столбики', () => {
  assert.equal(pingStability([{ ms: 40 }, { ms: 42 }]), null)
  assert.equal(pingStability([40, 42, 41, 43, 40].map(ms => ({ ms }))).label, 'стабильно')
  assert.equal(pingStability([40, 80, 45, 90, 40].map(ms => ({ ms }))).tone, 'bad')
  assert.equal(pingStability([{ ms: 40 }, { ms: null }, { ms: null }, { ms: 41 }]).label, 'есть потери')

  assert.equal(sparkline([5], 100, 30), null)
  const s = sparkline([10, null, 30], 100, 30, 4)
  assert.equal(s.line.split(' ').length, 2) // пропуск не рисуется
  assert.deepEqual(s.last, { x: 96, y: 4 }) // максимум — вверху справа
  assert.ok(s.area.endsWith('96,30 4,30'))

  assert.deepEqual(barHeights([0, 5, 10], 34), [3, 17, 34])
  assert.deepEqual(rangeHeights([40, 44, 0, 42], 32, 12, 4), [12, 32, 4, 22])
  assert.deepEqual(rangeHeights([40, 40], 32, 12), [22, 22])
  assert.deepEqual(lastN([1, 2], 4), [0, 0, 1, 2])
})

test('stats: неделя — подписи, диапазон, сравнение со средним', () => {
  const week = [1.15, 0.85, 1.6, 1.1, 2.0, 0.95, 1.8].map((g, i) => {
    const d = new Date(NOW); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i - 6)
    return { key: String(i), date: d.getTime(), total: Math.round(g * GB) }
  })
  assert.deepEqual(weekLabels(week), ['Пт', 'Сб', 'Вс', 'Пн', 'Вт', 'Ср', 'Чт'])
  assert.equal(weekRange(week), '2–8 октября')
  assert.equal(weekRange(week, true), '2–8 окт.')
  assert.equal(vsAverage(week), 41)
  assert.equal(Math.round((weekAverage(week) / GB) * 10) / 10, 1.3)
  // без прошлых дней сравнивать не с чем
  assert.equal(vsAverage([{ total: 0 }, { total: 5 }]), null)
  assert.equal(vsAverage([{ total: 5 }, { total: 0 }]), null)
  const cross = [new Date(2026, 8, 28), new Date(2026, 9, 4)].map(d => ({ date: d.getTime() }))
  assert.equal(weekRange(cross), '28 сентября – 4 октября')
})

test('stats: «что видят сайты» и «Защита» из проверки', () => {
  assert.equal(exposureView(null, { on: true }).state, 'checking')
  assert.equal(exposureView(null, { on: false }).state, 'unknown')

  const off = exposureView({ kind: 'direct', ok: true, ip: '91.204.18.77', country: 'RU', countryName: 'Россия', ipv6: true })
  assert.equal(off.ip, '91.204.18.77')
  assert.equal(off.exposed, true)
  assert.deepEqual(off.items.map(i => i.label), ['IPv6 открыт', 'DNS провайдера'])
  assert.equal(off.leaks, 2)
  assert.equal(exposureView({ kind: 'direct', ok: true, ipv6: false }).items[0].label, 'IP открыт')

  const full = {
    items: [
      { id: 'chatgpt', status: 'ok', value: 'Германия', country: 'DE', detail: 'IP 185.225.31.42' },
      { id: 'cloudflare', status: 'ok', value: 'Германия', country: 'DE', ip: '185.225.31.42' },
      { id: 'ipv6', status: 'ok' },
      { id: 'dns', status: 'ok', value: 'Через VPN' },
    ],
  }
  const on = exposureView(full, { on: true })
  assert.equal(on.country, 'DE')
  assert.equal(on.countryName, 'Германия')
  assert.equal(on.ip, '185.225.31.42')
  assert.equal(on.leaks, 0)
  assert.equal(on.active, true)
  assert.deepEqual(on.items.map(i => i.label), ['IPv6 закрыт', 'DNS через VPN'])

  const leak = exposureView({
    items: [
      { id: 'cloudflare', status: 'fail', value: 'Россия', country: 'RU', detail: 'IP 91.204.18.77' },
      { id: 'ipv6', status: 'fail' },
      { id: 'dns', status: 'warn', value: 'Мимо VPN' },
    ],
  }, { on: true })
  assert.equal(leak.ip, '91.204.18.77') // старый формат: IP из detail
  assert.equal(leak.exposed, true)
  assert.equal(leak.leaks, 3)
  assert.deepEqual(leak.items.map(i => i.label), ['IPv6 открыт', 'DNS мимо VPN'])
})

test('servers: Авто-баланс, «Обход», подписи и пинг', () => {
  assert.equal(isAutoBalance('Авто-баланс'), true)
  assert.equal(isAutoBalance('🇩🇪 Германия'), false)
  assert.equal(isBypassServer('🇩🇪 Обход · Германия'), true)
  assert.deepEqual(splitRemark('🇩🇪 Германия · Франкфурт'), { title: 'Германия', sub: 'Франкфурт' })
  assert.deepEqual(splitRemark('Авто-баланс'), { title: 'Авто-баланс', sub: '' })
  assert.deepEqual([null, 41, 120, 200].map(ms => pingTag(ms).label), ['пинг не измерен', 'низкий пинг', 'стабильный', 'высокий пинг'])
  assert.deepEqual([null, 40, 100, 200, 400].map(signalLevel), [0, 4, 3, 2, 1])
  assert.deepEqual([null, 40, 250, 300, 400].map(pingTone), ['none', 'ok', 'ok', 'warn', 'bad'])
  assert.deepEqual([0, 1, 2, 3].map(i => serverAccent(i, 40)), ['emerald', 'cyan', 'blue', 'emerald'])
  assert.equal(serverAccent(0, 260), 'orange')
  assert.equal(serverAccent(0, 40, true), 'violet')

  const list = [{ id: 'a', remark: 'Авто-баланс' }, { id: 'b', remark: 'Обход · DE' }, { id: 'c', remark: '🇩🇪 Германия' }]
  let g = groupServers(list)
  assert.equal(g.auto.id, 'a')
  assert.deepEqual(g.bypass, [])
  assert.deepEqual(g.regular.map(s => s.id), ['b', 'c'])
  g = groupServers(list, { bypassPlan: true })
  assert.deepEqual(g.bypass.map(s => s.id), ['b'])
  assert.deepEqual(g.regular.map(s => s.id), ['c'])
  assert.equal(groupServers([]).auto, null)
})

test('plan: цена срока, предложение «Обхода», месяц от', () => {
  assert.equal(rub(15900), '159 ₽')
  assert.equal(rub(19950), '199,5 ₽')
  assert.equal(tariffInfo(CONFIG, 'base', 90).priceKopeks, 39900)
  assert.equal(tariffInfo(CONFIG, 'base', 45).priceKopeks, null)
  assert.equal(tariffInfo(CONFIG, null, 30).tariff, null)
  assert.deepEqual(bypassOffer(CONFIG), { code: 'obhod', title: 'Обход глушилок', days: 30, priceKopeks: 49900 })
  assert.equal(bypassOffer({ tariffs: [CONFIG.tariffs[0]] }), null)
  assert.equal(cheapestMonthly(CONFIG), 15900)
  assert.equal(cheapestMonthly({ tariffs: [{ periods: [{ days: 365, price_kopeks: 119900 }] }] }), 9900)
  assert.equal(cheapestMonthly(null), null)

  const p = planSummary({
    view: { status: 'active', tariff_code: 'base', current_period_end: new Date(NOW + 24 * DAY).toISOString(), subscription_url: 'x', canceled: false },
    config: CONFIG,
    now: NOW,
  })
  assert.equal(p.code, 'base')
  assert.equal(p.periodDays, 30)
  assert.equal(p.priceKopeks, 15900)
  assert.equal(p.canceled, false)
})

test('news: чип, дата, непрочитанные локально', () => {
  assert.deepEqual(newsTag({ category: 'update' }), { label: 'Обновление', tone: 'emerald' })
  assert.deepEqual(newsTag({ source_name: 'Хабр' }), { label: 'Хабр', tone: 'cyan' })
  assert.equal(newsTag({}).label, 'Lipton VPN')
  assert.equal(newsKey({ id: 7 }), '7')
  assert.equal(fmtNewsDate(NOW - DAY, NOW), '7 октября')
  assert.equal(fmtNewsDate(new Date(2025, 0, 3).getTime(), NOW), '3 января 2025 г.')

  const items = [
    { id: 1, published_at: NOW - DAY },
    { id: 2, published_at: new Date(NOW - 3 * DAY).toISOString() },
    { id: 3, published_at: NOW - 30 * DAY }, // старая — не горит
    { id: 4 },
  ]
  assert.deepEqual(unreadKeys(items, ['2'], NOW), ['1'])
  assert.deepEqual(unreadKeys(items, [], NOW), ['1', '2'])
  assert.deepEqual(markRead(['1'], ['1', '2']), ['1', '2'])
  assert.deepEqual(markRead([], '5'), ['5'])
  assert.equal(markRead(Array.from({ length: 310 }, (_, i) => String(i)), ['x']).length, 300)

  assert.equal(agoLabel(NOW - 20000, NOW), 'обновлено только что')
  assert.equal(agoLabel(NOW - 5 * 60000, NOW), 'обновлено 5 мин назад')
  assert.equal(agoLabel(NOW - 3 * 3600000, NOW), 'обновлено 3 ч назад')
})

test('settings: устройства, аккаунт, домены, отмена подписки', () => {
  assert.equal(lastSeenLabel(NOW - 60000, NOW), 'в сети')
  assert.match(lastSeenLabel(new Date(2026, 9, 8, 9, 5).getTime(), NOW), /^сегодня в 09:05$/)
  assert.match(lastSeenLabel(new Date(2026, 9, 7, 22, 14).getTime(), NOW), /^вчера в 22:14$/)
  assert.equal(lastSeenLabel(new Date(2026, 9, 3).getTime(), NOW), '3 октября')
  assert.equal(lastSeenLabel(null, NOW), '')

  assert.deepEqual(deviceInfo({ platform: 'Windows', model: 'DESKTOP-7K2' }), { title: 'Windows · DESKTOP-7K2', platform: 'Windows', desktop: true })
  assert.equal(deviceInfo({ platform: 'iOS', model: 'iPhone 15', app: 'Happ' }).title, 'iPhone 15 · Happ')
  assert.equal(deviceInfo({}).title, 'Устройство')

  assert.equal(sinceLabel('2026-03-01T12:00:00Z'), 'с марта 2026')
  assert.equal(initialOf('user'), 'U')
  assert.equal(initialOf(''), 'L')
  assert.deepEqual([1, 3, 5, 11, 21].map(domainsWord), ['домен', 'домена', 'доменов', 'доменов', 'домен'])
  assert.equal(domainName('a.com'), 'a.com')
  assert.equal(domainName({ domain: 'b.com', addedAt: 1 }), 'b.com')

  const w = cancelWarning({ daysLeft: 24, untilLabel: 'до 1 ноября', hasCard: true })
  assert.match(w, /^Подписка закончится сразу\./)
  assert.match(w, /Оставшиеся 24 дн\. \(до 1 ноября\) сгорят — деньги не возвращаются\./)
  assert.match(w, /карта будет удалена/)
  assert.match(cancelWarning({}), /Деньги не возвращаются\. Автопродление отключится\./)
})
