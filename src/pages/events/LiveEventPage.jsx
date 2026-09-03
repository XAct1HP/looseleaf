import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as events from '../../services/liveEvents'
import {
  themeOf,
  clock,
  clockOffset,
  phaseOf,
  readToken,
  saveToken,
  secondsUntil,
} from '../../lib/liveEvent'
import { alertPromise, arm, capability, fire } from '../../lib/roundAlert'
import Logo, { LeafMark } from '../../components/brand/Logo'
import Button from '../../components/ui/Button'
import EventShell from '../../components/events/EventShell'
import JoinForm from '../../components/events/JoinForm'
import VoteCard from '../../components/events/VoteCard'

/**
 * ── One route, one screen at a time ─────────────────────────────────────────
 *
 * `/e/:code`, from the moment somebody's camera opens the poster to the moment
 * they walk out. A state machine rather than a set of pages because at no
 * point should a person in this room have navigation: they are looking at one
 * thing, and the app's job is to make sure it is the right thing.
 *
 * **There is no login.** A name, and a token the server minted, kept in this
 * browser. The QR is taped to a door inside a building on campus, so the set
 * of people who can scan it is already the set of people in the room — an
 * email step was buying a guarantee the room gives us for nothing, and
 * charging forty people a minute each for it.
 *
 * The clock is the rest of the design. Every phone works out the round and the
 * time left from the server's timestamps plus the offset between its clock and
 * the server's, taken from the same response. Never from a countdown started
 * on page load — a phone asleep for ninety seconds would come back two rounds
 * behind and say so with total confidence.
 */

const POLL_MS = 3000

export default function LiveEventPage() {
  const { code } = useParams()
  const upper = String(code || '').toUpperCase()

  const [token, setToken] = useState(() => readToken(upper))
  const [preview, setPreview] = useState(null)
  const [snap, setSnap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [offset, setOffset] = useState(0)

  const refresh = useCallback(async () => {
    if (!events.eventsEnabled) return
    try {
      if (token) {
        const s = await events.state(upper, token)
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
  }, [upper, token])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  const joined = Boolean(snap?.me)

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

  const onJoined = useCallback(
    (newToken) => {
      if (newToken) {
        saveToken(upper, newToken)
        setToken(newToken)
      } else {
        refresh()
      }
    },
    [upper, refresh]
  )

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
  const accent = themeOf(ev)

  //  Straight to the name. No email, no code, no account.
  if (!joined) {
    return (
      <EventShell event={ev}>
        <JoinForm event={preview ?? ev} code={upper} token={token} onJoined={onJoined} />
      </EventShell>
    )
  }

  return <Room snap={snap} accent={accent} offset={offset} onChange={refresh} error={error} token={token} />
}

/* ══ the room ═════════════════════════════════════════════════════════════ */

function Room({ snap, accent, offset, onChange, error, token }) {
  const ev = snap.event
  const round = snap.round
  const phase = phaseOf(round, offset, ev.break_seconds)
  const stations = ev.format === 'stations'

  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  //  A transition has to be felt, not read. The host should not have to shout
  //  "switch!" over a room of forty people.
  //
  //  This used to call `navigator.vibrate?.()` directly, which on an iPhone is
  //  a no-op — Safari has never shipped the Vibration API — while the lobby
  //  cheerfully promised a buzz. `roundAlert` vibrates where it can, chimes
  //  where it cannot, and tells the copy which of those it is.
  const lastPhase = useRef(phase)
  useEffect(() => {
    if (lastPhase.current !== phase) {
      lastPhase.current = phase
      if (phase === 'round' || phase === 'break') fire(phase)
    }
  }, [phase])

  //  Web Audio has to be unlocked from a real gesture, and joining is the one
  //  gesture every attendee makes. This is the belt to that braces: any tap
  //  anywhere in the room re-arms it, so somebody who arrived with the page
  //  already open still gets a sound.
  useEffect(() => {
    const onTap = () => arm()
    window.addEventListener('pointerdown', onTap, { once: true, passive: true })
    return () => window.removeEventListener('pointerdown', onTap)
  }, [])

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
          title={stations ? round.place?.label ?? 'Find your table' : round.bye ? 'Sit this one out' : `Table ${round.station}`}
          sub={`Starts in ${clock(s)}`}
        />
      )
    }

    if (phase === 'round') {
      if (stations) return <Station round={round} accent={accent} offset={offset} />
      if (round.bye) return <Bye round={round} accent={accent} offset={offset} />
      return <Seat round={round} accent={accent} offset={offset} />
    }

    return (
      <Between
        snap={snap}
        accent={accent}
        offset={offset}
        onChange={onChange}
        token={token}
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
      <div className="flex flex-1 flex-col px-5">{body}</div>

      {ev.broadcast && (
        <div className="border-t border-rule bg-white px-5 py-3">
          <p className="text-[13.5px] leading-relaxed text-navy">
            <span className="font-medium">{ev.org_name}:</span> {ev.broadcast}
          </p>
        </div>
      )}

      <RoomFooter />

      {error && (
        <p className="bg-coral-wash px-5 py-2 text-center text-[12.5px] text-coral-deep">
          Reconnecting…
        </p>
      )}
    </div>
  )
}

/**
 * The club's night, on Looseleaf's paper.
 *
 * The first version of this header carried only the event title and the org
 * name, which meant that for the whole hour somebody was holding a screen with
 * no idea whose product they were using — and the entire point of running these
 * is that forty people find out what Looseleaf is. So the mark sits top-left,
 * where a logo goes, and the club's name is the badge beside it. Their night,
 * our paper: both, legibly, on every screen.
 */
function RoomHeader({ snap, accent }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-rule bg-white/70 px-5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <LeafMark size={26} className="shrink-0 text-navy" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium leading-tight text-navy">
            {snap.event.title}
          </p>
          <p className="truncate text-[11.5px] leading-tight text-mist">{snap.event.org_name}</p>
        </div>
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

/** Quiet, permanent, and the reason any of this is worth building. */
function RoomFooter() {
  return (
    <div className="flex items-center justify-center gap-2 border-t border-rule px-5 py-2.5 pb-safe">
      <LeafMark size={15} className="text-mist" />
      <p className="text-[11.5px] text-mist">
        Running on <span className="font-medium text-graphite">Looseleaf</span> — free dating for
        your campus
      </p>
    </div>
  )
}

/**
 * What will actually happen when the round changes, written from a feature
 * test rather than from hope — and a button to prove it.
 *
 * The button is not a gimmick. Somebody is about to put this phone in a pocket
 * and trust it; letting them check takes one tap, and on the phones where the
 * answer is "it won't buzz, it'll chime" it is the difference between hearing
 * the first round start and missing it.
 */
function AlertNote({ accent, stations }) {
  const [tested, setTested] = useState(false)
  const how = capability()

  return (
    <div className="mt-10 w-full max-w-[34ch] rounded-card border border-rule bg-white px-5 py-4">
      <p className="text-[13px] leading-relaxed text-graphite">
        {alertPromise()}
        {stations && ' It’ll tell you which table, and who’s running it.'}
      </p>

      {how !== 'screen' && (
        <button
          type="button"
          onClick={() => {
            arm()
            fire('test')
            setTested(true)
          }}
          className="press focus-ring mt-3 text-[13px] font-medium underline underline-offset-4"
          style={{ color: accent.ink }}
        >
          {tested
            ? how === 'buzz'
              ? 'Feel that? Tap to try again'
              : 'Hear that? Tap to try again'
            : how === 'buzz'
              ? 'Test the buzz'
              : 'Test the sound'}
        </button>
      )}
    </div>
  )
}

function Lobby({ snap, accent }) {
  const stations = snap.event.format === 'stations'
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
      <AlertNote accent={accent} stations={stations} />
    </div>
  )
}

/**
 * Stations format. The table has a name the host typed, and usually a member
 * of the club sitting at it — that name is the single most useful thing on
 * this screen, because it is how somebody knows they are in the right seat.
 *
 * What is deliberately absent: the other people at the table. Sitting near
 * somebody is not consent to appear on their phone, and a list of four names
 * is still a list.
 */
function Station({ round, accent, offset }) {
  const left = secondsUntil(round.ends_at, offset)
  const place = round.place

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
      <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-mist">
        Round {round.index}
      </p>

      <p
        className="mt-3 font-display text-[46px] font-semibold leading-[1.05] tracking-[-0.02em] [text-wrap:balance]"
        style={{ color: accent.ink }}
      >
        {place?.label ?? `Table ${round.station}`}
      </p>

      {place?.host_name && (
        <p className="mt-5 text-[15px] text-graphite">
          with <span className="font-display text-[22px] font-semibold text-navy">{place.host_name}</span>
        </p>
      )}

      {place?.note && (
        <p className="mt-3 max-w-[32ch] text-[14px] leading-relaxed text-graphite">{place.note}</p>
      )}

      {place?.with > 0 && (
        <p className="mt-4 text-[13px] text-mist">
          and {place.with} other{place.with === 1 ? '' : 's'}
        </p>
      )}

      <p className="mt-auto pt-10 font-display text-[26px] font-semibold tabular-nums text-mist">
        {clock(left)}
      </p>
    </div>
  )
}

