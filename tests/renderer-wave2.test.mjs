// Вторая волна окна ПК: гостевой режим, баннеры из админки, подэкраны настроек.
// Запуск: npm test (node --test).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { guestView, retryLabel, trialMinutes, serverTrialEnabled, minutesWord } from '../src/lib/guest.mjs'
import { compareVersions, belowMinVersion, activeBanners, layoutBanners, safeUrl } from '../src/lib/banners.mjs'
import {
  txStatus, txTitle, txMeta, txSummary, txGroups, txIcon, parseLogLine, logsCountLabel, addedLabel,
  cardView, inDaysLabel, unlinkText, promoBenefit, promoHeadline,
} from '../src/lib/screens.mjs'
import { planSummary } from '../src/lib/plan.mjs'

const require = createRequire(import.meta.url)
const gt = require('../electron/guest-trial.js')

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN
const NOW = new Date(2026, 9, 8, 12, 0, 0).getTime() // локальное время: «сегодня / завтра»

test('guest: режим — нет / идёт / закончился', () => {
  const g = { session: true, startedAt: NOW - 3 * MIN, expiresAt: NOW + 12 * MIN, retryAt: NOW + DAY }
  const v = guestView({ guest: g, now: NOW })
  assert.equal(v.mode, 'active')
  assert.equal(v.msLeft, 12 * MIN)
  assert.equal(v.totalMs, 15 * MIN)
  assert.equal(Math.round(v.progress * 100), 80)
  assert.equal(guestView({ guest: g, now: NOW + 13 * MIN }).mode, 'ended')
  assert.equal(guestView({ guest: g, authed: true, now: NOW }).mode, 'none')
  assert.equal(guestView({ guest: { ...g, session: false }, now: NOW }).mode, 'none')
  assert.equal(guestView({ guest: null, now: NOW }).mode, 'none')
  // retryAt в прошлом не показываем
  assert.equal(guestView({ guest: { ...g, retryAt: NOW - 1 }, now: NOW }).retryAt, null)
})

test('guest: «следующая попытка — завтра в 14:05», минуты и флаг из /config', () => {
  assert.equal(retryLabel(new Date(2026, 9, 8, 18, 30).getTime(), NOW), 'сегодня в 18:30')
  assert.equal(retryLabel(new Date(2026, 9, 9, 14, 5).getTime(), NOW), 'завтра в 14:05')
  assert.match(retryLabel(new Date(2026, 9, 12, 9, 0).getTime(), NOW), /^12 октября в 09:00$/)
  assert.equal(retryLabel(NOW - 1, NOW), '')
  assert.equal(trialMinutes({ guest_trial: { minutes: 20 } }), 20)
  assert.equal(trialMinutes(null), 15)
  assert.equal(serverTrialEnabled({ guest_trial: { enabled: true } }), true)
  assert.equal(serverTrialEnabled({}), false)
  assert.equal(minutesWord(15), 'минут')
  assert.equal(minutesWord(21), 'минута')
  assert.equal(minutesWord(3), 'минуты')
})

test('guest: ответы сервера — next_available_at и «уже пробовали» vs «слишком часто»', () => {
  assert.equal(gt.nextFromResponse({ next_available_at: new Date(NOW + 5 * MIN).toISOString() }, NOW), NOW + 5 * MIN)
  assert.equal(gt.nextFromResponse({}, NOW), NOW + DAY)
  assert.equal(gt.isTrialUsed({ status: 429, code: 'guest_trial_used' }, 'guest_trial_used'), true)
  assert.equal(gt.isTrialUsed({ status: 429 }, 'guest_trial_used'), true)
  assert.equal(gt.isTrialUsed({ status: 429, code: 'rate_limited' }, 'guest_trial_used'), false)
  assert.equal(gt.isTrialUsed({ status: 503, code: 'guest_trial_unavailable' }, 'guest_trial_used'), false)
})

