import { useCallback, useEffect, useState } from 'react'
import Sheet from '../ui/Sheet'
import Button from '../ui/Button'
import DateSpotCard from '../dates/DateSpotCard'
import DatePassCard from '../dates/DatePassCard'
import { SelectChip } from '../ui/Chip'
import { IconBack } from '../ui/Icons'
import { PLAN_CHOICES, VIBE_TAGS } from '../../data/partnerCatalog'
import * as dates from '../../services/dates'

/**
 * ── Plan a Date ─────────────────────────────────────────────────────────────
 *
 * A few short questions, then Loose Leaf answers "where should we go?".
 *
 * Two things about that answer are worth reading the code for. The first is
 * where it comes from: `recommend_date_spots`, in the database, which filters
 * on the date type rather than weighting it — so choosing Coffee cannot return
 * a paying brewery. The second is what this component does to the order, which
 * is nothing. It renders the list it is given.
 *
 * The best match gets the full card because it is the answer to the question;
 * the rest sit underneath as alternatives. Any of them can be waved away, and
 * that is remembered.
 */

const WHENS = ['Tonight', 'Tomorrow', 'This weekend', 'Pick a day']
const BUDGETS = [
  { id: 1, label: '$' },
  { id: 2, label: '$$' },
  { id: 3, label: '$$$' },
  { id: null, label: 'Any' },
]

