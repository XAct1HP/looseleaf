import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as events from '../../services/liveEvents'
import { useStore } from '../../state/store'
import { accentOf, clock, clockOffset, phaseOf, secondsUntil } from '../../lib/liveEvent'
import Logo from '../../components/brand/Logo'
import Button from '../../components/ui/Button'
import EventShell from '../../components/events/EventShell'
import EventGate from '../../components/events/EventGate'
import JoinForm from '../../components/events/JoinForm'
import VoteCard from '../../components/events/VoteCard'

/**
 * ── One route, one screen at a time ─────────────────────────────────────────
 *
 * `/e/:code`, from the moment somebody's camera opens the poster to the moment
 * they walk out. It is a state machine rather than a set of pages because at
 * no point should a person in this room have navigation: they are looking at
 * one thing, and the app's job is to make sure it is the right thing.
 *
 * The clock is the whole design. Every phone works out the round and the time
 * left from the server's timestamps plus the offset between its clock and the
 * server's, taken from the same response. Never from a countdown started on
 * page load — a phone that was asleep for ninety seconds would come back two
 * rounds behind and say so with total confidence.
 *
 * Realtime is layered on top and is not load-bearing. Forty phones on a
 * basement network is exactly where a push-only design fails silently, so the
 * poll is the floor and the socket only removes the lag.
 */

const POLL_MS = 3000

