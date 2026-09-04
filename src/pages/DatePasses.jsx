import { useCallback, useEffect, useRef, useState } from 'react'
import SubPageHeader from '../components/common/SubPageHeader'
import EmptyState from '../components/common/EmptyState'
import DatePassCard from '../components/dates/DatePassCard'
import Button from '../components/ui/Button'
import * as dates from '../services/dates'

/**
 * Every pass someone is carrying, newest first, with the used and expired ones
 * folded away underneath — a wallet rather than a history.
 *
 * ── Why this page watches itself ────────────────────────────────────────────
 *
 * Redeeming happens on somebody else's phone. The employee scans the code,
 * presses Confirm, and gets a full-screen green tick; the customer standing in
 * front of them gets nothing at all, because nothing pushes to this page. In a
 * queue that produces a small, avoidable moment — *did that work?* — with the
 * only evidence in the room being a stranger's word and a screen turned away.
 *
 * There is no realtime channel for passes and there shouldn't be a socket held
 * open for a card somebody glances at twice a month. So: while this page is
 * actually on screen and something on it is still live, it re-asks. Slowly, on
 * a timer, and only then — a wallet in a pocket costs nothing, and a wallet
 * that has nothing live in it has nothing to learn.
 *
 * A pass that changes from live to redeemed *while somebody is looking at it*
 * is treated differently from one that was already used the last time they
 * opened the app. The first is the counter answering them and reads as an
 * acknowledgement; the second is history. Same row, different sentence,
 * decided entirely by whether we watched it happen.
 */

/** Slow enough to be free, fast enough to still be the same moment. */
const POLL_MS = 10000

export default function DatePasses() {
  const [passes, setPasses] = useState([])
  const [past, setPast] = useState([])
  const [showPast, setShowPast] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Ids that were live when this page loaded and have since been scanned.
  // Held in state because it changes what the card says, and in a ref because
  // the poll needs to read it without being restarted by it.
  const [justRedeemed, setJustRedeemed] = useState(() => new Set())
  const wasLive = useRef(new Set())

  const sort = useCallback((rows, { watching = false } = {}) => {
    const now = Date.now()
    const live = rows.filter(
      (p) => p.status === 'issued' && new Date(p.expiresAt).getTime() > now
    )
    const liveIds = new Set(live.map((p) => p.id))

    if (watching) {
      // Anything we had as live a moment ago and now reads as redeemed was
      // scanned while this page was open. That is the only thing this page
      // can honestly claim to have witnessed.
      const fresh = rows.filter(
        (p) => p.status === 'redeemed' && wasLive.current.has(p.id) && !liveIds.has(p.id)
      )
      if (fresh.length) {
        setJustRedeemed((prev) => {
          const next = new Set(prev)
          fresh.forEach((p) => next.add(p.id))
          return next
        })
      }
    }

    wasLive.current = liveIds
    setPasses(live)
    setPast(rows.filter((p) => !liveIds.has(p.id)))
    // A pass that has just been used moves into the folded-away section, and
    // silently filing away the thing somebody is watching is worse than not
    // updating at all. Open it for them.
    return { live, rows }
  }, [])

  useEffect(() => {
    let alive = true
    dates
      .myPasses({ includeUsed: true })
      .then((rows) => alive && sort(rows))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [sort])

  // ── the watch ─────────────────────────────────────────────────────────
  //
  // Three conditions, all of them about not doing this when it would be
  // pointless: the page has to be visible, there has to be something live to
  // watch, and the first load has to have finished. `visibilitychange` covers
  // the ordinary phone case — the screen goes off in a pocket and the timer
  // stops with it, then a glance at the wallet asks immediately rather than
  // waiting out the rest of an interval.
  useEffect(() => {
    if (loading || passes.length === 0) return undefined

    let alive = true
    let timer

    const ask = async () => {
      if (!alive || document.visibilityState !== 'visible') return
      try {
        const rows = await dates.myPasses({ includeUsed: true })
        if (alive) sort(rows, { watching: true })
      } catch {
        /* a wallet that couldn't refresh still shows what it has */
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') ask()
    }

    timer = setInterval(ask, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loading, passes.length, sort])

  // Once something has been redeemed under their nose, the used section is
  // where it went — so it opens itself rather than hiding the answer behind a
  // link the reader has no reason to suspect.
  useEffect(() => {
    if (justRedeemed.size) setShowPast(true)
  }, [justRedeemed])

  return (
    <>
      <SubPageHeader
        title="Date Passes"
        subtitle="Perks you’ve unlocked. Show the code when you get there."
        backTo="/app/profile"
      />

      {error && (
        <p className="mb-5 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-12 text-center text-[14px] text-mist">Loading…</p>
      ) : !passes.length && !past.length ? (
        <EmptyState
          art="coffee"
          title="No passes yet."
          body="When you pick somewhere with a Looseleaf perk, the pass lands here."
          action={
            <Button to="/app/campus/spots" variant="coral" size="md">
              Find somewhere to go
            </Button>
          }
        />
      ) : (
        <>
          <ul className="space-y-5">
            {passes.map((p) => (
              <li key={p.id}>
                <DatePassCard pass={p} />
              </li>
            ))}
          </ul>

          {!passes.length && !justRedeemed.size && (
            <p className="rounded-card border border-rule bg-cream/50 px-5 py-8 text-center text-[14px] leading-relaxed text-graphite">
              Nothing live right now.
            </p>
          )}

          {past.length > 0 && (
            <section className="mt-8">
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                className="focus-ring text-[13.5px] font-medium text-graphite underline underline-offset-4 hover:text-navy"
              >
                {showPast ? 'Hide' : `Used and expired (${past.length})`}
              </button>

              {showPast && (
                <ul className="mt-4 space-y-4">
                  {past.map((p) => (
                    <li key={p.id}>
                      <DatePassCard pass={p} compact justRedeemed={justRedeemed.has(p.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <p className="mt-8 px-1 text-[12.5px] leading-relaxed text-mist">
        Scanning a pass tells the business that a valid Looseleaf date is there. It doesn’t tell
        them your name, who you’re with, or anything about your profile.
      </p>
    </>
  )
}