export default function DatePlanner({ open, dateType, person, conversationId, onClose, onConfirm }) {
  const [step, setStep] = useState('what')
  const [type, setType] = useState(dateType?.id ?? null)
  const [vibes, setVibes] = useState([])
  const [budget, setBudget] = useState(null)
  const [when, setWhen] = useState(null)
  const [day, setDay] = useState('')

  const [results, setResults] = useState([])
  const [chosen, setChosen] = useState(null)
  const [pass, setPass] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setStep(dateType ? 'when' : 'what')
    setType(dateType?.id ?? null)
    setVibes([])
    setBudget(null)
    setWhen(null)
    setDay('')
    setResults([])
    setChosen(null)
    setPass(null)
    setError(null)
  }, [open, dateType])

  const search = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await dates.recommend({
        dateType: type,
        vibes,
        maxPrice: budget,
        conversationId,
        surface: 'planner',
        limit: 6,
      })
      setResults(list)
      list.forEach((s, i) =>
        dates.logRecommendation(s.id, {
          surface: 'planner',
          conversationId,
          rank: i + 1,
          fit: s.fit,
        })
      )
      setStep('results')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [type, vibes, budget, conversationId])

  function finish(spot, issuedPass) {
    dates.logRecommendation(spot.id, {
      surface: 'planner',
      conversationId,
      fit: spot.fit,
      outcome: 'chosen',
    })
    const choice = PLAN_CHOICES.find((c) => c.id === type)
    onConfirm({
      type: choice?.label ?? 'A date',
      emoji: choice?.emoji ?? '📍',
      when: when === 'Pick a day' ? day : (when ?? 'Soon'),
      spot: spot.name,
      spotId: spot.id,
      walk: spot.walkMinutes ? `${spot.walkMinutes} min walk` : null,
      offer: issuedPass ? issuedPass.offerSummary : null,
    })
  }

  async function choose(spot) {
    setChosen(spot)
    if (!spot.offer) {
      finish(spot, null)
      return
    }
    setLoading(true)
    try {
      const issued = await dates.unlockOffer(spot.offer.id, { conversationId, surface: 'planner' })
      setPass({
        ...issued,
        offerSummary: spot.offer.summary,
        offerTitle: spot.offer.title ?? issued.offerTitle,
        terms: spot.offer.terms,
        daysText: spot.offer.daysText,
        partnerName: issued.partnerName ?? spot.name,
        status: 'issued',
      })
      setStep('pass')
    } catch (e) {
      // A perk that didn't come through shouldn't stop two people making a
      // plan. Say so once, and carry on with the plan itself.
      setError(`${e.message} The plan still works — the perk just isn’t available.`)
      finish(spot, null)
    } finally {
      setLoading(false)
    }
  }

  const [best, ...rest] = results
  const canSearch = when && (when !== 'Pick a day' || day)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={step === 'pass' ? undefined : step === 'results' ? 'Here’s where we’d go' : 'Make a plan'}
      subtitle={
        step === 'results' || step === 'pass' || !person
          ? undefined
          : `${person.firstName} gets to say yes, or suggest something else.`
      }
      maxWidth="max-w-lg"
    >
      {/* what are we feeling */}
      {step === 'what' && (
        <div>
          <span className="label">What are we feeling?</span>
          <div className="flex flex-wrap gap-2">
            {PLAN_CHOICES.map((c) => (
              <SelectChip
                key={c.label}
                selected={type === c.id}
                onClick={() => {
                  setType(c.id)
                  setStep('when')
                }}
              >
                <span aria-hidden="true">{c.emoji}</span>
                {c.label}
              </SelectChip>
            ))}
          </div>
        </div>
      )}

      {/* the details */}
      {step === 'when' && (
        <div className="space-y-6">
          <div>
            <span className="label">When?</span>
            <div className="flex flex-wrap gap-2">
              {WHENS.map((w) => (
                <SelectChip key={w} selected={when === w} onClick={() => setWhen(w)}>
                  {w}
                </SelectChip>
              ))}
            </div>
            {when === 'Pick a day' && (
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="field mt-3"
                aria-label="Which day"
              />
            )}
          </div>

          <div>
            <span className="label">Budget</span>
            <div className="flex flex-wrap gap-2">
              {BUDGETS.map((b) => (
                <SelectChip key={b.label} selected={budget === b.id} onClick={() => setBudget(b.id)}>
                  {b.label}
                </SelectChip>
              ))}
            </div>
          </div>

          <div>
            <span className="label">
              Vibe <span className="font-normal text-mist">— optional</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {VIBE_TAGS.slice(0, 7).map((v) => (
                <SelectChip
                  key={v.id}
                  selected={vibes.includes(v.id)}
                  onClick={() =>
                    setVibes(vibes.includes(v.id) ? vibes.filter((x) => x !== v.id) : [...vibes, v.id])
                  }
                >
                  {v.label}
                </SelectChip>
              ))}
            </div>
          </div>

          {error && <p className="text-[13.5px] text-coral-deep">{error}</p>}

          <Button variant="coral" size="lg" full onClick={search} disabled={!canSearch || loading}>
            {loading ? 'Having a think…' : 'Show me somewhere'}
          </Button>
        </div>
      )}

      {/* the answer */}
      {step === 'results' && (
        <div>
          <button
            type="button"
            onClick={() => setStep('when')}
            className="press focus-ring -ml-2 mb-4 flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13.5px] font-medium text-graphite hover:text-navy"
          >
            <IconBack size={17} />
            Change what we’re after
          </button>

          {!results.length ? (
            <div className="rounded-card border border-rule bg-cream/60 px-5 py-8 text-center">
              <p className="text-[15px] font-medium text-navy">Nothing quite fits that yet.</p>
              <p className="mx-auto mt-2 max-w-[38ch] text-[13.5px] leading-relaxed text-graphite">
                Try a different kind of date, or go wider with Surprise us.
              </p>
              <Button variant="outline" size="md" className="mt-5" onClick={() => setStep('what')}>
                Try something else
              </Button>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-mist">
                Best match
              </p>
              <DateSpotCard
                spot={best}
                fit={best.fit}
                chooseLabel="Choose this date"
                onChoose={choose}
                onDismiss={(s) => {
                  dates.logRecommendation(s.id, {
                    surface: 'planner',
                    conversationId,
                    outcome: 'dismissed',
                  })
                  setResults(results.filter((r) => r.id !== s.id))
                }}
              />

              {rest.length > 0 && (
                <>
                  <p className="mb-2 mt-6 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-mist">
                    Also nearby
                  </p>
                  <ul className="space-y-2.5">
                    {rest.map((s) => (
                      <li key={s.id}>
                        <DateSpotCard spot={s} compact chooseLabel="Choose this one" onChoose={choose} />
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {error && (
                <p className="mt-4 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">
                  {error}
                </p>
              )}

              <p className="mt-5 text-center text-[11.5px] leading-relaxed text-mist">
                Loose Leaf Partners are labelled. A place can’t pay to be suggested for a kind of
                date it doesn’t suit.
              </p>
            </>
          )}
        </div>
      )}

      {/* the ticket */}
      {step === 'pass' && pass && (
        <div className="pt-1">
          <DatePassCard pass={pass} compact />
          <Button variant="coral" size="lg" full className="mt-5" onClick={() => finish(chosen, pass)}>
            Send the plan to {person?.firstName ?? 'them'}
          </Button>
          <p className="mt-3 text-center text-[12px] leading-relaxed text-mist">
            Your pass is saved under Date Passes on your profile.
          </p>
        </div>
      )}
    </Sheet>
  )
}
