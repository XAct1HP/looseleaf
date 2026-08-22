import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as partners from '../services/partners'
import * as auth from '../services/live/auth'

/**
 * ── Which business am I acting for? ─────────────────────────────────────────
 *
 * Deliberately separate from `state/store.jsx`. That store is a *student's*
 * session — deck, likes, matches, campus — and a business has none of those.
 * Keeping them apart means a partner page cannot accidentally reach a member
 * selector, and the member store never grows a branch for businesses.
 *
 * Everything here comes from `my_partners()`, which returns one row per
 * business this person can act for, with the plan's entitlements and the pages
 * their role reaches already resolved.
 *
 * ── Why this listens to the session ──────────────────────────────────────────
 *
 * The provider wraps the *whole* `/partners` subtree, log-in page included, so
 * it mounts while nobody is signed in and asks a question — "which businesses
 * are mine?" — whose only possible answer is "none". Signing in happens inside
 * that same subtree, so React never remounts it, and the answer stayed "none"
 * for the rest of the session.
 *
 * That is what sent a restaurant owner who already had a business to "describe
 * your restaurant". So the emptiness has to be *told apart*: `anon` means
 * nobody asked, `ready` means somebody asked and genuinely has none. Only the
 * second one is an invitation to onboard, and the answer is re-fetched the
 * moment the session changes rather than once at mount.
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
  // loading · anon · ready · error · offline
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  // Auth events can arrive out of order (a token refresh landing after a sign
  // out, say). Only the newest answer is allowed to write.
  const runId = useRef(0)

  const refresh = useCallback(async () => {
    if (!partners.partnersEnabled) {
      setStatus('offline')
      return []
    }
    const mine = (runId.current += 1)
    const write = (fn) => {
      if (runId.current === mine) fn()
    }

    const session = await auth.getSession()
    if (!session) {
      write(() => {
        setList([])
        setError(null)
        setStatus('anon')
      })
      return []
    }

    try {
      const rows = await partners.mine()
      write(() => {
        setList(rows)
        setError(null)
        setStatus('ready')
      })
      return rows
    } catch (e) {
      write(() => {
        setError(e.message)
        setStatus('error')
      })
      return []
    }
  }, [])

  useEffect(() => {
    if (!partners.partnersEnabled) {
      setStatus('offline')
      return undefined
    }
    refresh()
    // Signing in, signing out, and a token refresh all change the answer.
    return auth.onAuthChange(() => {
      refresh()
    })
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
