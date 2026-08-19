import { Link } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import ProfileCard from '../components/profile/ProfileCard'
import EmptyState from '../components/common/EmptyState'
import Button from '../components/ui/Button'
import CampusRail from '../components/common/CampusRail'
import { useRail } from '../components/nav/AppLayout'
import { useDeck, useIncoming, useStore } from '../state/store'
import { IconChevron } from '../components/ui/Icons'

const DAILY = 20

export default function Discover() {
  const deck = useDeck()
  const incoming = useIncoming()
  const { state, actions } = useStore()

  useRail(<CampusRail />, [state.tonight.active])

  const person = deck[0]
  const seenToday = Math.min(state.seen.length, DAILY)

  if (!person) {
    return (
      <>
        <PageHeader
          title="Discover"
          subtitle="People around your campus we think you’ll like."
        />
        <EmptyState
          art="coffee"
          title="That’s everyone for today."
          body="Go live your life. We’ll find some more people tomorrow."
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

        <div className="mt-5 flex items-center justify-center gap-2 text-[13px] text-mist">
          <span>No infinite scroll here. That’s on purpose.</span>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Discover"
        subtitle="People around your campus we think you’ll like."
        action={
          <span className="hidden shrink-0 rounded-full border border-rule bg-white px-3 py-1.5 text-[12.5px] font-medium tabular-nums text-graphite sm:inline-flex">
            {seenToday + 1} of {DAILY} today
          </span>
        }
      />

      <div key={person.id} className="animate-fade-up">
        <ProfileCard
          person={person}
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
