import { useEffect, useState } from 'react'
import { PageHead } from '../DashboardLayout'
import StatTile from '../../../components/backstage/StatTile'
import Button from '../../../components/ui/Button'
import { IconLock } from '../../../components/ui/Icons'
import { usePartnerAccount } from '../../../state/partnerAccount'
import * as partners from '../../../services/partners'

const PAGE = 50

/**
 * The ledger. Every row is a date that happened.
 *
 * Look at what a row contains: a time, an offer, four characters of a code,
 * and optionally what they spent. That is the whole shape of it, decided by
 * `partner_redemptions` in the database — there is no column here that could
 * be widened into a person, which is why the note at the bottom of this page
 * can be stated as fact rather than as a promise.
 */
export default function Redemptions() {
  const { partner } = usePartnerAccount()
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState(null)
  const [offset, setOffset] = useState(0)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!partner) return
    let live = true
    setLoading(true)
    Promise.all([
      partners.redemptions(partner.id, { limit: PAGE, offset: 0 }),
      partners.overview(partner.id),
    ])
      .then(([r, o]) => {
        if (!live) return
        setRows(r)
        setMore(r.length === PAGE)
        setOffset(r.length)
        setCounts(o)
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [partner])

  async function loadMore() {
    const next = await partners.redemptions(partner.id, { limit: PAGE, offset })
    setRows((r) => [...r, ...next])
    setOffset((o) => o + next.length)
    setMore(next.length === PAGE)
  }

  return (
    <>
      <PageHead
        title="Redemptions"
        subtitle="Passes your staff actually scanned. Nothing here is modelled or estimated."
      />

      {error && (
        <p className="mb-6 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Today" value={counts?.today} hint="Since midnight" />
        <StatTile label="This week" value={counts?.this_week} hint="Since Monday" />
        <StatTile label="This month" value={counts?.dates_this_month} hint="Since the 1st" />
      </div>

      <section className="mt-9">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">History</h2>

        {loading ? (
          <p className="py-10 text-center text-[14px] text-mist">Loading…</p>
        ) : !rows.length ? (
          <p className="rounded-card border border-rule bg-cream/50 px-5 py-10 text-center text-[14px] text-graphite">
            No passes scanned yet.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-rule overflow-hidden rounded-card border border-rule bg-white">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
                  <span className="w-[150px] shrink-0 text-[13.5px] tabular-nums text-graphite">
                    {when(r.at)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] text-navy">
                    {r.offerTitle}
                  </span>
                  {r.location && (
                    <span className="hidden text-[12.5px] text-mist sm:block">{r.location}</span>
                  )}
                  <span className="shrink-0 font-sans text-[12.5px] tracking-[0.1em] text-mist">
                    ····{r.passRef}
                  </span>
                  <span className="w-[70px] shrink-0 text-right text-[13.5px] tabular-nums text-graphite">
                    {r.amountCents != null ? `$${(r.amountCents / 100).toFixed(2)}` : '—'}
                  </span>
                </li>
              ))}
            </ul>

            {more && (
              <Button variant="outline" size="md" className="mt-4" onClick={loadMore}>
                Load more
              </Button>
            )}
          </>
        )}
      </section>

      <section className="mt-9 rounded-card border border-rule bg-cream/60 px-5 py-5">
        <div className="flex items-start gap-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-graphite">
            <IconLock size={17} />
          </span>
          <div>
            <p className="text-[14.5px] font-medium text-navy">
              Why there are no names here.
            </p>
            <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-graphite">
              You need to know a valid Loose Leaf date happened at your place. You do not need to
              know who was on it, what they talked about, or why we thought you’d be a good fit —
              and the database will not give you those things even if a future page asks. The last
              four characters of the code are here so you can match a redemption to a receipt.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}

function when(iso) {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `Today, ${time}`
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
}
