import { useEffect, useState } from 'react'

// Текущее время, обновляется раз в intervalMs (таймер сессии, обратный отсчёт).
// enabled=false — не тикает (например, когда VPN выключен).
export function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return undefined
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, enabled])
  return now
}
