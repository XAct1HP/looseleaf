import { useCallback, useEffect, useState } from 'react'
import BackstageHeader from './BackstageHeader'
import StatTile from '../../components/backstage/StatTile'
import Button from '../../components/ui/Button'
import { Chip } from '../../components/ui/Chip'
import { IconPin, IconLink } from '../../components/ui/Icons'
import { money } from '../../lib/partnerPlans'
import * as partners from '../../services/partners'

/**
 * ── Partner oversight ───────────────────────────────────────────────────────
 *
 * Every business that goes in front of students is approved by a person here
 * first. `partner_is_live()` requires both an approval and a live subscription,
 * so nothing on this page is cosmetic — declining an application actually keeps
 * it off the Date Spots page.
 *
 * Note what staff can see and what they can't. Staff read partner records,
 * offers, subscription status and revenue, because running the place requires
 * it. They do not get a view of who redeemed what — that would be a route into
 * dating data through the back door, and there isn't one.
 */

const TABS = [
  { id: 'pending', label: 'Waiting' },
  { id: 'active', label: 'Live' },
  { id: 'draft', label: 'Drafts' },
  { id: 'all', label: 'Everything' },
]

export default function Partners() {
  const [tab, setTab] = useState('pending')
  const [rows, setRows] = useState([])
  const [revenue, setRevenue] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, rev] = await Promise.all([
        partners.staffQueue(tab),
        partners.staffRevenue().catch(() => null),
      ])
      setRows(list)
      setRevenue(rev)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  async function decide(partner, status) {
    const note =
      status === 'rejected'
        ? window.prompt('What should they fix? This is shown to them verbatim.')
        : null
    if (status === 'rejected' && note === null) return

    setBusy(partner.id)
    try {
      await partners.staffSetStatus(partner.id, status, note)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (!partners.partnersEnabled) {
    return (
      <>
        <BackstageHeader title="Partners" subtitle="Local businesses on Loose Leaf." />
        <p className="rounded-card border border-rule bg-cream/60 px-5 py-8 text-center text-[14px] leading-relaxed text-graphite">
          The partner platform only runs against a configured Looseleaf. On the demo campus there
          are no real businesses to approve.
        </p>
      </>
    )
  }

  return (
    <>
      <BackstageHeader
        title="Partners"
        subtitle="Every business is read by a person before students see it."
      />

      {error && (
        <p className="mb-6 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">
          {error}
        </p>
      )}

      {revenue && (
        <div className="mb-7 grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Monthly recurring"
            value={money(revenue.mrr_cents)}
            hint="From live subscriptions only"
          />
          <StatTile
            label="Live partners"
            value={revenue.partners_by_status?.active ?? 0}
            hint="Approved and paying"
          />
          <StatTile
            label="Verified dates this month"
            value={revenue.verified_dates_this_month ?? 0}
            hint="Across every partner"
          />
        </div>
      )}

      <nav className="hide-scrollbar mb-5 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`press focus-ring shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
              tab === t.id
                ? 'border-navy bg-navy text-paper'
                : 'border-rule bg-white text-graphite hover:border-navy/25'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <p className="py-10 text-center text-[14px] text-mist">Loading…</p>
      ) : !rows.length ? (
        <p className="rounded-card border border-rule bg-cream/50 px-5 py-10 text-center text-[14px] text-graphite">
          {tab === 'pending' ? 'Nothing waiting on you.' : 'Nothing here.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => (
            <li key={p.id} className="rounded-card border border-rule bg-white px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <p className="font-display text-[19px] font-semibold leading-tight text-navy">
                      {p.name}
                    </p>
                    <Chip tone={statusTone(p.status)} className="!px-2.5 !py-1 !text-[11.5px] capitalize">
                      {p.status}
                    </Chip>
                    {p.sub_status && (
                      <Chip
                        tone={['active', 'trialing'].includes(p.sub_status) ? 'moss' : 'cream'}
                        className="!px-2.5 !py-1 !text-[11.5px]"
                      >
                        {p.plan_id ?? 'no plan'} · {p.sub_status}
                      </Chip>
                    )}
                  </div>

                  <p className="mt-1.5 text-[13px] text-mist">
                    {p.category} · {p.locations} location{p.locations === 1 ? '' : 's'} ·{' '}
                    {p.active_offers} active offer{p.active_offers === 1 ? '' : 's'}
                  </p>

                  {p.description && (
                    <p className="mt-2.5 max-w-[62ch] text-[14px] leading-relaxed text-graphite">
                      {p.description}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-mist">
                    {p.owner_email && <span>{p.owner_email}</span>}
                    {p.phone && <span>{p.phone}</span>}
                    {p.website && (
                      <a
                        href={p.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-graphite"
                      >
                        <IconLink size={13} />
                        {p.website.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                    <span>applied {new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {p.status === 'pending' && (
                    <>
                      <Button size="sm" variant="primary" onClick={() => decide(p, 'active')} disabled={busy === p.id}>
                        Approve
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => decide(p, 'rejected')} disabled={busy === p.id}>
                        Decline
                      </Button>
                    </>
                  )}
                  {p.status === 'active' && (
                    <Button size="sm" variant="danger" onClick={() => decide(p, 'suspended')} disabled={busy === p.id}>
                      Suspend
                    </Button>
                  )}
                  {['suspended', 'rejected'].includes(p.status) && (
                    <Button size="sm" variant="outline" onClick={() => decide(p, 'active')} disabled={busy === p.id}>
                      Reinstate
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8 rounded-card border border-rule bg-cream/60 px-6 py-6">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-graphite">
            <IconPin size={19} />
          </span>
          <div>
            <h2 className="font-display text-[18px] font-semibold leading-tight">
              The one place money is allowed to touch.
            </h2>
            <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-graphite">
              Partner spend affects Date Spots and date suggestions, always labelled, and never who
              appears in Discover, whose likes you see, or the order of anything involving a person.
              The recommendation query gives a matching date type 34 points and gives everything a
              partner can buy at most 10 — and it filters on the date type before it scores
              anything, so an irrelevant business cannot appear at all.
            </p>
            <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-mist">
              What you can’t see from here, on purpose: who redeemed a pass, which conversation a
              recommendation landed in, or anything about the people on either end of a date.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}

function statusTone(status) {
  switch (status) {
    case 'active':
      return 'moss'
    case 'pending':
      return 'blue'
    case 'rejected':
    case 'suspended':
      return 'coral'
    default:
      return 'cream'
  }
}
