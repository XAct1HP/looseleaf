import { useEffect, useMemo, useState } from 'react'
import SubPageHeader from '../../components/common/SubPageHeader'
import RailCard from '../../components/common/RailCard'
import DateSpotCard from '../../components/dates/DateSpotCard'
import SpotSheet from '../../components/dates/SpotSheet'
import { SelectChip } from '../../components/ui/Chip'
import { useRail } from '../../components/nav/AppLayout'
import { DATE_TYPE_TAGS } from '../../data/partnerCatalog'
import * as dates from '../../services/dates'
import { preload } from '../../services/live/partnerMedia'

/**
 * ── Date Spots ──────────────────────────────────────────────────────────────
 *
 * Places worth going, filtered by the kind of date rather than by cuisine.
 * Partners and organic spots sit in the same list and wear the same card — the
 * only difference is a small "Loose Leaf Partner" line and, sometimes, a perk.
 *
 * Filtering by date type is a filter and not a sort, so asking for coffee
 * cannot return a brewery no matter who is paying. What a partner buys shows up
 * as *what is on the card*, never as *which card is at the top*.
 */
export default function DateSpots() {
  const [spots, setSpots] = useState([])
  const [offers, setOffers] = useState({})
  const [type, setType] = useState(null)
  const [openSpot, setOpenSpot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    Promise.all([dates.spots(), dates.offersByPartner()])
      .then(([s, o]) => {
        if (!live) return
        setSpots(s)
        setOffers(o)
        // Warm the covers now rather than when each card scrolls into view;
        // by the time somebody has read the filters, they're in cache.
        preload(s.map((x) => x.coverPath).filter(Boolean))
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  useRail(
    <RailCard title="About Loose Leaf Partners">
      <p className="text-[13.5px] leading-relaxed text-graphite">
        Some places here are Loose Leaf Partners — local businesses that keep a perk for Looseleaf
        dates. They’re always labelled.
      </p>
      <p className="mt-3 text-[13.5px] leading-relaxed text-graphite">
        Being a partner puts a place on this page and can put an offer on its card. It can’t change
        who appears in Discover, whose likes you see, or the order of anything involving a person.
      </p>
    </RailCard>,
    []
  )

  // Only offer a filter that would actually return something.
  const availableTypes = useMemo(() => {
    const present = new Set(spots.flatMap((s) => s.dateTypes ?? []))
    return DATE_TYPE_TAGS.filter((t) => present.has(t.id))
  }, [spots])

  const shown = useMemo(() => {
    const list = type ? spots.filter((s) => (s.dateTypes ?? []).includes(type)) : spots
    return list.map((s) => ({ ...s, offer: s.isPartner ? (offers[s.partnerId] ?? null) : null }))
  }, [spots, offers, type])

  return (
    <>
      <SubPageHeader
        title="Date Spots"
        subtitle="Places around campus that work when you barely know each other yet."
      />

      {availableTypes.length > 1 && (
        <div className="hide-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
          <SelectChip selected={type === null} onClick={() => setType(null)} className="shrink-0">
            Everything
          </SelectChip>
          {availableTypes.map((t) => (
            <SelectChip
              key={t.id}
              selected={type === t.id}
              onClick={() => setType(type === t.id ? null : t.id)}
              className="shrink-0"
            >
              <span aria-hidden="true">{t.emoji}</span>
              {t.label}
            </SelectChip>
          ))}
        </div>
      )}

      {error && (
        <p className="mb-5 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-12 text-center text-[14px] text-mist">Loading…</p>
      ) : !shown.length ? (
        <p className="rounded-card border border-rule bg-cream/50 px-5 py-10 text-center text-[14px] leading-relaxed text-graphite">
          Nothing tagged for that yet. Try another kind of date.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((s, i) => (
            <li key={s.id}>
              <DateSpotCard
                spot={s}
                priority={i < 4}
                onChoose={() => {
                  setOpenSpot(s)
                  dates.logSpotView(s.id)
                }}
                chooseLabel="View Date Spot"
              />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-7 px-1 text-[12.5px] leading-relaxed text-mist">
        Loose Leaf Partners pay to be listed here and to keep a perk for Looseleaf dates. They can’t
        pay to be suggested for a kind of date they don’t suit, and none of it touches Discover.
      </p>

      <SpotSheet spot={openSpot} onClose={() => setOpenSpot(null)} />
    </>
  )
}
