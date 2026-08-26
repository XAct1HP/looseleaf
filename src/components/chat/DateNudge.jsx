import { useEffect, useMemo, useState } from 'react'
import { IconX } from '../ui/Icons'
import { Star } from '../brand/Doodles'
import DateSpotCard from '../dates/DateSpotCard'
import * as dates from '../../services/dates'
import { coupleContext } from '../../lib/compatibility'
import { useStore } from '../../state/store'

/**
 * ── "You two might like this 👀" ────────────────────────────────────────────
 *
 * The card that appears in a conversation once it has legs. *Whether* it
 * appears is decided in `lib/dateNudge.js`; this is only what it looks like
 * once the answer is yes.
 *
 * The things that keep it from feeling like an advert, in order of how much
 * they matter:
 *
 *   · There is a suggestion in it. A card that asks "want to go somewhere?"
 *     and leaves you to do the work is a prompt. A card that says "here, this
 *     one, nine minutes away" is help.
 *   · The X is real, immediate, and permanent for that conversation.
 *   · "Show me something else" swaps the suggestion and remembers the refusal,
 *     so that place is not offered again.
 *   · It renders nothing at all while it's loading, and nothing at all if there
 *     is nothing good to suggest. A card that pops in mid-scroll and shoves the
 *     messages down is the exact texture of an ad.
 */
export default function DateNudge({ conversationId, person, reason, onPlan, onDismiss, onShown }) {
  const { state: store } = useStore()
  const couple = useMemo(() => coupleContext(store.me, person), [store.me, person])

  const [spot, setSpot] = useState(null)
  const [pool, setPool] = useState([])
  const [state, setState] = useState('loading')

  useEffect(() => {
    let live = true
    dates
      .recommend({ conversationId, surface: 'chat', limit: 4, ...couple })
      .then((list) => {
        if (!live) return
        if (!list.length) {
          setState('empty')
          return
        }
        setPool(list.slice(1))
        setSpot(list[0])
        setState('ready')
        dates.logRecommendation(list[0].id, {
          surface: 'chat',
          conversationId,
          rank: 1,
          fit: list[0].fit,
        })
        onShown?.()
      })
      .catch(() => live && setState('empty'))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, couple])

  if (state !== 'ready' || !spot) return null

  function swap() {
    dates.logRecommendation(spot.id, { surface: 'chat', conversationId, outcome: 'swapped' })
    const [next, ...remaining] = pool
    if (!next) {
      setState('empty')
      return
    }
    setPool(remaining)
    setSpot(next)
    dates.logRecommendation(next.id, { surface: 'chat', conversationId, fit: next.fit })
  }

  return (
    <div className="relative animate-slide-note overflow-hidden rounded-card border border-rule bg-white px-5 py-5 shadow-paper">
      <Star className="absolute right-12 top-3 text-margin/50" size={13} />
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss this suggestion"
        className="press absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-mist hover:bg-navy/[0.05] hover:text-graphite"
      >
        <IconX size={16} />
      </button>

      <h3 className="font-display text-[19px] font-semibold leading-tight">
        {reason === 'they’re already trying to make a plan'
          ? 'Sounds like you’re working this out 👀'
          : 'Looks like this is going somewhere 👀'}
      </h3>
      <p className="mt-1.5 max-w-[40ch] text-[14px] text-graphite">
        Ready to take it off Looseleaf? We think this one would suit you two.
      </p>

      <div className="mt-4">
        <DateSpotCard
          spot={spot}
          fit={spot.fit}
          compact
          chooseLabel="Plan this date"
          onChoose={() => onPlan(spot)}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={swap}
          className="press focus-ring rounded-full border border-rule bg-white px-3.5 py-2 text-[13px] font-medium text-graphite transition hover:border-navy/25 hover:text-navy"
        >
          Show me something else
        </button>
        <button
          type="button"
          onClick={() => onPlan(null)}
          className="press focus-ring rounded-full border border-rule bg-white px-3.5 py-2 text-[13px] font-medium text-graphite transition hover:border-navy/25 hover:text-navy"
        >
          We want something different
        </button>
      </div>

      {spot.isPartner && (
        <p className="mt-3.5 text-[11.5px] leading-relaxed text-mist">
          A Looseleaf Partner. They keep a perk for Looseleaf dates — and no business can pay to be
          suggested somewhere it doesn’t fit.
        </p>
      )}
    </div>
  )
}
