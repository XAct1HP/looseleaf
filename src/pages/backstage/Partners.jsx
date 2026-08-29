import { useCallback, useEffect, useState } from 'react'
import BackstageHeader from './BackstageHeader'
import StatTile from '../../components/backstage/StatTile'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import { Chip } from '../../components/ui/Chip'
import { IconPin, IconLink, IconSpark, IconTrash } from '../../components/ui/Icons'
import { daysText } from '../../data/partnerCatalog'
import { money } from '../../lib/partnerBilling'
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
  const [openOffers, setOpenOffers] = useState(null)
  const [removing, setRemoving] = useState(null)

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

  /**
   * Gone, not suspended. Everything under the business goes with it — team,
   * Date Spot, offers, passes, credit row — which is what makes it the right
   * tool for a test account and the wrong one for a business that has traded.
   * The database refuses the second case rather than trusting this button:
   * once a redemption has been invoiced, the ledger is the evidence for that
   * invoice and `staff_remove_partner()` says so.
   */
  async function remove() {
    setBusy(removing.id)
    try {
      await partners.staffRemovePartner(removing.id)
      setRemoving(null)
      setError(null)
      await load()
    } catch (e) {
      setError(e.message)
      setRemoving(null)
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
            label="Earned this month"
            value={money(revenue.this_month?.cents ?? 0)}
            hint={`${revenue.this_month?.redemptions ?? 0} redemptions at ${money(
              revenue.fee_cents ?? 150
            )}`}
          />
          <StatTile
            label="Outstanding"
            value={money(revenue.outstanding_cents ?? 0)}
            hint="Redeemed, not yet collected"
          />
          <StatTile
            label="At risk"
            value={money(revenue.at_risk_cents ?? 0)}
            hint={`${revenue.suspended ?? 0} suspended · ${revenue.without_card ?? 0} with no card`}
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
                        {p.sub_status === 'active' ? 'card on file' : p.sub_status}
                      </Chip>
                    )}
                  </div>

                  <p className="mt-1.5 text-[13px] text-mist">
                    {p.category} · {p.locations} location{p.locations === 1 ? '' : 's'} ·{' '}
                    <button
                      type="button"
                      onClick={() => setOpenOffers(openOffers === p.id ? null : p.id)}
                      className="focus-ring rounded underline underline-offset-2 hover:text-graphite"
                    >
                      {p.active_offers} active offer{p.active_offers === 1 ? '' : 's'}
                    </button>
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
                  <button
                    type="button"
                    onClick={() => setRemoving(p)}
                    disabled={busy === p.id}
                    aria-label={`Remove ${p.name}`}
                    className="press focus-ring flex h-9 w-9 items-center justify-center rounded-full text-mist transition hover:bg-coral-wash hover:text-coral-deep disabled:opacity-40"
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>

              {openOffers === p.id && <OfferModeration partnerId={p.id} onChange={load} />}
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? 'this business'}?`}
        subtitle="Their team, Date Spot, offers and any passes people are holding all go with them. There is no undo, and it is not the same as suspending — a suspended business keeps everything and simply stops being shown."
      >
        <div className="flex gap-3">
          <Button variant="ghost" size="lg" full onClick={() => setRemoving(null)}>
            Keep it
          </Button>
          <Button variant="danger" size="lg" full onClick={remove} disabled={busy === removing?.id}>
            Remove for good
          </Button>
        </div>
        <p className="mt-4 text-center text-[12.5px] leading-relaxed text-mist">
          A business whose redemptions have been invoiced can't be removed — those rows are what
          the invoice was built from. Suspend that one instead.
        </p>
      </Sheet>

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

/**
 * A partner's offers, and the one button staff need: stop this one.
 *
 * Pausing rather than deleting, deliberately — an offer taken down for review
 * is a conversation with a business, and deleting their work mid-conversation
 * makes that conversation much worse. The partner sees it paused in their own
 * dashboard and can ask why.
 */
function OfferModeration({ partnerId, onChange }) {
  const [offers, setOffers] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    partners
      .staffOffers(partnerId)
      .then(setOffers)
      .catch((e) => setError(e.message))
  }, [partnerId])

  useEffect(() => {
    load()
  }, [load])

  async function setStatus(offer, status) {
    setBusy(offer.id)
    setError(null)
    try {
      await partners.staffSetOfferStatus(offer.id, status)
      load()
      onChange?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (offers === null) {
    return <p className="mt-4 border-t border-rule pt-4 text-[13px] text-mist">Loading offers…</p>
  }

  return (
    <div className="mt-4 border-t border-rule pt-4">
      {error && <p className="mb-3 text-[13px] text-coral-deep">{error}</p>}

      {!offers.length ? (
        <p className="text-[13.5px] text-mist">No offers on this account.</p>
      ) : (
        <ul className="space-y-2">
          {offers.map((o) => (
            <li
              key={o.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-rule bg-cream/40 px-4 py-3"
            >
              <IconSpark size={16} className="shrink-0 text-margin" />
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-medium text-navy">
                  {o.title}
                  <span className="ml-2 font-normal text-graphite">{offerSummary(o)}</span>
                </p>
                <p className="mt-0.5 text-[12px] text-mist">
                  {daysText(o.days_of_week)}
                  {o.terms ? ` · ${o.terms}` : ''}
                </p>
              </div>

              <Chip
                tone={o.status === 'active' ? 'moss' : o.status === 'paused' ? 'coral' : 'cream'}
                className="!px-2.5 !py-1 !text-[11.5px] capitalize"
              >
                {o.status}
              </Chip>

              {o.status === 'active' ? (
                <Button size="sm" variant="danger" disabled={busy === o.id} onClick={() => setStatus(o, 'paused')}>
                  Take it down
                </Button>
              ) : o.status === 'paused' ? (
                <Button size="sm" variant="outline" disabled={busy === o.id} onClick={() => setStatus(o, 'active')}>
                  Allow again
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Mirrors the phrasing students and partners see, so all three agree. */
function offerSummary(o) {
  const d = (c) => `$${((c ?? 0) / 100).toFixed(0)}`
  switch (o.offer_type) {
    case 'percent_off':
      return `${o.percent_off}% off`
    case 'amount_off':
      return `${d(o.amount_off_cents)} off`
    case 'free_item':
      return `Free ${o.free_item || 'treat'}`
    case 'bogo':
      return 'Buy one, get one'
    case 'spend_threshold':
      return `${d(o.amount_off_cents)} off ${d(o.min_spend_cents)}+`
    default:
      return o.description || ''
  }
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
