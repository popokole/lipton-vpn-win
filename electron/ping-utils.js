// Замер пинга серверов без случайного разброса.
//
// Раньше каждый сервер мерился одним запросом, и все сразу: первые запросы
// тратили время на рукопожатие, параллельные мешали друг другу, и один и тот же
// сервер под разными названиями показывал то 124, то 438 мс. Теперь:
//   - серверы с одинаковым адресом, портом и маскировкой меряются один раз;
//   - на адрес несколько замеров подряд, берётся лучший;
//   - одновременно проверяется не больше нескольких адресов.

const SAMPLES = 3
const CONCURRENCY = 3

// Один «адрес» для замера: сервер, порт и SNI (разные SNI — разные инбаунды).
function endpointKey(server) {
  return `${server.address}:${server.port}:${server.sni || ''}`
}

/**
 * @param {object[]} servers серверы подписки
 * @param {(server: object) => Promise<number|null>} measureOnce один замер, мс или null
 * @returns {Promise<Object<string, number|null>>} id сервера → мс | null
 */
async function measureServers(servers, measureOnce, { samples = SAMPLES, concurrency = CONCURRENCY } = {}) {
  const groups = new Map()
  for (const s of servers || []) {
    const key = endpointKey(s)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(s)
  }

  const results = new Map()
  const queue = [...groups.entries()]
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [key, list] = item
      let best = null
      for (let i = 0; i < samples; i++) {
        let ms = null
        try { ms = await measureOnce(list[0]) } catch { ms = null }
        if (typeof ms === 'number' && (best === null || ms < best)) best = ms
      }
      results.set(key, best)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))

  const out = {}
  for (const [key, list] of groups) for (const s of list) out[s.id] = results.get(key) ?? null
  return out
}

module.exports = { measureServers, endpointKey }
