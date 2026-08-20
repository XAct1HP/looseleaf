import { useEffect, useState } from 'react'
import SubPageHeader from '../components/common/SubPageHeader'
import EmptyState from '../components/common/EmptyState'
import DatePassCard from '../components/dates/DatePassCard'
import Button from '../components/ui/Button'
import * as dates from '../services/dates'

/**
 * Every pass someone is carrying, newest first, with the used and expired ones
 * folded away underneath — a wallet rather than a history.
 */
export default function DatePasses() {
  const [passes, setPasses] = useState([])
  const [past, setPast] = useState([])
  const [showPast, setShowPast] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    dates
      .myPasses({ includeUsed: true })
      .then((rows) => {
        if (!live) return
        const now = Date.now()
        const live_ = rows.filter(
          (p) => p.status === 'issued' && new Date(p.expiresAt).getTime() > now
        )
        setPasses(live_)
        setPast(rows.filter((p) => !live_.includes(p)))
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

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

          {!passes.length && (
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
                      <DatePassCard pass={p} compact />
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
