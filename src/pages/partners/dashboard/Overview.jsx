import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHead } from '../DashboardLayout'
import StatTile from '../../../components/backstage/StatTile'
import Button from '../../../components/ui/Button'
import { IconSpark, IconCalendar } from '../../../components/ui/Icons'
import { usePartnerAccount } from '../../../state/partnerAccount'
import { can } from '../../../lib/partnerBilling'
import * as partners from '../../../services/partners'

/**
 * The page has one job: answer "is Loose Leaf bringing me customers?" before
 * the owner has to scroll. So one big number, then the supporting figures,
 * then the offer they're running and what happened this week.
 *
 * Deliberately six tiles and not sixteen. This is somebody who runs a
 * restaurant, checking between covers.
 */
export default function Overview() {
  const { partner, entitlements } = usePartnerAccount()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!partner) return
    let live = true
    partners
      .overview(partner.id)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [partner])

  const hasPasses = can(entitlements, 'date_passes')

  return (
    <>
      <PageHead
        title="Overview"
        subtitle="This month so far. A date counts when somebody walked in and your staff scanned their pass."
        action={
          hasPasses && (
            <Button to="/partners/dashboard/scan" variant="coral" size="md">
              Scan a pass
            </Button>
          )
        }
      />

      {error && (
        <p className="mb-6 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">
          {error}
        </p>
      )}

      {/* the headline */}
      <div className="relative overflow-hidden rounded-card border border-rule bg-cream/70 px-6 py-7">
        <span className="paper-lines-soft pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
        <div className="relative">
          <p className="text-[12.5px] font-medium text-mist">Dates this month</p>
          <p className="mt-2 font-sans text-[56px] font-semibold leading-none tabular-nums text-navy">
            {data ? (data.dates_this_month ?? 0) : '—'}
          </p>
          <p className="mt-3 max-w-[42ch] text-[13.5px] leading-relaxed text-graphite">
            {hasPasses
              ? 'Verified — each one is a Date Pass your staff scanned at the table.'
              : 'Verified dates start once you have an offer running with a Date Pass on it.'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Date Spot views" value={data?.spot_views} hint="Students who opened your page" />
        <StatTile label="Recommendations" value={data?.recommendations} hint="Times Loose Leaf suggested you" />
        <StatTile label="Offers unlocked" value={data?.offer_unlocks} hint="Passes taken out" />
        <StatTile label="Verified dates" value={data?.verified_dates} hint="Passes actually redeemed" />
        <StatTile label="Today" value={data?.today} hint="Passes redeemed since midnight" tone="quiet" />
        <StatTile label="This week" value={data?.this_week} hint="Passes redeemed since Monday" tone="quiet" />
      </div>

      {/* running offers */}
      <section className="mt-9">
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
            Running now
          </h2>
          {can(entitlements, 'offers') && (
            <Link
              to="/partners/dashboard/offers"
              className="text-[13.5px] font-medium text-graphite hover:text-navy"
            >
              All offers
            </Link>
          )}
        </div>

        {!data?.active_offers?.length ? (
          <div className="rounded-card border border-dashed border-navy/20 bg-white px-6 py-8 text-center">
            <IconSpark size={22} className="mx-auto text-mist" />
            <p className="mt-3 text-[15px] font-medium text-navy">No offer running.</p>
            <p className="mx-auto mt-1.5 max-w-[42ch] text-[13.5px] leading-relaxed text-graphite">
              A Date Spot with a perk gets chosen a lot more often than one without.
            </p>
            <Button to="/partners/dashboard/offers" variant="outline" size="md" className="mt-5">
              Create an offer
            </Button>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {data.active_offers.map((o) => {
              const used = Number(o.used_this_month ?? 0)
              const cap = o.monthly_cap
              const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : null

              return (
                <li key={o.id} className="rounded-card border border-rule bg-white px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15.5px] font-medium text-navy">{o.title}</p>
                      <p className="mt-1 text-[12.5px] text-mist">{o.days}</p>
                    </div>
                    <Link
                      to="/partners/dashboard/offers"
                      className="shrink-0 rounded-xl border border-rule px-3 py-1.5 text-[13px] font-medium text-graphite hover:border-navy/25 hover:text-navy"
                    >
                      Edit offer
                    </Link>
                  </div>

                  {cap && (
                    <div className="mt-3.5">
                      <div className="flex items-baseline justify-between text-[12.5px] text-graphite">
                        <span className="tabular-nums">
                          {used} / {cap} this month
                        </span>
                        <span className="text-mist">{pct}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cream">
                        <div
                          className={`h-full rounded-full ${pct >= 100 ? 'bg-coral-deep' : 'bg-moss'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* recent activity */}
      <section className="mt-9">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
          Last seven days
        </h2>

        {!data?.recent?.length ? (
          <p className="rounded-card border border-rule bg-cream/50 px-5 py-6 text-center text-[13.5px] text-graphite">
            Nothing redeemed yet this week.
          </p>
        ) : (
          <ul className="divide-y divide-rule rounded-card border border-rule bg-white">
            {data.recent.map((r) => (
              <li key={r.day} className="flex items-center gap-3.5 px-5 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-moss-soft text-[#3F7454]">
                  <IconCalendar size={17} />
                </span>
                <span className="min-w-0 flex-1 text-[14.5px] text-navy">{dayLabel(r.day)}</span>
                <span className="shrink-0 text-[14px] tabular-nums text-graphite">
                  {r.redemptions} {Number(r.redemptions) === 1 ? 'date' : 'dates'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}



function dayLabel(iso) {
  const d = new Date(`${iso}T12:00:00`)
  const today = new Date()
  const days = Math.round((today.setHours(12, 0, 0, 0) - d.getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long' })
}
