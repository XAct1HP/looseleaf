import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import ProfileCard from '../components/profile/ProfileCard'
import EmptyState from '../components/common/EmptyState'
import Button from '../components/ui/Button'
import CampusRail from '../components/common/CampusRail'
import { useRail } from '../components/nav/AppLayout'
import { useDeck, useDeckStatus, useIncoming, useStore } from '../state/store'
import { IconChevron } from '../components/ui/Icons'

/**
 * ── Discover ────────────────────────────────────────────────────────────────
 *
 * A few people a day, chosen rather than shuffled, and once you have decided
 * about somebody they do not come back. How few is deliberate: ten percent of
 * the campus, capped at ten — five on the day a campus opens at fifty. See
 * `deck_size_for()` in 20260828120000.
 *
 * Which is why the two empty states below are different sentences. "That's
 * everyone for today" is a promise that tomorrow has more people in it; saying
 * it when the campus itself is out sends somebody back tomorrow to exactly the
 * same empty screen. So when the pool is dry it says the true thing instead.
 */
export default function Discover() {
  const deck = useDeck()
  const status = useDeckStatus()
  const incoming = useIncoming()
  const { state, actions } = useStore()

  useRail(<CampusRail />, [state.tonight.active])

  // Opening Discover is what hands out the day's people — the same moment
  // `get_deck()` writes its assignment. Deliberately here and not in the
  // store's boot: somebody who never opens this page has not spent a day.
  const { ensureDeck } = actions
  useEffect(() => {
    ensureDeck()
  }, [ensureDeck, state.seen.length])

  const person = deck[0]
  const daily = status.dailySize || 0
  // Position in today's handful, counted down from what is still waiting —
  // "3 of 5" means three of five, not three people assigned.
  const position = Math.max(1, Math.min(daily, daily - deck.length + 1))

  if (!person) {
    const poolDry = (status.poolLeft ?? 0) === 0

    return (
      <>
        <PageHeader
          title="Discover"
          subtitle="People around your campus we think you’ll like."
        />
        <EmptyState
          art="coffee"
          title={poolDry ? 'We’re out of people for now.' : 'That’s everyone for today.'}
          body={
            poolDry
              ? 'You’ve seen everyone on your campus who’s also looking for someone like you. As soon as enough new people join, your Discover fills back up.'
              : 'Go live your life. We’ll find some more people tomorrow.'
          }
          action={
            incoming.length > 0 ? (
              <Button to="/app/likes" variant="coral" size="lg">
                See who’s already liked you
                <IconChevron size={17} />
              </Button>
            ) : (
              <Button to="/app/campus" variant="outline" size="lg">
                See what’s happening on campus
              </Button>
            )
          }
        />

        {poolDry ? (
          <p className="mx-auto mt-5 max-w-[42ch] text-center text-[13px] leading-relaxed text-mist">
            Inviting someone is the fastest way to fix this — a campus fills up from the inside.
          </p>
        ) : (
          <div className="mt-5 flex items-center justify-center gap-2 text-[13px] text-mist">
            <span>No infinite scroll here. That’s on purpose.</span>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Discover"
        subtitle="People around your campus we think you’ll like."
        action={
          daily > 0 && (
            <span className="hidden shrink-0 rounded-full border border-rule bg-white px-3 py-1.5 text-[12.5px] font-medium tabular-nums text-graphite sm:inline-flex">
              {position} of {daily} today
            </span>
          )
        }
      />

      <div key={person.id} className="animate-fade-up">
        <ProfileCard
          person={person}
          fit={person.fit}
          reasons={person.reasons}
          onLike={(payload) => actions.like(payload)}
          onPass={() => actions.pass(person.id)}
        />
      </div>

      <p className="mt-8 text-center text-[13px] text-mist">
        <Link to="/app/likes" className="font-medium text-graphite underline underline-offset-4 hover:text-navy">
          {incoming.length > 0 ? `${incoming.length} people already like you` : 'Nobody new has liked you yet'}
        </Link>
      </p>
    </>
  )
}
