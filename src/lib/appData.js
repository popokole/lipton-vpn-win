import { useCallback, useEffect, useMemo, useState } from 'react'
import { activeBanners, layoutBanners } from './banners.mjs'

// Данные окна из main: состояние гостя и баннеры из админки.

// settings.guest (пробный доступ без аккаунта) + обновления из main.
export function useGuestState() {
  const [guest, setGuest] = useState(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    const api = window.api
    if (!api?.guestState) { setReady(true); return undefined }
    api.guestState().then(g => { if (alive) { setGuest(g || null); setReady(true) } }).catch(() => alive && setReady(true))
    const off = api.onGuestUpdate?.(g => setGuest(g || null))
    return () => { alive = false; off?.() }
  }, [])
  const refresh = useCallback(() => window.api?.guestState?.().then(g => setGuest(g || null)).catch(() => {}), [])
  return { guest, ready, refresh, setGuest }
}

const BANNERS_REFRESH_MS = 30 * 60 * 1000

// Баннеры и экраны из админки: GET /app/banners (с таргетингом по аудитории,
// если вошли). Нет ручки или сети — пустой список, блок не показывается.
export function useBanners({ authed, enabled = true, now }) {
  const [raw, setRaw] = useState([])
  const [dismissed, setDismissed] = useState([])
  const [session, setSession] = useState([]) // «Позже» у необязательных экранов — до перезапуска

  useEffect(() => {
    if (!enabled || !window.api?.getBanners) return undefined
    let alive = true
    const load = () => window.api.getBanners().then(r => {
      if (!alive) return
      setRaw(Array.isArray(r?.banners) ? r.banners : [])
      setDismissed(Array.isArray(r?.dismissed) ? r.dismissed : [])
    }).catch(() => {})
    load()
    const id = setInterval(load, BANNERS_REFRESH_MS)
    return () => { alive = false; clearInterval(id) }
  }, [authed, enabled])

  const items = useMemo(
    () => activeBanners(raw, { now: now || Date.now(), dismissed: [...dismissed, ...session] }),
    [raw, dismissed, session, now],
  )
  const layout = useMemo(() => layoutBanners(items), [items])

  const dismiss = useCallback((b) => {
    if (!b) return
    if (b.dismissible) {
      setDismissed(d => [...d, b.id])
      window.api?.dismissBanner?.(b.id)
    } else {
      setSession(s => [...s, b.id])
    }
  }, [])

  return { ...layout, dismiss }
}
