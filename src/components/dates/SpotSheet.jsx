import { useState } from 'react'
import Sheet from '../ui/Sheet'
import Button from '../ui/Button'
import { Chip } from '../ui/Chip'
import DatePassCard from './DatePassCard'
import { IconPin, IconSpark, IconLink, IconCalendar } from '../ui/Icons'
import { dateTypeLabel, vibeLabel, priceLabel, walkLabel } from '../../data/partnerCatalog'
import { publicUrl } from '../../services/live/partnerMedia'
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

/**
 * Everything about one place, and the button that turns a perk into a ticket.
 *
 * Unlocking is a real, server-side action — `issue_date_pass` checks the
 * offer's days, hours, and caps before it mints anything — so this sheet can't
 * hand somebody a pass to a place that stopped running the offer an hour ago.
 * Asking twice returns the pass they already have rather than a second one.
 */
export default function SpotSheet({ spot, onClose, conversationId = null, surface = 'discovery' }) {
  const [pass, setPass] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!spot) return null

  const cover = spot.coverPath && publicUrl(spot.coverPath)
  const meta = [spot.kind, priceLabel(spot.priceLevel), walkLabel(spot)].filter(Boolean)

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

  const hours = Object.keys(spot.hours ?? {}).length > 0

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
          {cover && (
            <div className="-mx-6 mb-5 aspect-[16/9] overflow-hidden">
              <img src={cover} alt="" className="h-full w-full object-cover" />
            </div>
          )}

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
                  {spot.offer.daysText && (
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
              <p className="mt-2.5 text-center text-[11.5px] leading-relaxed text-mist">
                You get a Date Pass to show when you arrive. Nothing is charged, and the business
                never learns who you are.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">
              {error}
            </p>
          )}

          {(spot.dateTypes?.length > 0 || spot.vibes?.length > 0) && (
            <section className="mt-6">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-mist">
                Great for
              </p>
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

          <dl className="mt-6 space-y-3">
            {spot.addressLine && (
              <DetailRow Icon={IconPin} label={spot.addressLine} hint={walkLabel(spot)} />
            )}
            {spot.reservations && (
              <DetailRow Icon={IconCalendar} label={`Reservations ${spot.reservations.toLowerCase()}`} />
            )}
            {spot.minAge && <DetailRow Icon={IconCalendar} label={`${spot.minAge}+`} />}
            {spot.website && (
              <DetailRow
                Icon={IconLink}
                label={
                  <a
                    href={spot.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline underline-offset-2 hover:text-navy"
                  >
                    {spot.website.replace(/^https?:\/\//, '')}
                  </a>
                }
              />
            )}
          </dl>

          {hours && (
            <section className="mt-6">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-mist">Hours</p>
              <ul className="mt-2 space-y-1">
                {DAY_ORDER.filter((d) => spot.hours[d] !== undefined).map((d) => {
                  const windows = spot.hours[d]
                  return (
                    <li key={d} className="flex justify-between text-[13.5px]">
                      <span className="text-graphite">{DAY_LABEL[d]}</span>
                      <span className="text-navy">
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

          {spot.galleryPaths?.length > 0 && (
            <div className="mt-6 grid grid-cols-3 gap-2">
              {spot.galleryPaths.map((p) => (
                <img
                  key={p}
                  src={publicUrl(p)}
                  alt=""
                  className="aspect-square w-full rounded-xl object-cover"
                />
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}

function DetailRow({ Icon, label, hint }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-mist">
        <Icon size={16} />
      </span>
      <span className="min-w-0 text-[14px] text-graphite">
        {label}
        {hint && <span className="ml-2 text-[12.5px] text-mist">{hint}</span>}
      </span>
    </div>
  )
}

function time(t) {
  if (!t) return ''
  const [h, m] = String(t).split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`
}
