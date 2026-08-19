import { Link } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import EmptyState from '../components/common/EmptyState'
import ConversationItem from '../components/chat/ConversationItem'
import Portrait from '../components/brand/Portrait'
import Button from '../components/ui/Button'
import RailCard from '../components/common/RailCard'
import { useRail } from '../components/nav/AppLayout'
import { useStore } from '../state/store'
import { personById } from '../data/people'

export default function Matches() {
  const { state } = useStore()

  const conversations = Object.values(state.conversations)
    .filter((c) => state.matches.some((m) => m.conversationId === c.id))
    .sort((a, b) => {
      const la = a.messages[a.messages.length - 1]?.at ?? a.startedAt
      const lb = b.messages[b.messages.length - 1]?.at ?? b.startedAt
      return lb - la
    })

  const fresh = state.matches
    .filter((m) => (state.conversations[m.conversationId]?.messages.length ?? 0) === 0)
    .map((m) => ({ match: m, person: personById(m.personId) }))
    .filter((x) => x.person)

  useRail(
    <RailCard title="A gentle reminder">
      <p className="text-[13.5px] leading-relaxed text-graphite">
        Nobody here is waiting on a response clock. Reply when you have something to say — Looseleaf will never
        tell someone you left them on read.
      </p>
    </RailCard>,
    []
  )

  const empty = conversations.length === 0 && fresh.length === 0

  return (
    <>
      <PageHeader title="Matches" subtitle="People who liked each other back." />

      {empty ? (
        <EmptyState
          art="plane"
          title="Nothing here yet."
          body="Good things take a minute. Someone you liked might be looking at your profile right now."
          action={
            <Button to="/app/discover" variant="outline" size="lg">
              Back to Discover
            </Button>
          }
        />
      ) : (
        <div className="space-y-9">
          {fresh.length > 0 && (
            <section>
              <h2 className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
                New connections
              </h2>
              <ul className="hide-scrollbar -mx-4 flex gap-3.5 overflow-x-auto px-4 pb-1 md:-mx-1 md:px-1">
                {fresh.map(({ match, person }) => (
                  <li key={match.id} className="w-[104px] shrink-0">
                    <Link to={`/app/chat/${match.conversationId}`} className="group block">
                      <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl border border-rule bg-cream shadow-paper transition-transform group-hover:-translate-y-0.5">
                        <Portrait
                          id={`${person.id}-0`}
                          scene={person.photos?.[0]?.scene ?? 'portrait'}
                          rounded="rounded-2xl"
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/60 to-transparent px-2 pb-2 pt-6 text-[12.5px] font-medium text-white">
                          {person.firstName}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {conversations.length > 0 && (
            <section>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
                Conversations
              </h2>
              <ul className="-mx-3">
                {conversations
                  .filter((c) => c.messages.length > 0)
                  .map((c) => {
                    const person = personById(c.personId)
                    if (!person) return null
                    return (
                      <li key={c.id}>
                        <ConversationItem conversation={c} person={person} />
                      </li>
                    )
                  })}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  )
}
