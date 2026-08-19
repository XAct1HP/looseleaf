import { useState } from 'react'
import SubPageHeader from '../../components/common/SubPageHeader'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import RailCard from '../../components/common/RailCard'
import Portrait, { PersonAvatar } from '../../components/brand/Portrait'
import { useRail } from '../../components/nav/AppLayout'
import { CONNECTIONS, PEOPLE } from '../../data/people'
import { useStore } from '../../state/store'
import { IconPeople, IconCheck, IconPlus } from '../../components/ui/Icons'
import { interestLabel } from '../../data/catalog'

/** Pairs browsing pairs — lower pressure than one-on-one, by design. */
const PAIRS = [
  { id: 'pr-1', a: 'p-emma', b: 'p-chloe', line: 'Looking for two people who’ll actually pick a place' },
  { id: 'pr-2', a: 'p-dev', b: 'p-nate', line: 'We will bring the trivia knowledge, you bring vibes' },
  { id: 'pr-3', a: 'p-maya', b: 'p-grace', line: 'Coffee first, then whatever the afternoon turns into' },
  { id: 'pr-4', a: 'p-omar', b: 'p-eli', line: 'Two English-adjacent guys who need to leave the library' },
]

const person = (id) => PEOPLE.find((p) => p.id === id)

export default function DoubleDate() {
  const { state, actions } = useStore()
  const [picking, setPicking] = useState(false)
  const partner = CONNECTIONS.find((c) => c.id === state.doubleDate.partnerId)

  useRail(
    <RailCard title="Why pairs">
      <p className="text-[13.5px] leading-relaxed text-graphite">
        Meeting someone new is easier with a friend beside you. Pairs match with pairs, and either person can call
        it off at any point without it being weird.
      </p>
    </RailCard>,
    []
  )

  return (
    <>
      <SubPageHeader
        title="Double Date"
        subtitle="Pair up with a friend, then meet another pair. Nobody has to carry the conversation alone."
      />

      <section
        className={`mb-8 rounded-card border px-6 py-6 ${
          partner ? 'border-margin/25 bg-margin-soft' : 'border-rule bg-cream/70'
        }`}
      >
        {partner ? (
          <>
            <div className="flex items-center gap-3">
              <span className="flex -space-x-3">
                <PersonAvatar id={state.me.id} size={46} ring />
                <PersonAvatar id={partner.id} size={46} ring />
              </span>
              <div className="min-w-0">
                <p className="font-display text-[19px] font-semibold leading-tight text-navy">
                  {state.me.firstName} + {partner.firstName}
                </p>
                <p className="mt-0.5 text-[13px] text-[#A93E7F]">Your pair is live on campus</p>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" size="md" onClick={() => setPicking(true)}>
                Change partner
              </Button>
              <Button variant="ghost" size="md" onClick={() => actions.setDoubleDatePartner(null)}>
                Take us down
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-graphite">
              <IconPeople size={21} />
            </span>
            <h2 className="mt-4 font-display text-[20px] font-semibold leading-tight">Grab a friend.</h2>
            <p className="mt-1.5 max-w-[46ch] text-[14px] leading-relaxed text-graphite">
              Invite someone you already know on Looseleaf. Once you both say yes, you show up as a pair.
            </p>
            <Button variant="coral" size="md" className="mt-5" onClick={() => setPicking(true)}>
              <IconPlus size={17} />
              Invite a friend
            </Button>
          </>
        )}
      </section>

      <h2 className="mb-4 font-display text-[20px] font-semibold">Pairs looking for pairs</h2>

      <ul className="grid gap-4 sm:grid-cols-2">
        {PAIRS.map((pair) => {
          const a = person(pair.a)
          const b = person(pair.b)
          if (!a || !b) return null
          const shared = a.interests.filter((i) => state.me.interests.includes(i)).slice(0, 2)
          return (
            <li key={pair.id} className="lift-corner overflow-hidden rounded-card border border-rule bg-white">
              <div className="flex">
                {[a, b].map((p, i) => (
                  <span key={p.id} className={`aspect-[3/4] flex-1 overflow-hidden ${i === 0 ? 'border-r border-white' : ''}`}>
                    <Portrait id={`${p.id}-0`} scene={p.photos?.[0]?.scene ?? 'portrait'} rounded="rounded-none" />
                  </span>
                ))}
              </div>
              <div className="px-5 py-4">
                <p className="font-display text-[18px] font-semibold leading-tight">
                  {a.firstName} + {b.firstName}
                </p>
                <p className="mt-1 text-[12.5px] text-mist">
                  {a.major} · {b.major}
                </p>
                <p className="mt-2.5 text-[14px] leading-relaxed text-graphite">{pair.line}</p>
                {shared.length > 0 && (
                  <p className="mt-2.5 text-[12.5px] text-mist">
                    You and {a.firstName} both like {shared.map(interestLabel).join(' and ')}
                  </p>
                )}
                <Button variant="outline" size="sm" full className="mt-4" disabled={!partner}>
                  {partner ? 'Say hi as a pair' : 'Pair up first'}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      <Sheet
        open={picking}
        onClose={() => setPicking(false)}
        title="Who are you bringing?"
        subtitle="Only people you’ve connected with show up here."
      >
        <ul className="space-y-2">
          {CONNECTIONS.map((c) => {
            const chosen = state.doubleDate.partnerId === c.id
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    actions.setDoubleDatePartner(c.id)
                    setPicking(false)
                  }}
                  className={`focus-ring flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    chosen ? 'border-coral bg-coral-wash' : 'border-rule bg-white hover:border-navy/20'
                  }`}
                >
                  <PersonAvatar id={c.id} size={42} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-navy">{c.firstName}</span>
                    <span className="block truncate text-[13px] text-mist">{c.major}</span>
                  </span>
                  {chosen && <IconCheck size={17} className="text-coral" />}
                </button>
              </li>
            )
          })}
        </ul>
      </Sheet>
    </>
  )
}
