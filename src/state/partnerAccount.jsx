import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as partners from '../services/partners'

/**
 * ── Which business am I acting for? ─────────────────────────────────────────
 *
 * Deliberately separate from `state/store.jsx`. That store is a *student's*
 * session — deck, likes, matches, campus — and a business has none of those.
 * Keeping them apart means a partner page cannot accidentally reach a member
 * selector, and the member store never grows a branch for businesses.
 *
 * Everything here comes from `my_partners()`, which returns one row per
 * business this person can act for, with the plan's entitlements already
 * resolved. Components ask `can(entitlements, 'date_passes')` rather than
 * comparing plan ids.
 */

const PartnerContext = createContext(null)

const SELECTED_KEY = 'looseleaf.partner.selected'

export function PartnerAccountProvider({ children }) {
  const [list, setList] = useState([])
  const [selectedId, setSelectedId] = useState(() => {
    try {
      return localStorage.getItem(SELECTED_KEY)
    } catch {
      return null
    }
  })
  const [status, setStatus] = useState('loading') // loading | ready | error | offline
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!partners.partnersEnabled) {
      setStatus('offline')
      return []
    }
    try {
      const rows = await partners.mine()
      setList(rows)
      setStatus('ready')
      setError(null)
      return rows
    } catch (e) {
      setError(e.message)
      setStatus('error')
      return []
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const select = useCallback((id) => {
    setSelectedId(id)
    try {
      if (id) localStorage.setItem(SELECTED_KEY, id)
      else localStorage.removeItem(SELECTED_KEY)
    } catch {
      /* private browsing; the fallback below still picks the first business */
    }
  }, [])

  const partner = useMemo(
    () => list.find((p) => p.id === selectedId) ?? list[0] ?? null,
    [list, selectedId]
  )

  const value = useMemo(
    () => ({
      status,
      error,
      partners: list,
      partner,
      entitlements: partner?.entitlements ?? {},
      refresh,
      select,
    }),
    [status, error, list, partner, refresh, select]
  )

  return <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>
}

export function usePartnerAccount() {
  const ctx = useContext(PartnerContext)
  if (!ctx) throw new Error('usePartnerAccount must be used inside PartnerAccountProvider')
  return ctx
}
