// «Мост» kill switch для TUN: правило Брандмауэра Windows, которое на время,
// пока ядра нет (перезапуск после падения, смена настроек, исчерпаны попытки при
// включённом Kill Switch), запрещает исходящий трафик на всё, кроме IP серверов
// VPN, DNS для резолва сервера, loopback и локальной сети.
//
// Пока sing-box жив, утечки закрывает его strict_route (динамический WFP-сеанс,
// снимается вместе с процессом) — поэтому правило включено только в окне без
// ядра и выключается сразу после готовности нового процесса. Само правило
// (выключенное) существует всё время, пока VPN в TUN включён: при падении ядра
// его остаётся включить одной синхронной командой.

const { execFile, execFileSync } = require('child_process')

const RULE_NAME = 'LiptonVPN Kill Switch'

// ─── Арифметика диапазонов ───────────────────────────────────────────────────

function ipv4ToNum(ip) {
  const p = String(ip).split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error(`Некорректный IPv4: ${ip}`)
  return BigInt(((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3])
}

function numToIpv4(n) {
  const v = Number(n)
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.')
}

function ipv6ToNum(ip) {
  let s = String(ip).toLowerCase()
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const n = Number(ipv4ToNum(v4[1]))
    s = s.slice(0, -v4[1].length) + ((n >>> 16) & 0xffff).toString(16) + ':' + (n & 0xffff).toString(16)
  }
  const [head, tail] = s.includes('::') ? s.split('::') : [s, null]
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = tail === null ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t]
  if (groups.length !== 8) throw new Error(`Некорректный IPv6: ${ip}`)
  return groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g || '0', 16)), 0n)
}

function numToIpv6(n) {
  const g = []
  for (let i = 7; i >= 0; i--) g.push(((n >> BigInt(i * 16)) & 0xffffn).toString(16))
  return g.join(':')
}

function cidrRange(cidr, v6) {
  const [ip, bitsStr] = cidr.split('/')
  const total = v6 ? 128n : 32n
  const bits = BigInt(bitsStr === undefined ? total : Number(bitsStr))
  const start = v6 ? ipv6ToNum(ip) : ipv4ToNum(ip)
  const size = 1n << (total - bits)
  const base = (start / size) * size
  return [base, base + size - 1n]
}

// Дополнение множества разрешённых диапазонов до всего адресного пространства.
function complement(ranges, v6) {
  const max = v6 ? (1n << 128n) - 1n : (1n << 32n) - 1n
  const sorted = ranges.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const out = []
  let cur = 0n
  for (const [s, e] of sorted) {
    if (s > cur) out.push([cur, s - 1n])
    if (e + 1n > cur) cur = e + 1n
  }
  if (cur <= max) out.push([cur, max])
  return out
}

const ALLOWED_V4 = [
  '127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16',
  '169.254.0.0/16', '224.0.0.0/4', '255.255.255.255/32',
]
const ALLOWED_V6 = ['::1/128', 'fe80::/10', 'fc00::/7', 'ff00::/8']

/**
 * Список адресов для блокирующего правила (remoteip у netsh).
 * @param {string[]} allowIps IP серверов VPN и DNS для их резолва
 */
function buildBlockList(allowIps = []) {
  const v4 = ALLOWED_V4.map(c => cidrRange(c, false))
  const v6 = ALLOWED_V6.map(c => cidrRange(c, true))
  for (const ip of allowIps) {
    if (!ip) continue
    try {
      if (ip.includes(':')) v6.push(cidrRange(ip.includes('/') ? ip : `${ip}/128`, true))
      else v4.push(cidrRange(ip.includes('/') ? ip : `${ip}/32`, false))
    } catch { /* не IP — пропускаем */ }
  }
  const fmt4 = ([s, e]) => (s === e ? numToIpv4(s) : `${numToIpv4(s)}-${numToIpv4(e)}`)
  const fmt6 = ([s, e]) => (s === e ? numToIpv6(s) : `${numToIpv6(s)}-${numToIpv6(e)}`)
  return [...complement(v4, false).map(fmt4), ...complement(v6, true).map(fmt6)]
}

// ─── netsh ───────────────────────────────────────────────────────────────────
//
// Правило создаётся заранее (выключенным) при подключении в TUN и живёт, пока
// VPN включён: при падении ядра его остаётся только включить одной командой
// netsh («set rule … enable=yes»), без delete/add. Все асинхронные операции идут
// через одну очередь, чтобы delete и add из разных вызовов не перемешивались.

function run(args) {
  return new Promise(resolve => {
    execFile('netsh', args, { windowsHide: true, timeout: 10000 }, (err, stdout) => {
      resolve({ ok: !err, out: String(stdout || ''), err })
    })
  })
}

