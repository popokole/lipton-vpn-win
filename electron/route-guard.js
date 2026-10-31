// Запасной «мост» kill switch, когда Брандмауэр Windows недоступен (служба
// mpssvc отключена — сборки Windows «без лишнего», сторонние антивирусы): netsh
// advfirewall тогда не создаёт правило, и при падении ядра трафик шёл напрямую.
//
// Вместо правила — маршруты: 0.0.0.0/1 и 128.0.0.0/1 (и ::/1, 8000::/1) в
// петлевой интерфейс. Они длиннее маршрута по умолчанию, поэтому весь трафик
// уходит «в никуда». Локальная сеть работает (у неё свои, ещё более длинные
// маршруты), а IP серверов VPN и DNS для их резолва получают /32 через настоящий
// шлюз — новое ядро может подключиться. store=active: после перезагрузки ПК
// маршрутов нет, человек не останется без сети навсегда.

const { execFile, execFileSync } = require('child_process')
const net = require('net')

const BLOCK_V4 = ['0.0.0.0/1', '128.0.0.0/1']
const BLOCK_V6 = ['::/1', '8000::/1']
// Виртуальные адаптеры (наш и чужие VPN) — их маршрут по умолчанию шлюзом не берём.
const VIRTUAL_IF_RE = /loopback|tun|tap|wintun|wireguard|wg\d|vpn|lipton|happ|tailscale|zerotier|hamachi|radmin/i

// ─── Разбор вывода netsh (заголовки локализованы — берём по колонкам) ─────────

// «netsh interface ipv4 show interfaces»: Инд  Мет  MTU  Состояние  Имя
function parseInterfaces(text) {
  const out = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+\d+\s+\S+\s+(.+?)\s*$/)
    if (m) out.push({ idx: Number(m[1]), metric: Number(m[2]), name: m[3] })
  }
  return out
}

// «netsh interface ipv4 show route»: маршруты 0.0.0.0/0 → { idx, gw, metric }.
function parseDefaultRoutes(text) {
  const out = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/\s(\d+)\s+0\.0\.0\.0\/0\s+(\d+)\s+(\d+\.\d+\.\d+\.\d+)\s*$/)
    if (m) out.push({ metric: Number(m[1]), idx: Number(m[2]), gw: m[3] })
  }
  return out
}

/**
 * Петлевой интерфейс и настоящий шлюз (маршрут по умолчанию с наименьшей
 * метрикой, не через виртуальный адаптер).
 * @returns {{ loopback: number, gateway: { idx: number, gw: string } | null }}
 */
function pickNet(ifacesText, routesText) {
  const ifaces = parseInterfaces(ifacesText)
  const byIdx = new Map(ifaces.map(i => [i.idx, i]))
  const loopback = (ifaces.find(i => /loopback/i.test(i.name)) || { idx: 1 }).idx
  const candidates = parseDefaultRoutes(routesText)
    .filter(r => r.idx !== loopback && r.gw !== '0.0.0.0')
    .filter(r => !VIRTUAL_IF_RE.test(byIdx.get(r.idx)?.name || ''))
    .map(r => ({ ...r, total: r.metric + (byIdx.get(r.idx)?.metric || 0) }))
    .sort((a, b) => a.total - b.total)
  const best = candidates[0]
  return { loopback, gateway: best ? { idx: best.idx, gw: best.gw } : null }
}

/**
 * Команды netsh для блокировки: сначала исключения (серверы VPN, DNS), потом
 * маршруты «в никуда» — чтобы в момент включения не оборвать подключение к серверу.
 * @param {string[]} allowIps
 * @param {{ loopback: number, gateway: { idx: number, gw: string } | null }} netInfo
 */
function buildPlan(allowIps, netInfo) {
  const allow = []
  if (netInfo.gateway) {
    for (const ip of new Set(allowIps || [])) {
      if (net.isIPv4(ip)) allow.push(`${ip}/32`)
    }
  }
  const add = [
    ...allow.map(p => ['interface', 'ipv4', 'add', 'route', p, `interface=${netInfo.gateway.idx}`, `nexthop=${netInfo.gateway.gw}`, 'store=active']),
    ...BLOCK_V4.map(p => ['interface', 'ipv4', 'add', 'route', p, `interface=${netInfo.loopback}`, 'store=active']),
    ...BLOCK_V6.map(p => ['interface', 'ipv6', 'add', 'route', p, `interface=${netInfo.loopback}`, 'store=active']),
  ]
  // Снимаем в обратном порядке: сначала «в никуда», потом исключения.
  const del = add.slice().reverse().map(a => a.map(x => (x === 'add' ? 'delete' : x)))
  return { add, del }
}