test('plan: гость без подписки после окончания и «15 минут бесплатно» у вошедшего', () => {
  const ended = planSummary({ subscriptions: [], view: null, guest: true, now: NOW })
  assert.equal(ended.kind, 'guest-ended')
  const daily = { id: 'd', isTrial: true, daily: true, addedAt: NOW - 5 * MIN, expiresAt: NOW + 10 * MIN, servers: [] }
  const p = planSummary({ subscriptions: [daily], view: { status: 'inactive' }, now: NOW })
  assert.equal(p.kind, 'daily')
  assert.equal(p.msLeft, 10 * MIN)
  // своя подписка у аккаунта важнее бесплатных минут
  const withSub = planSummary({ subscriptions: [daily], view: { status: 'active', subscription_url: 'x', current_period_end: new Date(NOW + 3 * DAY).toISOString() }, now: NOW })
  assert.equal(withSub.kind, 'active')
  // «15 минут» вошедшего не принимаются за гостевой доступ, пока /me/subscription грузится
  assert.equal(planSummary({ subscriptions: [daily], view: null, now: NOW }).kind, 'daily')
})

test('banners: версии, сроки, закрытые, обязательное обновление', () => {
  assert.equal(compareVersions('2.1.0', '2.10.0'), -1)
  assert.equal(compareVersions('v2.1', '2.1.0'), 0)
  assert.equal(compareVersions('3.0.0', '2.9.9'), 1)
  assert.equal(belowMinVersion('2.1.0', { min_app_versions: { windows: '2.2.0' } }), true)
  assert.equal(belowMinVersion('2.1.0', { min_app_versions: { windows: '2.0.0' } }), false)
  assert.equal(belowMinVersion('2.1.0', { min_app_versions: {} }), false)
  assert.equal(safeUrl('https://liptonone.online/x'), 'https://liptonone.online/x')
  assert.equal(safeUrl('javascript:alert(1)'), '')
  assert.equal(safeUrl('http://insecure.example'), '')

  const list = activeBanners([
    { id: 1, kind: 'banner', style: 'promo', title: 'Скидка', priority: 1 },
    { id: 2, kind: 'banner', title: 'Старый', ends_at: new Date(NOW - MIN).toISOString() },
    { id: 3, kind: 'banner', title: 'Будущий', starts_at: new Date(NOW + MIN).toISOString() },
    { id: 4, kind: 'screen', title: 'Экран', priority: 5, cta_url: 'javascript:x' },
    { id: 5, kind: 'update', title: 'Обновите', dismissible: false, priority: 10 },
    { id: 6, kind: 'banner', title: 'Закрытый', dismissible: true },
    { id: 7, kind: 'weird', style: 'neon', title: 'Мусор' },
    { id: 8 },
  ], { now: NOW, dismissed: ['6', '5'] })
  assert.deepEqual(list.map(b => b.id), ['5', '4', '1', '7']) // обязательное не закрыть
  assert.equal(list.find(b => b.id === '4').ctaUrl, '')
  assert.equal(list.find(b => b.id === '7').kind, 'banner')
  assert.equal(list.find(b => b.id === '7').style, 'info')
  const lay = layoutBanners(list)
  assert.equal(lay.blocking.id, '5')
  assert.equal(lay.screen.id, '4')
  assert.deepEqual(lay.slot.map(b => b.id), ['1', '7'])
  assert.equal(layoutBanners(activeBanners([{ id: 9, kind: 'update', title: 'Можно позже' }])).blocking, null)
})

