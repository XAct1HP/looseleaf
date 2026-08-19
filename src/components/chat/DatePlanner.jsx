import { useState } from 'react'
import Sheet from '../ui/Sheet'
import Button from '../ui/Button'
import { IconCheck, IconPin } from '../ui/Icons'
import { DATE_SPOTS, SPONSORED_OFFERS } from '../../data/catalog'

const WHENS = ['Tonight', 'Tomorrow', 'This weekend', 'Pick a day']

/**
 * A shared plan card. Sponsored suggestions are allowed here — clearly
 * labelled, and completely separate from anything that ranks people.
 */
export default function DatePlanner({ open, dateType, person, onClose, onConfirm }) {
  const [when, setWhen] = useState(null)
  const [day, setDay] = useState('')
  const [spotId, setSpotId] = useState(null)

  if (!dateType) return null

  const spots = DATE_SPOTS.filter((s) => s.kind === dateType.label)
  const list = spots.length ? spots : DATE_SPOTS.slice(0, 4)
  const offer = dateType.id === 'coffee' ? SPONSORED_OFFERS[0] : null
  const ready = !!when && (when !== 'Pick a day' || day) && !!spotId

  const confirm = () => {
    const spot = DATE_SPOTS.find((s) => s.id === spotId)
    onConfirm({
      type: dateType.label,
      emoji: dateType.emoji,
      when: when === 'Pick a day' ? day : when,
      spot: spot?.name,
      walk: spot?.walk,
    })
    setWhen(null)
    setDay('')
    setSpotId(null)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Make a plan"
      subtitle={`${dateType.emoji} ${dateType.label} with ${person.firstName}. They’ll get to say yes or suggest something else.`}
      maxWidth="max-w-lg"
    >
      <div className="space-y-6">
        <div>
          <span className="label">When?</span>
          <div className="flex flex-wrap gap-2">
            {WHENS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWhen(w)}
                className={`press focus-ring rounded-full border px-4 py-2.5 text-[14px] font-medium transition ${
                  when === w ? 'border-navy bg-navy text-paper' : 'border-rule bg-white text-graphite hover:border-navy/25'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          {when === 'Pick a day' && (
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="field mt-3"
            />
          )}
        </div>

        <div>
          <span className="label">Where?</span>
          <ul className="space-y-2">
            {list.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSpotId(s.id)}
                  className={`focus-ring flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
                    spotId === s.id
                      ? 'border-coral bg-coral-wash'
                      : 'border-rule bg-white hover:border-navy/20'
                  }`}
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream text-graphite">
                    <IconPin size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-navy">{s.name}</span>
                    <span className="mt-0.5 block text-[12.5px] text-mist">
                      {s.walk} · {s.kind} · {s.tags.join(' · ')}
                    </span>
                    <span className="mt-1 block text-[12.5px] text-graphite">{s.note}</span>
                  </span>
                  {spotId === s.id && (
                    <span className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-coral text-white">
                      <IconCheck size={12} />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {offer && (
            <div className="mt-3 rounded-2xl border border-[#F2E6D6] bg-cream px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span className="text-[20px] leading-none" aria-hidden="true">
                  {offer.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-medium text-navy">{offer.headline}</p>
                  <p className="mt-0.5 text-[13.5px] text-graphite">
                    {offer.detail} · {offer.spot}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-mist">{offer.distance}</p>
                </div>
                <span className="shrink-0 rounded-full border border-rule bg-white px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-mist">
                  Sponsored
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <Button variant="coral" size="lg" full className="mt-6" disabled={!ready} onClick={confirm}>
        Send the plan
      </Button>
      <p className="mt-3 text-center text-[12px] leading-relaxed text-mist">
        Sponsored places are always labelled and never affect who you see on Looseleaf.
      </p>
    </Sheet>
  )
}