export default function LiveEventPage() {
  const { code } = useParams()
  const { state: store } = useStore()
  const signedIn = store.session.authed

  const [preview, setPreview] = useState(null)
  const [snap, setSnap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  //  State, not a ref: this is read during render to work out the clock, and
  //  a ref that changes without a render is a countdown that silently lies.
  const [offset, setOffset] = useState(0)

  const upper = String(code || '').toUpperCase()

  const refresh = useCallback(async () => {
    if (!events.eventsEnabled) return
    try {
      if (signedIn) {
        const s = await events.state(upper)
        setOffset(clockOffset(s?.now))
        setSnap(s)
        if (s?.event) setPreview((p) => p ?? s.event)
      } else {
        setPreview(await events.preview(upper))
      }
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [upper, signedIn])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  const joined = Boolean(snap?.me)

  //  Poll only while there is a room to be in. A page sitting on the join
  //  form does not need to ask the server anything three times a second.
  useEffect(() => {
    if (!joined) return undefined
    const t = setInterval(refresh, POLL_MS)
    return () => clearInterval(t)
  }, [joined, refresh])

  useEffect(() => {
    const id = snap?.event?.id
    if (!id || !joined) return undefined
    return events.subscribe(id, refresh)
  }, [snap?.event?.id, joined, refresh])

  if (!events.eventsEnabled) return <Offline />
  if (loading) return <Loading />

  if (!preview && !snap) {
    return (
      <Problem
        title="No event with that code."
        body="Check the six characters on the poster — or the event may have finished."
      />
    )
  }

  const ev = snap?.event ?? preview
  const accent = accentOf(ev?.accent)

  //  Signed out: the poster, and a way in. This is the pre-registration
  //  surface as much as the door — somebody tapping the link from a group
  //  chat on Tuesday lands here.
  if (!signedIn) {
    return (
      <EventShell event={ev}>
        <EventGate event={preview} />
      </EventShell>
    )
  }

  if (!joined) {
    return (
      <EventShell event={ev}>
        <JoinForm event={preview ?? ev} code={upper} onJoined={refresh} />
      </EventShell>
    )
  }

  return (
    <Room
      snap={snap}
      accent={accent}
      offset={offset}
      onChange={refresh}
      error={error}
    />
  )
}

/* ══ the room ═════════════════════════════════════════════════════════════ */

function Room({ snap, accent, offset, onChange, error }) {
  const ev = snap.event
  const round = snap.round
  const phase = phaseOf(round, offset, ev.break_seconds)

  //  A local tick so the countdown moves every second without asking the
  //  server every second. The *value* still comes from the server's
  //  timestamps; this only re-renders.
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  //  A transition has to be felt, not read. The host should not have to shout
  //  "switch!" over a room of forty people, so the phone buzzes and the whole
  //  screen changes colour at the same instant.
  const lastPhase = useRef(phase)
  useEffect(() => {
    if (lastPhase.current !== phase) {
      lastPhase.current = phase
      if (phase === 'round' || phase === 'break') {
        try {
          navigator.vibrate?.(phase === 'round' ? [90, 60, 90] : 200)
        } catch {
          /* a browser that won't buzz is not a problem worth reporting */
        }
      }
    }
  }, [phase])

  if (ev.status === 'ended' || ev.status === 'killed') {
    return <Ended snap={snap} accent={accent} />
  }

  const body = (() => {
    if (ev.status === 'paused') {
      return <Big accent={accent} kicker="Hold on" title="Paused" sub="The host will start it again in a moment." />
    }
    if (!round || ev.status === 'approved') return <Lobby snap={snap} accent={accent} />

    if (phase === 'starting') {
      const s = secondsUntil(round.starts_at, offset)
      return (
        <Big
          accent={accent}
          kicker={`Round ${round.index}`}
          title={round.bye ? 'Sit this one out' : `Table ${round.station}`}
          sub={`Starts in ${clock(s)}`}
        />
      )
    }

    if (phase === 'round') {
      if (round.bye) return <Bye round={round} accent={accent} offset={offset} />
      return <Seat round={round} accent={accent} offset={offset} />
    }

    // 'break' and 'between' are the same screen: time is up, and the vote
    // card — if this event has one — is the thing to do with the next thirty
    // seconds.
    return (
      <Between
        snap={snap}
        accent={accent}
        offset={offset}
        onChange={onChange}
        waiting={phase === 'between'}
      />
    )
  })()

  return (
    <div
      className="flex min-h-[100dvh] flex-col"
      style={{ background: phase === 'break' ? accent.wash : '#FFFDF8' }}
    >
      <RoomHeader snap={snap} accent={accent} />
      <div className="flex flex-1 flex-col px-5 pb-safe">{body}</div>
      {ev.broadcast && (
        <div className="border-t border-rule bg-white px-5 py-3">
          <p className="text-[13.5px] leading-relaxed text-navy">
            <span className="font-medium">{ev.org_name}:</span> {ev.broadcast}
          </p>
        </div>
      )}
      {error && (
        <p className="bg-coral-wash px-5 py-2 text-center text-[12.5px] text-coral-deep">
          Reconnecting…
        </p>
      )}
    </div>
  )
}

function RoomHeader({ snap, accent }) {
  return (
    <div className="flex items-center justify-between border-b border-rule px-5 py-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-navy">{snap.event.title}</p>
        <p className="text-[11.5px] text-mist">{snap.event.org_name}</p>
      </div>
      <span
        className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
        style={{ background: accent.wash, color: accent.ink }}
      >
        No. {snap.me.badge_no}
      </span>
    </div>
  )
}

/**
 * The lobby is not a loading state. It is where somebody sits for ten minutes
 * before the first round, and if it says nothing they assume it's broken —
 * so it says what is happening, who is here, and what this is.
 */
function Lobby({ snap, accent }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <span
        className="rounded-full px-3 py-1 text-[12.5px] font-medium"
        style={{ background: accent.wash, color: accent.ink }}
      >
        You’re in
      </span>
      <h1 className="mt-5 font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">
        {snap.event.welcome_line || `Hi ${snap.me.name}.`}
      </h1>
      <p className="mt-4 max-w-[30ch] text-[15.5px] leading-relaxed text-graphite">
        {snap.here} {snap.here === 1 ? 'person is' : 'people are'} here. {snap.event.org_name} starts
        it when everyone’s settled.
      </p>
      <div className="mt-10 rounded-card border border-rule bg-white px-5 py-4">
        <p className="text-[13px] leading-relaxed text-graphite">
          Your phone will buzz and tell you which table to go to. Keep it where you can feel it.
        </p>
      </div>
      <p className="mt-auto pt-10 text-[12.5px] text-mist">
        Looseleaf — a free dating app for your campus.
      </p>
    </div>
  )
}

/** The one screen that matters. Table number enormous, everything else quiet. */
function Seat({ round, accent, offset }) {
  const left = secondsUntil(round.ends_at, offset)
  const p = round.partner

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
      <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-mist">
        Round {round.index}
      </p>

      <p
        className="mt-2 font-display text-[76px] font-semibold leading-none tracking-[-0.03em]"
        style={{ color: accent.ink }}
      >
        Table {round.station}
      </p>

      {p && (
        <>
          <p className="mt-8 font-display text-[30px] font-semibold leading-tight">{p.name}</p>
          {p.shown?.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {p.shown.map((f) => (
                <span
                  key={f.label}
                  className="rounded-full border border-rule bg-white px-3 py-1 text-[13px] text-graphite"
                >
                  {f.value}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {/* Deliberately the smallest thing on the screen. You are supposed to be
          looking at a person, not at a countdown. */}
      <p className="mt-auto pt-10 font-display text-[26px] font-semibold tabular-nums text-mist">
        {clock(left)}
      </p>
    </div>
  )
}

/**
 * A bye handled well is a non-event; a bye handled badly is the thing somebody
 * remembers about the night. So it gets a real screen that says what to do and
 * exactly when they're back in.
 */
function Bye({ round, accent, offset }) {
  const left = secondsUntil(round.ends_at, offset)
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-mist">
        Round {round.index}
      </p>
      <h1
        className="mt-3 font-display text-[40px] font-semibold leading-tight tracking-[-0.02em]"
        style={{ color: accent.ink }}
      >
        Sit this one out.
      </h1>
      <p className="mt-4 max-w-[28ch] text-[15.5px] leading-relaxed text-graphite">
        Grab a drink. Everybody gets one of these — you’re back in for the next round.
      </p>
      <p className="mt-auto pt-10 font-display text-[26px] font-semibold tabular-nums text-mist">
        {clock(left)}
      </p>
    </div>
  )
}

function Between({ snap, accent, offset, onChange, waiting }) {
  const pending = snap.pending_vote
  const round = snap.round
  const nextIn = waiting
    ? null
    : secondsUntil(
        new Date(
          new Date(round.ends_at).getTime() + snap.event.break_seconds * 1000
        ).toISOString(),
        offset
      )

  return (
    <div className="flex flex-1 flex-col py-8">
      <div className="text-center">
        <h1
          className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]"
          style={{ color: accent.ink }}
        >
          Time.
        </h1>
        <p className="mt-2 text-[14.5px] text-graphite">
          {waiting ? 'Waiting for the next round…' : `Next round in ${clock(nextIn ?? 0)}`}
        </p>
      </div>

      {pending ? (
        <VoteCard
          key={pending.pairing_id}
          pending={pending}
          accent={accent}
          notesEnabled={snap.event.notes_enabled}
          onDone={onChange}
        />
      ) : (
        <div className="mt-10 text-center text-[14px] text-mist">
          {snap.event.likes_enabled ? 'All caught up.' : 'Stretch your legs.'}
        </div>
      )}
    </div>
  )
}

/**
 * The way out, and the only place in the whole flow that asks for anything.
 *
 * Two people who both said yes have a match and no way to talk — a
 * conversation hangs off a profile and neither of them has one. That is a real
 * obstacle, not a manufactured one, which is why it is fair to say so here and
 * why this is the moment somebody actually wants an account.
 */
function Ended({ snap, accent }) {
  const matches = snap.matches ?? []
  const revealed = snap.event.revealed
  const needsProfile = matches.some((m) => !m.both_members)

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      <RoomHeader snap={snap} accent={accent} />
      <div className="flex flex-1 flex-col px-5 py-10">
        <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-mist">That’s it</p>
        <h1 className="mt-3 font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">
          You met {snap.met} {snap.met === 1 ? 'person' : 'people'} tonight.
        </h1>

        {!snap.event.likes_enabled ? (
          <p className="mt-5 text-[15.5px] leading-relaxed text-graphite">
            Thanks for coming. {snap.event.org_name} has your night’s notes if you wrote any.
          </p>
        ) : !revealed ? (
          <p className="mt-5 text-[15.5px] leading-relaxed text-graphite">
            {snap.event.org_name} will reveal the matches in a moment. Keep this open.
          </p>
        ) : matches.length === 0 ? (
          <p className="mt-5 text-[15.5px] leading-relaxed text-graphite">
            No matches this time. That happens to almost everyone at least once, and it says
            nothing much about the night.
          </p>
        ) : (
          <>
            <p className="mt-5 text-[15.5px] leading-relaxed text-graphite">
              {matches.length} {matches.length === 1 ? 'person' : 'people'} said yes back.
            </p>
            <ul className="mt-5 space-y-2.5">
              {matches.map((m, i) => (
                <li
                  key={`${m.name}-${i}`}
                  className="flex items-center justify-between rounded-card border border-rule bg-white px-4 py-3.5"
                >
                  <span className="font-display text-[19px] font-semibold">{m.name}</span>
                  {m.match_id ? (
                    <Link
                      to="/app/matches"
                      className="text-[13.5px] font-medium underline underline-offset-4"
                      style={{ color: accent.ink }}
                    >
                      Say hi
                    </Link>
                  ) : (
                    <span className="text-[12.5px] text-mist">Waiting on a profile</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {(needsProfile || !snap.me.has_profile) && revealed && matches.length > 0 && (
          <div className="mt-8 rounded-card border border-rule bg-cream/60 p-5">
            <h2 className="font-display text-[21px] font-semibold leading-tight">
              {snap.me.has_profile
                ? 'They need a profile to reply.'
                : 'Finish your profile to say hi.'}
            </h2>
            <p className="mt-2.5 text-[14px] leading-relaxed text-graphite">
              {snap.me.has_profile
                ? 'We’ll open the conversation the moment they make one — nothing else for you to do.'
                : 'You’re already signed in. Six questions and the conversation opens.'}
            </p>
            {!snap.me.has_profile && (
              <Button to="/onboarding" variant="coral" size="lg" full className="mt-5">
                Build my profile
              </Button>
            )}
          </div>
        )}

        {!snap.me.has_profile && (!revealed || matches.length === 0) && (
          <div className="mt-auto pt-12">
            <p className="text-[14px] leading-relaxed text-graphite">
              Looseleaf is a free dating app for your campus. You’re already signed in — a profile
              takes about a minute.
            </p>
            <Button to="/onboarding" variant="outline" size="lg" full className="mt-4">
              Have a look
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ══ small screens ════════════════════════════════════════════════════════ */

function Big({ accent, kicker, title, sub }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-mist">{kicker}</p>
      <h1
        className="mt-3 font-display text-[46px] font-semibold leading-tight tracking-[-0.02em]"
        style={{ color: accent.ink }}
      >
        {title}
      </h1>
      <p className="mt-4 text-[15.5px] text-graphite">{sub}</p>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-paper">
      <div className="animate-pulse">
        <Logo size="lg" />
      </div>
    </div>
  )
}

function Problem({ title, body }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-paper px-6 text-center">
      <Logo />
      <h1 className="mt-8 font-display text-[28px] font-semibold leading-tight">{title}</h1>
      <p className="mt-3 max-w-[32ch] text-[15px] leading-relaxed text-graphite">{body}</p>
      <Button to="/e" variant="outline" size="lg" className="mt-8">
        Try another code
      </Button>
    </div>
  )
}

function Offline() {
  return (
    <Problem
      title="Live events need a configured Looseleaf."
      body="This build is running on demo data, and an event puts real people in a real room — so there is nothing honest to show here."
    />
  )
}
