import PageHeader from '../components/common/PageHeader'
import EmptyState from '../components/common/EmptyState'
import IncomingLikeCard from '../components/likes/IncomingLikeCard'
import RailCard from '../components/common/RailCard'
import Button from '../components/ui/Button'
import { useRail } from '../components/nav/AppLayout'
import { useIncoming, useStore } from '../state/store'
import { HandHeart } from '../components/brand/Doodles'

export default function Likes() {
  const incoming = useIncoming()
  const { state, actions } = useStore()

  useRail(
    <>
      <RailCard title="How this works" tone="coral">
        <p className="text-[13.5px] leading-relaxed text-[#8A3A3E]">
          Everyone who likes you shows up here — all of them, in full, forever free.
        </p>
        <p className="mt-3 text-[13.5px] leading-relaxed text-[#8A3A3E]">
          No blur, no counter, no “upgrade to see who.” That’s the whole point of Looseleaf.
        </p>
      </RailCard>
      <RailCard title="Notes">
        <p className="text-[13.5px] leading-relaxed text-graphite">
          A note is a like with something to say. They’re free too, and there’s no daily limit on them.
        </p>
      </RailCard>
    </>,
    []
  )

  return (
    <>
      <PageHeader
        title="They noticed you."
        subtitle="People who found something they liked."
        action={
          incoming.length > 0 && (
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-coral-soft px-3 py-1.5 text-[12.5px] font-semibold text-coral-deep sm:inline-flex">
              <HandHeart size={13} />
              {incoming.length} waiting
            </span>
          )
        }
      />

      {incoming.length === 0 ? (
        <EmptyState
          art="plane"
          title="Quiet for now."
          body="Someone interesting might find you tomorrow. In the meantime, there are people worth meeting in Discover."
          action={
            <Button to="/app/discover" variant="outline" size="lg">
              Back to Discover
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {incoming.map((like) => (
            <div key={like.id} className="h-full animate-slide-note">
              <IncomingLikeCard
                like={like}
                me={state.me}
                onPass={() => actions.passIncoming(like.id)}
                onLikeBack={() => actions.likeBack(like)}
              />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