test('история платежей: заголовки, статусы, итоги и месяцы', () => {
  const tx = [
    { id: 'a', kind: 'subscription', status: 'succeeded', amount_kopeks: 15900, created_at: new Date(2026, 9, 8).toISOString(), tariff_title: 'Базовый', period_days: 30, method: 'card', card_last4: '4242' },
    { id: 'b', kind: 'change', status: 'succeeded', amount_kopeks: 31100, created_at: new Date(2026, 9, 2).toISOString(), tariff_title: 'Обход', method: 'sbp' },
    { id: 'c', kind: 'subscription', status: 'failed', amount_kopeks: 15900, created_at: new Date(2026, 8, 13).toISOString() },
    { id: 'd', kind: 'initial', status: 'refunded', amount_kopeks: 39900, created_at: new Date(2025, 2, 12).toISOString() },
  ]
  assert.equal(txTitle(tx[0]), 'Базовый · 30 дней')
  assert.equal(txTitle(tx[1]), 'Смена тарифа: Обход')
  assert.equal(txTitle(tx[2]), 'Продление подписки') // старый сервер — без тарифа
  assert.equal(txStatus('succeeded').label, 'Оплачено')
  assert.equal(txStatus('failed').tone, 'warn')
  assert.equal(txStatus('refunded').label, 'Возврат')
  assert.equal(txIcon(tx[2]), 'warning')
  assert.equal(txMeta(tx[0]), '8 октября · карта •••• 4242')
  assert.equal(txMeta(tx[1]), '2 октября · доплата · СБП')
  const sum = txSummary(tx)
  assert.equal(sum.paidKopeks, 47000)
  assert.deepEqual(sum.chips, ['2 оплаты', '1 возврат', '1 не прошёл'])
  const groups = txGroups(tx, NOW)
  assert.deepEqual(groups.map(g => g.label), ['Октябрь', 'Сентябрь', 'Март 2025'])
  assert.equal(groups[0].items.length, 2)
})

test('логи, домены, способ оплаты, промокод', () => {
  assert.deepEqual(parseLogLine('[14:02:17] [WARN] [Ping] Нидерланды: 142 мс'), { time: '14:02:17', level: 'warn', tag: 'Ping', text: 'Нидерланды: 142 мс' })
  assert.deepEqual(parseLogLine('[14:02:17] [INFO] Без тега'), { time: '14:02:17', level: 'info', tag: '', text: 'Без тега' })
  assert.equal(parseLogLine('просто текст').text, 'просто текст')
  assert.equal(logsCountLabel(10), '10 записей')
  assert.equal(logsCountLabel(1), '1 запись')
  assert.equal(addedLabel(null), 'Добавлен раньше')
  assert.match(addedLabel(new Date(2026, 9, 6).getTime()), /^Добавлен 6 октября$/)

  assert.equal(cardView({ has_card: false }), null)
  const card = cardView({
    has_card: true, card_last4: '4242', card_brand: 'Visa', card_exp: '08/28', auto_renew: true,
    card_unlink_available_at: new Date(NOW + 5 * 3600000).toISOString(),
    next_charge_at: new Date(2026, 10, 1, 10).toISOString(), next_charge_kopeks: 15900, next_charge_period_days: 30,
  }, NOW)
  assert.equal(card.brand, 'Visa')
  assert.equal(card.unlinkAt, NOW + 5 * 3600000)
  assert.equal(cardView({ has_card: true, card_brand: 'Unknown', card_unlink_available_at: new Date(NOW - 1).toISOString() }, NOW).unlinkAt, null)
  assert.equal(cardView({ has_card: true, card_brand: 'Unknown' }, NOW).brand, '')
  assert.equal(inDaysLabel(new Date(2026, 10, 1).getTime(), NOW), 'через 24 дня')
  assert.equal(inDaysLabel(new Date(2026, 9, 9, 3).getTime(), NOW), 'завтра')
  assert.equal(unlinkText(card, 'до 1 ноября'), 'Если не отвязать, 1 ноября подписка продлится на месяц — 159 ₽. После отвязки автопродление выключится, а карта исчезнет из способов оплаты. Подписка будет работать до 1 ноября.')

  assert.equal(promoBenefit({ kind: 'percent', percent_off: 10 }), '−10% на следующую оплату')
  assert.equal(promoBenefit({ kind: 'days', bonus_days: 7 }), '+7 дней к следующей оплате')
  assert.equal(promoHeadline({ kind: 'days', bonus_days: 7 }), '+7 дней')
  assert.equal(promoHeadline(null), '')
})
