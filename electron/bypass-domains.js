// Свои домены в обход VPN: проверка, лимит 50 и даты добавления.
// Чистые функции — без electron, проверяются node --test.
//
// Список доменов остаётся массивом строк в settings.bypassDomains (как раньше —
// его читают ядро и прежние версии приложения), а даты добавления лежат рядом:
// settings.bypassDomainsAddedAt = { 'example.com': 1759900000000 }. Так не нужна
// миграция формата, и откат на старую версию ничего не ломает.

const MAX_DOMAINS = 50

// «https://Sub.Example.com/path» → «sub.example.com».
function cleanDomain(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^domain:/, '')
    .replace(/^\*\./, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
}

function isValidDomain(d) {
  return d.length <= 253 && /^(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z][a-z0-9-]{1,62}$/.test(d)
}

function asList(domains) {
  return (Array.isArray(domains) ? domains : []).map(d => String(d || '')).filter(Boolean)
}

function asMeta(meta) {
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}
}

// Добавить домен. → { success, error?, domain?, domains, meta }
function addDomain(domains, meta, raw, now = Date.now()) {
  const list = asList(domains)
  const dates = { ...asMeta(meta) }
  const d = cleanDomain(raw)
  if (!d) return { success: false, error: 'Введите домен', domains: list, meta: dates }
  if (!isValidDomain(d)) return { success: false, error: 'Неверный формат домена', domains: list, meta: dates }
  if (list.includes(d)) return { success: false, error: 'Этот домен уже в списке', domains: list, meta: dates }
  if (list.length >= MAX_DOMAINS) {
    return { success: false, error: `Можно добавить до ${MAX_DOMAINS} доменов`, domains: list, meta: dates }
  }
  dates[d] = now
  return { success: true, domain: d, domains: [...list, d], meta: dates }
}

// Удалить домен (и его дату). → { domains, meta }
function removeDomain(domains, meta, domain) {
  const d = String(domain || '')
  const dates = { ...asMeta(meta) }
  delete dates[d]
  return { domains: asList(domains).filter(x => x !== d), meta: dates }
}

// Список с датами для экрана: [{ domain, addedAt }] (addedAt null — добавлен до 2.2).
function withDates(domains, meta) {
  const dates = asMeta(meta)
  return asList(domains).map(domain => {
    const t = Number(dates[domain])
    return { domain, addedAt: Number.isFinite(t) && t > 0 ? t : null }
  })
}

module.exports = { MAX_DOMAINS, cleanDomain, isValidDomain, addDomain, removeDomain, withDates }