// Удаление маршрутов «в никуда» без знания исключений — для очистки после падения
// приложения. Оставшиеся /32 до серверов VPN безвредны и исчезнут при перезагрузке.
function blockDeleteArgs(loopback = 1) {
  return [
    ...BLOCK_V4.map(p => ['interface', 'ipv4', 'delete', 'route', p, `interface=${loopback}`, 'store=active']),
    ...BLOCK_V6.map(p => ['interface', 'ipv6', 'delete', 'route', p, `interface=${loopback}`, 'store=active']),
  ]
}

// ─── netsh ───────────────────────────────────────────────────────────────────

function run(args) {
  return new Promise(resolve => {
    execFile('netsh', args, { windowsHide: true, timeout: 10000 }, (err, stdout) => {
      resolve({ ok: !err, out: String(stdout || '') })
    })
  })
}

function runSync(args) {
  try {
    return { ok: true, out: String(execFileSync('netsh', args, { windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }) || '') }
  } catch {
    return { ok: false, out: '' }
  }
}

const SHOW_IFACES = ['interface', 'ipv4', 'show', 'interfaces']
const SHOW_ROUTES = ['interface', 'ipv4', 'show', 'route']

let netInfo = null // кэш из prepare(): при падении ядра — без лишних вызовов netsh
let added = null   // del-команды включённой блокировки
let active = false

async function detect() {
  const [i, r] = await Promise.all([run(SHOW_IFACES), run(SHOW_ROUTES)])
  netInfo = pickNet(i.out, r.out)
  return netInfo
}

function detectSync() {
  netInfo = pickNet(runSync(SHOW_IFACES).out, runSync(SHOW_ROUTES).out)
  return netInfo
}

// Маршрут «в никуда» добавлен — блокировка работает (уже существующий тоже годится).
function blockAdded(results, plan) {
  return plan.add.some((a, i) => a.includes(BLOCK_V4[0]) && results[i])
}

/** Запомнить шлюз заранее (пока ядро живо, маршруты не трогаем). */
async function prepare(allowIps = []) {
  if (active) return enable(allowIps)
  // Пока работает TUN, его маршрут по умолчанию отфильтрован по имени адаптера.
  await detect()
  return true
}

/** Включить блокировку (или обновить список серверов, если уже включена). */
async function enable(allowIps = []) {
  // Сеть могла смениться — шлюз берём заново; не нашли (нет сети) — прежний.
  const prevGateway = netInfo?.gateway || null
  const fresh = await detect()
  if (!fresh.gateway && prevGateway) netInfo = { ...fresh, gateway: prevGateway }
  const plan = buildPlan(allowIps, netInfo)
  const results = []
  for (const a of plan.add) results.push((await run(a)).ok)
  // «Объект уже существует» — не ошибка: проверяем, что маршрут «в никуда» есть.
  const ok = blockAdded(results, plan) || (await run(SHOW_ROUTES)).out.includes(BLOCK_V4[0])
  if (ok) {
    // Обновление списка при включённой блокировке: лишние исключения снимаем
    // уже после добавления новых — без окна, когда маршрутов «в никуда» нет.
    const keep = new Set(plan.del.map(a => a.join(' ')))
    for (const a of added || []) if (!keep.has(a.join(' '))) await run(a)
    added = plan.del
    active = true
  } else {
    console.error('[KillSwitch] Не удалось включить блокировку маршрутами')
  }
  return ok
}

function enableSync(allowIps = []) {
  const plan = buildPlan(allowIps, netInfo || detectSync())
  const results = plan.add.map(a => runSync(a).ok)
  const ok = blockAdded(results, plan) || runSync(SHOW_ROUTES).out.includes(BLOCK_V4[0])
  if (ok) {
    added = plan.del
    active = true
  }
  return ok
}

/** Снять блокировку. */
async function disable() {
  const cmds = added || blockDeleteArgs(netInfo?.loopback)
  for (const a of cmds) await run(a)
  added = null
  active = false
  return true
}

function disableSync() {
  for (const a of added || blockDeleteArgs(netInfo?.loopback)) runSync(a)
  added = null
  active = false
}

function isActive() { return active }

module.exports = {
  prepare, enable, enableSync, disable, disableSync, isActive,
  _internal: { parseInterfaces, parseDefaultRoutes, pickNet, buildPlan, blockDeleteArgs },
}
