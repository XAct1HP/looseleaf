import { useEffect, useState } from 'react'
import BackstageHeader from './BackstageHeader'
import { Chip } from '../../components/ui/Chip'
import { CoffeeDoodle } from '../../components/brand/Doodles'
import { IconPin } from '../../components/ui/Icons'
import * as staff from '../../services/staff'

/**
 * A placeholder with a real spine: the management UI isn't built, but the data
 * it will manage already exists, so this shows the current state honestly
 * rather than a "coming soon" card with nothing behind it.
 */
export default function Sponsors() {
  const [spots, setSpots] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    staff
      .listSpots()
      .then((s) => live && setSpots(s))
      .catch(() => {})
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  const sponsored = spots.filter((s) => s.is_sponsored)

  return (
    <>
      <BackstageHeader
        title="Sponsors"
        subtitle="Where local businesses will be managed. Not built yet — this is what it will manage."
      />

      <section className="mb-6 rounded-card border border-rule bg-cream/60 px-6 py-6">
        <div className="flex items-start gap-4">
          <CoffeeDoodle className="shrink-0 text-navy/40" size={58} />
          <div>
            <h2 className="font-display text-[19px] font-semibold leading-tight">
              The one place money is allowed to touch.
            </h2>
            <p className="mt-2 max-w-[52ch] text-[14.5px] leading-relaxed text-graphite">
              Sponsored offers appear on date planning and Date Spots, always labelled. They can never
              affect who appears in Discover, whose likes you see, or the order of anything involving a
              person — the ranking query does not join this table, and shouldn’t ever be allowed to.
            </p>
          </div>
        </div>
      </section>

      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
        Date spots on this campus
      </h2>

      {loading ? (
        <p className="py-8 text-center text-[14px] text-mist">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {spots.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3.5 rounded-card border border-rule bg-white px-4 py-3.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream text-graphite">
                <IconPin size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-navy">{s.name}</p>
                <p className="truncate text-[12.5px] text-mist">
                  {s.kind}
                  {s.walk_minutes ? ` · ${s.walk_minutes} min walk` : ''}
                </p>
              </div>
              {s.is_sponsored ? (
                <Chip tone="cream">Sponsored</Chip>
              ) : (
                <span className="text-[12.5px] text-mist">—</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="mt-6 rounded-card border border-dashed border-navy/20 bg-white px-6 py-6">
        <h3 className="font-display text-[17px] font-semibold">What lands here later</h3>
        <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-graphite">
          <li>· Turn sponsorship on for a spot, with the offer copy and an end date</li>
          <li>· Impressions and taps per offer, so a business can see what they bought</li>
          <li>· A record of the agreement, because a sponsored label is a claim about someone else’s prices</li>
        </ul>
        <p className="mt-4 text-[13px] leading-relaxed text-mist">
          Until then, sponsorship is set directly in the <code className="text-graphite">date_spots</code> table,
          and only ever with a real agreement behind it.
        </p>
      </section>
    </>
  )
}