/** Pairs format. Table number enormous, everything else quiet. */
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

function Between({ snap, accent, offset, onChange, waiting, token }) {
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
          token={token}
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
  const stations = snap.event.format === 'stations'

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      <RoomHeader snap={snap} accent={accent} />
      <div className="flex flex-1 flex-col px-5 py-10">
        <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-mist">That’s it</p>
        <h1 className="mt-3 font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">
          {stations
            ? `You got round ${snap.met} ${snap.met === 1 ? 'table' : 'tables'}.`
            : `You met ${snap.met} ${snap.met === 1 ? 'person' : 'people'} tonight.`}
        </h1>

        {!snap.event.likes_enabled ? (
          <p className="mt-5 text-[15.5px] leading-relaxed text-graphite">
            Thanks for coming. Anything you wrote down is yours to keep.
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

        {/*  The pitch, once, at the only honest moment for it. */}
        <div className="mt-auto pt-12">
          <div className="rounded-card border border-rule bg-cream/60 p-6 text-center">
            <Logo size="md" className="justify-center" />
            <h2 className="mt-5 font-display text-[22px] font-semibold leading-tight [text-wrap:balance]">
              {revealed && matches.length > 0
                ? 'Make a profile to say hi.'
                : 'Free dating for your campus.'}
            </h2>
            <p className="mx-auto mt-2.5 max-w-[34ch] text-[14px] leading-relaxed text-graphite">
              {revealed && matches.length > 0
                ? 'Your matches from tonight are saved on this phone. Build a profile and the conversations open.'
                : 'See who likes you, find your overlap with people from your classes, and make actual plans. Nothing here is for sale.'}
            </p>
            <Button to="/join" variant="coral" size="lg" full className="mt-5">
              {revealed && matches.length > 0 ? 'Build my profile' : 'Have a look'}
            </Button>
          </div>
        </div>
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
        className="mt-3 font-display text-[46px] font-semibold leading-[1.06] tracking-[-0.02em] [text-wrap:balance]"
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
      <Button to="/events" variant="outline" size="lg" className="mt-8">
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
