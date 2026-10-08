import { useEffect, useRef, useState } from 'react'

// Данные для плиток из main-процесса.

const hidden = () =>
  document.visibilityState === 'hidden' || document.documentElement.hasAttribute('data-paused')

// Статистика сессии (скорость, байты, пинг, итоги дня и недели): опрос раз в
// intervalMs, пока enabled и окно видно. Итоги дня считает main и без окна.
export function useVpnStats(enabled = true, intervalMs = 1000) {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    if (!enabled || !window.api?.vpnStats) return undefined
    let alive = true
    const tick = () => {
      if (hidden()) return
      window.api.vpnStats().then(s => { if (alive && s) setStats(s) }).catch(() => {})
    }
    tick()
    const id = setInterval(tick, intervalMs)
    return () => { alive = false; clearInterval(id) }
  }, [enabled, intervalMs])
  return stats
}

// «Что видят сайты»: последний результат проверки для текущего состояния VPN
// (через VPN — после подключения, без VPN — настоящий IP). Пока проверка идёт — null.
export function useExposure(vpnStatus) {
  const [check, setCheck] = useState(null)
  const statusRef = useRef(vpnStatus)
  statusRef.current = vpnStatus

  // Подписка на свежие результаты
  useEffect(() => {
    const off = window.api?.onCheckResult?.(r => {
      if (!r) return
      const st = statusRef.current
      const settled = st === 'connected' || st === 'reconnecting' ? 'connected' : 'disconnected'
      if (r.status === settled) setCheck(r)
    })
    return () => off?.()
  }, [])

  // Смена состояния: старый результат больше не про текущее — спрашиваем кэш main
  const settled = vpnStatus === 'connected' || vpnStatus === 'reconnecting' ? 'connected'
    : vpnStatus === 'disconnected' ? 'disconnected' : null
  useEffect(() => {
    if (!settled) return undefined
    let alive = true
    setCheck(prev => (prev && prev.status === settled ? prev : null))
    window.api?.vpnLastCheck?.()
      .then(r => { if (alive && r && r.status === settled) setCheck(r) })
      .catch(() => {})
    return () => { alive = false }
  }, [settled])

  return settled ? check : null
}
