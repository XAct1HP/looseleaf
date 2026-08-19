import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ChatBubble from '../components/chat/ChatBubble'
import DateNudge from '../components/chat/DateNudge'
import DatePlanner from '../components/chat/DatePlanner'
import ReportSheet from '../components/safety/ReportSheet'
import EmptyState from '../components/common/EmptyState'
import { PersonAvatar } from '../components/brand/Portrait'
import { IconBack, IconMore, IconSend, IconVerified, IconCalendar } from '../components/ui/Icons'
import { IconButton } from '../components/ui/Button'
import { useStore } from '../state/store'
import { personById } from '../data/people'
import { useRail } from '../components/nav/AppLayout'
import RailCard from '../components/common/RailCard'
import { InterestChip } from '../components/ui/Chip'
import { overlapWith } from '../lib/overlap'

const NUDGE_AFTER = 6

export default function Chat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, actions } = useStore()
  const convo = state.conversations[id]
  const person = convo ? personById(convo.personId) : null

  const [text, setText] = useState('')
  const [dateType, setDateType] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const endRef = useRef(null)

  // Read the clock once when the conversation loads rather than on every
  // render, so the header line doesn't tick over mid-scroll.
  const startedAt = convo?.startedAt
  const matchedAgo = useMemo(() => {
    if (!startedAt) return ''
    const hours = Math.round((Date.now() - startedAt) / 3_600_000)
    if (hours < 1) return 'just now'
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
    const days = Math.round(hours / 24)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }, [startedAt])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [convo?.messages.length])

  useRail(
    person ? (
      <>
        <RailCard>
          <Link to={`/app/person/${person.id}`} className="flex items-center gap-3">
            <PersonAvatar id={`${person.id}-0`} size={52} />
            <span className="min-w-0">
              <span className="block truncate font-display text-[17px] font-semibold text-navy">
                {person.firstName}, {person.age}
              </span>
              <span className="block truncate text-[12.5px] text-mist">
                {person.major} ’{person.gradYear}
              </span>
            </span>
          </Link>
          <Link
            to={`/app/person/${person.id}`}
            className="mt-3.5 block rounded-xl border border-rule bg-cream/70 py-2 text-center text-[13px] font-medium text-graphite hover:text-navy"
          >
            See full profile
          </Link>
        </RailCard>

        <RailCard title="You two overlap">
          <ul className="space-y-2 text-[13.5px] text-graphite">
            {overlapWith(person, state.me).lines.map((l) => (
              <li key={l.key}>{l.text}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {overlapWith(person, state.me).sharedInterests.slice(0, 4).map((i) => (
              <InterestChip key={i} id={i} shared />
            ))}
          </div>
        </RailCard>
      </>
    ) : null,
    [id]
  )

  if (!convo || !person) {
    return (
      <div className="px-4 py-10">
        <EmptyState title="That conversation isn’t here." body="It may have been unmatched or blocked." />
      </div>
    )
  }

  const send = (e) => {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    actions.send(convo.id, value)
    setText('')
  }

  const showNudge =
    convo.messages.length >= NUDGE_AFTER && !convo.nudgeDismissed && !convo.datePlan

  const confirmPlan = (plan) => {
    actions.setDatePlan(convo.id, plan)
    actions.send(
      convo.id,
      `${plan.emoji} ${plan.type} — ${plan.when}, ${plan.spot}. Does that work?`
    )
    setDateType(null)
  }

  return (
    <div className="flex h-[100dvh] flex-col md:h-screen">
      {/* header */}
      <header
        className="sticky top-0 z-20 flex items-center gap-3 border-b border-rule bg-paper/95 px-3 py-3 backdrop-blur md:px-6"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}
      >
        <IconButton label="Back" onClick={() => navigate('/app/matches')} tone="plain">
          <IconBack size={20} />
        </IconButton>

        <Link to={`/app/person/${person.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <PersonAvatar id={`${person.id}-0`} size={40} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[16px] font-medium leading-tight text-navy">{person.firstName}</span>
              <IconVerified size={13} className="shrink-0 text-notebook-deep" />
            </span>
            <span className="block truncate text-[12.5px] text-mist">
              {person.major} ’{person.gradYear} · Michigan
            </span>
          </span>
        </Link>

        <div className="relative shrink-0">
          <IconButton label="More" onClick={() => setMenuOpen((v) => !v)}>
            <IconMore size={20} />
          </IconButton>
          {menuOpen && (
            <>
              <button className="fixed inset-0 z-10 cursor-default" aria-hidden="true" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-11 z-20 w-48 animate-pop-in overflow-hidden rounded-2xl border border-rule bg-white py-1 shadow-lift">
                <Link
                  to={`/app/person/${person.id}`}
                  className="block px-4 py-2.5 text-[14px] text-graphite hover:bg-cream"
                  onClick={() => setMenuOpen(false)}
                >
                  See profile
                </Link>
                <button
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-graphite hover:bg-cream"
                  onClick={() => {
                    setMenuOpen(false)
                    setShowReport(true)
                  }}
                >
                  Report
                </button>
                <button
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-coral-deep hover:bg-coral-wash"
                  onClick={() => {
                    setMenuOpen(false)
                    actions.block(person.id)
                    navigate('/app/matches')
                  }}
                >
                  Block {person.firstName}
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto max-w-[620px] space-y-3.5">
          <p className="pb-2 text-center text-[12.5px] text-mist">
            You found each other {matchedAgo}.
          </p>

          {convo.messages.map((m) => (
            <ChatBubble key={m.id} message={m} person={person} />
          ))}

          {convo.datePlan && (
            <div className="!mt-6 rounded-card border border-moss/30 bg-moss-soft px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#3F7454]">
                  <IconCalendar size={19} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#3F7454]">
                    The plan
                  </p>
                  <p className="mt-1 font-display text-[18px] font-semibold leading-tight text-navy">
                    {convo.datePlan.emoji} {convo.datePlan.type} · {convo.datePlan.when}
                  </p>
                  <p className="mt-1 text-[13.5px] text-[#3F7454]">
                    {convo.datePlan.spot} · {convo.datePlan.walk}
                  </p>
                </div>
              </div>
            </div>
          )}

          {showNudge && (
            <div className="!mt-7">
              <DateNudge onPick={setDateType} onDismiss={() => actions.dismissNudge(convo.id)} />
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {/* composer */}
      <form
        onSubmit={send}
        className="sticky bottom-0 border-t border-rule bg-paper/95 px-3 py-3 backdrop-blur md:px-6"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.75rem)' }}
      >
        <div className="mx-auto flex max-w-[620px] items-end gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Message ${person.firstName}`}
            aria-label={`Message ${person.firstName}`}
            className="field !rounded-full !py-3"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            className="press focus-ring flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-coral text-white transition disabled:bg-navy/10 disabled:text-mist"
          >
            <IconSend size={20} />
          </button>
        </div>
      </form>

      <div className="h-[58px] md:hidden" aria-hidden="true" />

      <DatePlanner
        open={!!dateType}
        dateType={dateType}
        person={person}
        onClose={() => setDateType(null)}
        onConfirm={confirmPlan}
      />
      <ReportSheet
        open={showReport}
        person={person}
        onClose={() => setShowReport(false)}
        onReport={(reason) => actions.report(person.id, reason)}
        onBlock={() => {
          actions.block(person.id)
          navigate('/app/matches')
        }}
      />
    </div>
  )
}
