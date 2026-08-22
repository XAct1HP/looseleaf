import { useEffect, useState } from 'react'
import Sheet from '../ui/Sheet'
import Button from '../ui/Button'
import { Chip } from '../ui/Chip'
import DatePassCard from './DatePassCard'
import SpotImage from './SpotImage'
import SpotMap from './SpotMap'
import { IconSpark, IconLink, IconLock } from '../ui/Icons'
import { dateTypeLabel, vibeLabel, priceLabel, walkLabel } from '../../data/partnerCatalog'
import { preload } from '../../services/live/partnerMedia'
import * as dates from '../../services/dates'

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABEL = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}
const TODAY_KEY = () => DAY_ORDER[(new Date().getDay() + 6) % 7]

/**
 * ── Everything about one place ──────────────────────────────────────────────
 *
 * Ordered the way somebody standing in the street actually asks: what is it,
 * where is it, can I get there, is it open, what does it cost, and is there a
 * perk. The map and the Directions button come before the hours because the
 * first question after "yes, that one" is "how do I get there".
 *
 * Unlocking is a real, server-side action — `issue_date_pass` re-checks the
 * offer's days, hours and caps before it mints anything — so this sheet can't
 * hand somebody a pass to a place that stopped running the offer an hour ago.
 * Asking twice returns the pass they already have.
 */