function runSync(args) {
  try {
    execFileSync('netsh', args, { windowsHide: true, stdio: 'ignore', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

const RULE = `name=${RULE_NAME}`

let active = false   // правило включено (трафик мимо VPN блокируется)
let exists = false   // правило создано этим процессом
let listKey = ''     // remoteip, с которым создано правило

let queue = Promise.resolve()
function enqueue(fn) {
  const p = queue.then(fn, fn)
  queue = p.catch(() => {})
  return p
}

function addArgs(remote, enabled) {
  return ['advfirewall', 'firewall', 'add', 'rule', RULE, 'dir=out', 'action=block',
    `enable=${enabled ? 'yes' : 'no'}`, 'profile=any', `remoteip=${remote}`]
}

// Привести правило к нужному состоянию: создать, обновить список адресов и/или
// включить/выключить. Возвращает true при успехе.
async function apply(allowIps, enabled) {
  const remote = buildBlockList(allowIps).join(',')
  if (exists) {
    const args = ['advfirewall', 'firewall', 'set', 'rule', RULE, 'new', `enable=${enabled ? 'yes' : 'no'}`]
    if (remote !== listKey) args.push(`remoteip=${remote}`)
    const r = await run(args)
    if (r.ok) { listKey = remote; return true }
    exists = false // правило удалили снаружи — создаём заново
  }
  await run(['advfirewall', 'firewall', 'delete', 'rule', RULE])
  const r = await run(addArgs(remote, enabled))
  exists = r.ok
  listKey = r.ok ? remote : ''
  if (!r.ok) console.error('[KillSwitch] Не удалось создать правило брандмауэра:', r.err?.message || r.out)
  return r.ok
}

/** Создать правило заранее, выключенным (или обновить список, не меняя состояние). */
function prepare(allowIps = []) {
  return enqueue(async () => apply(allowIps, active))
}

/** Включить блокировку трафика мимо VPN. */
function enable(allowIps = []) {
  return enqueue(async () => {
    const ok = await apply(allowIps, true)
    if (ok && !active) console.log(`[KillSwitch] Блокировка трафика мимо VPN включена (разрешено: ${allowIps.join(', ') || '—'})`)
    active = ok || active
    return ok
  })
}

/** Выключить блокировку, оставив правило (ядро снова защищает трафик). */
function disable() {
  return enqueue(async () => {
    if (!exists) { active = false; return true }
    if (!active) return true // правило уже выключено (создано через prepare)
    const r =await run(['advfirewall', 'firewall', 'set', 'rule', RULE, 'new', 'enable=no'])
    if (!r.ok) {
      await run(['advfirewall', 'firewall', 'delete', 'rule', RULE])
      exists = false
      listKey = ''
    }
    if (active) console.log('[KillSwitch] Блокировка трафика снята')
    active = false
    return true
  })
}

/** Удалить правило совсем (VPN выключен). */
function remove() {
  return enqueue(async () => {
    const r = await run(['advfirewall', 'firewall', 'delete', 'rule', RULE])
    if (active) console.log('[KillSwitch] Блокировка трафика снята')
    else if (r.ok && exists) console.log('[KillSwitch] Правило брандмауэра удалено')
    active = false
    exists = false
    listKey = ''
    return true
  })
}

// Синхронно, одной командой — первым делом при падении ядра в TUN, пока
// strict_route и маршруты Wintun уже исчезли, а новое ядро ещё не поднято.
function enableSync(allowIps = []) {
  let ok = exists && runSync(['advfirewall', 'firewall', 'set', 'rule', RULE, 'new', 'enable=yes'])
  if (!ok) {
    const remote = buildBlockList(allowIps).join(',')
    runSync(['advfirewall', 'firewall', 'delete', 'rule', RULE])
    ok = runSync(addArgs(remote, true))
    exists = ok
    listKey = ok ? remote : ''
  }
  if (ok) {
    active = true
    console.log('[KillSwitch] Ядро упало — трафик мимо VPN заблокирован')
  } else {
    console.error('[KillSwitch] Не удалось включить блокировку при падении ядра')
  }
  return ok
}

// Синхронно — для аварийного выхода процесса и очистки при старте: удаляет правило.
function disableSync() {
  runSync(['advfirewall', 'firewall', 'delete', 'rule', RULE])
  active = false
  exists = false
  listKey = ''
}

function isActive() { return active }

module.exports = {
  prepare, enable, disable, remove, enableSync, disableSync, isActive, buildBlockList, RULE_NAME,
  _internal: { ipv4ToNum, ipv6ToNum, numToIpv6, cidrRange, complement },
}