export default function SpotSheet({ spot, onClose, conversationId = null, surface = 'discovery' }) {
  const [pass, setPass] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Gallery shots are below the fold; warm them while somebody reads the top.
  useEffect(() => {
    if (spot?.galleryPaths?.length) preload(spot.galleryPaths)
  }, [spot])

  if (!spot) return null

  const meta = [spot.kind, priceLabel(spot.priceLevel), walkLabel(spot)].filter(Boolean)
  const hasHours = Object.keys(spot.hours ?? {}).length > 0
  const today = TODAY_KEY()

  async function unlock() {
    if (busy || !spot.offer) return
    setBusy(true)
    setError(null)
    try {
      const issued = await dates.unlockOffer(spot.offer.id, { conversationId, surface })
      setPass({
        ...issued,
        offerSummary: spot.offer.summary,
        offerTitle: spot.offer.title ?? issued.offerTitle,
        terms: spot.offer.terms,
        daysText: spot.offer.daysText,
        partnerName: issued.partnerName ?? spot.name,
        status: 'issued',
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function close() {
    setPass(null)
    setError(null)
    onClose()
  }

  return (
    <Sheet open={Boolean(spot)} onClose={close} title={pass ? undefined : spot.name} maxWidth="max-w-lg">
      {pass ? (
        <div className="pt-1">
          <DatePassCard pass={pass} />
          <p className="mt-5 text-center text-[13.5px] leading-relaxed text-graphite">
            It’s saved — you’ll find it under Date Passes on your profile whenever you need it.
          </p>
          <Button variant="outline" size="lg" full className="mt-4" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <>
          {/* Full-bleed cover: the sheet's own padding is undone so the photo
              reaches the edges, the way it does on the card. */}
          <div className="-mx-6 mb-5">
            {/* Full size here and only here: this is the one place the photo
                is big enough on screen to be worth the extra bytes. */}
            <SpotImage
              path={spot.coverPath}
              className="aspect-[16/9] w-full"
              seed={spot.id ?? spot.name}
              size="full"
              priority
            />
          </div>

          <p className="text-[13px] text-mist">{meta.join(' · ')}</p>
          {spot.note && (
            <p className="mt-2.5 text-[15px] leading-relaxed text-graphite">{spot.note}</p>
          )}

          {spot.isPartner && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-mist">
              <span className="h-1.5 w-1.5 rounded-full bg-notebook-deep" />
              Loose Leaf Partner
            </p>
          )}

          {/* the perk */}
          {spot.offer && (
            <div className="mt-5 rounded-card border border-[#F2E6D6] bg-cream px-5 py-4">
              <div className="flex items-start gap-3">
                <IconSpark size={18} className="mt-0.5 shrink-0 text-margin" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-mist">
                    Loose Leaf perk
                  </p>
                  <p className="mt-1 font-display text-[19px] font-semibold leading-tight text-navy">
                    {spot.offer.summary}
                  </p>
                  {spot.offer.daysText && spot.offer.daysText !== 'Any day' && (
                    <p className="mt-1 text-[13px] text-graphite">Valid {spot.offer.daysText}</p>
                  )}
                  {spot.offer.terms && (
                    <p className="mt-2 text-[12px] leading-relaxed text-mist">{spot.offer.terms}</p>
                  )}
                </div>
              </div>

              <Button variant="coral" size="md" full className="mt-4" onClick={unlock} disabled={busy}>
                {busy ? 'Getting your pass…' : 'Unlock this offer'}
              </Button>
              <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[11.5px] leading-relaxed text-mist">
                <IconLock size={12} />
                Nothing is charged, and they never learn who you are.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">
              {error}
            </p>
          )}

          {/* where it is */}
          <section className="mt-6">
            <SpotMap spot={spot} />
          </section>

          {/* what it's good for */}
          {(spot.dateTypes?.length > 0 || spot.vibes?.length > 0) && (
            <section className="mt-6">
              <SectionLabel>Great for</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(spot.dateTypes ?? []).map((t) => (
                  <Chip key={t} tone="cream" className="!px-2.5 !py-1 !text-[12px]">
                    {dateTypeLabel(t)}
                  </Chip>
                ))}
                {(spot.vibes ?? []).map((v) => (
                  <Chip key={v} tone="default" className="!px-2.5 !py-1 !text-[12px]">
                    {vibeLabel(v)}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          {/* hours */}
          {hasHours && (
            <section className="mt-6">
              <SectionLabel>Hours</SectionLabel>
              <ul className="mt-2 space-y-1">
                {DAY_ORDER.filter((d) => spot.hours[d] !== undefined).map((d) => {
                  const windows = spot.hours[d]
                  const isToday = d === today
                  return (
                    <li
                      key={d}
                      className={`flex justify-between text-[13.5px] ${
                        isToday ? 'font-medium text-navy' : ''
                      }`}
                    >
                      <span className={isToday ? '' : 'text-graphite'}>
                        {DAY_LABEL[d]}
                        {isToday && <span className="ml-2 text-[11.5px] text-mist">today</span>}
                      </span>
                      <span className={isToday ? '' : 'text-navy'}>
                        {!windows?.length
                          ? 'Closed'
                          : windows.map((w) => `${time(w[0])}–${time(w[1])}`).join(', ')}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* the practical details */}
          <section className="mt-6">
            <SectionLabel>Good to know</SectionLabel>
            <dl className="mt-2 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              <Detail label="Price" value={spot.priceLevel ? priceLabel(spot.priceLevel) : null} />
              <Detail label="From campus" value={walkLabel(spot)} />
              <Detail
                label="Indoor or out"
                value={spot.indoorOutdoor ? capitalise(spot.indoorOutdoor) : null}
              />
              <Detail label="Reservations" value={spot.reservations} />
              <Detail label="Minimum age" value={spot.minAge ? `${spot.minAge}+` : null} />
              <Detail label="Phone" value={spot.phone} href={spot.phone ? `tel:${spot.phone}` : null} />
            </dl>

            {spot.website && (
              <a
                href={spot.website}
                target="_blank"
                rel="noreferrer noopener"
                className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg text-[14px] font-medium text-graphite underline underline-offset-4 hover:text-navy"
              >
                <IconLink size={15} />
                {spot.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            )}
          </section>

          {/* the room */}
          {spot.galleryPaths?.length > 0 && (
            <section className="mt-6">
              <SectionLabel>The place</SectionLabel>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {spot.galleryPaths.map((p, i) => (
                  <SpotImage
                    key={p}
                    path={p}
                    className="aspect-square w-full"
                    rounded="rounded-xl"
                    seed={`${spot.id}-${i}`}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </Sheet>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-mist">{children}</p>
  )
}

function Detail({ label, value, href }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-3 sm:block">
      <dt className="text-[12.5px] text-mist">{label}</dt>
      <dd className="text-[14px] text-navy sm:mt-0.5">
        {href ? (
          <a href={href} className="underline underline-offset-2">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

function capitalise(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

function time(t) {
  if (!t) return ''
  const [h, m] = String(t).split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`
}


