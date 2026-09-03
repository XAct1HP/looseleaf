import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import HostShell, { StatusPill } from './HostShell'
import Button from '../../components/ui/Button'
import * as events from '../../services/liveEvents'
import {
  themeOf,
  clock,
  clockOffset,
  planSentence,
  schedulePlan,
  secondsUntil,
} from '../../lib/liveEvent'

/**
 * ── The console, during ─────────────────────────────────────────────────────
 *
 * Designed for somebody standing up, holding a laptop, in a loud room, being
 * asked questions. So: three enormous buttons, one clock big enough to
 * project, and the two numbers that actually matter — how many people are here
 * and what round it is.
 *
 * What is deliberately absent is as important as what's here. There is no
 * list of who liked whom, and there is no way to get one. A host learning that
 * Priya said yes to Devon is the failure that would end this feature, so
 * `host_event_summary()` returns counts and structurally cannot return more.
 * Same for email addresses: clubs will ask, and the answer is no.
 */
export default function RunConsole() {
  const { id } = useParams()

  const [data, setData] = useState(null)
  const [roster, setRoster] = useState([])
  const [summary, setSummary] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [d, r, s] = await Promise.all([
        events.getEvent(id),
        events.roster(id),
        events.summary(id),
      ])
      setData(d)
      setRoster(r)
      setSummary(s)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const t = setInterval(refresh, 4000)
    return () => clearInterval(t)
  }, [refresh])

  // A local tick so the clock moves smoothly between polls.
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  if (!data) return <HostShell title="One moment…" back={`/host/${id}`} />

  const ev = data.event
  const accent = themeOf(ev)
  const here = Number(summary.here ?? 0)
  const registered = Number(summary.registered ?? 0)
  const rounds = Number(summary.rounds ?? 0)

  const act = async (fn) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await fn()
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const stations = Number(summary.stations ?? 0)
  const isStations = ev.format === 'stations'

  const plan = schedulePlan({
    people: here,
    roundSeconds: ev.round_seconds,
    breakSeconds: ev.break_seconds,
    plannedRounds: ev.planned_rounds,
    format: ev.format,
    stations,
  })

  return (
    <HostShell
      title={ev.title}
      back={`/host/${id}`}
      wide
      action={
        <div className="flex items-center gap-3">
          <StatusPill status={ev.status} />
          <code className="font-display text-[19px] font-semibold tracking-[0.16em] text-mist">
            {ev.code}
          </code>
        </div>
      }
    >
      {error && (
        <p className="mb-6 rounded-xl bg-coral-wash px-3.5 py-2.5 text-[13.5px] text-coral-deep">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {/* ── the big board ── */}
          <div
            className="rounded-card border border-rule p-6 text-center sm:p-10"
            style={{ background: accent.wash }}
          >
            {ev.status === 'approved' ? (
              <>
                <p className="font-display text-[52px] font-semibold leading-none" style={{ color: accent.ink }}>
                  {here}
                </p>
                <p className="mt-2 text-[15px] text-graphite">
                  {here === 1 ? 'person is' : 'people are'} here
                  {registered > here && ` · ${registered} registered`}
                </p>
                <p className="mx-auto mt-6 max-w-[40ch] text-[14px] leading-relaxed text-graphite">
                  {planSentence(plan, here, ev.format)}
                </p>
              </>
            ) : (
              <RunClock ev={ev} rounds={rounds} accent={accent} />
            )}
          </div>

          {/* ── controls ── */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {ev.status === 'approved' && (
              <Button
                variant="coral"
                size="lg"
                className="sm:col-span-2"
                style={{ background: accent.plate }}
                disabled={busy || here < (isStations ? 1 : 2)}
                onClick={() => act(() => events.start(id))}
              >
                {here < (isStations ? 1 : 2)
                  ? 'Waiting for somebody to arrive'
                  : `Start · ${here} here`}
              </Button>
            )}

            {ev.status === 'running' && (
              <>
                <Button
                  variant="coral"
                  size="lg"
                  style={{ background: accent.plate }}
                  disabled={busy}
                  onClick={() => act(() => events.nextRound(id))}
                >
                  Next round now
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  disabled={busy}
                  onClick={() => act(() => events.setPaused(id, true))}
                >
                  Pause
                </Button>
              </>
            )}

            {ev.status === 'paused' && (
              <Button
                variant="coral"
                size="lg"
                className="sm:col-span-2"
                style={{ background: accent.plate }}
                disabled={busy}
                onClick={() => act(() => events.setPaused(id, false))}
              >
                Carry on
              </Button>
            )}

            {['running', 'paused'].includes(ev.status) && (
              <Button
                variant="danger"
                size="lg"
                className="sm:col-span-2"
                disabled={busy}
                onClick={() => act(() => events.endEvent(id))}
              >
                End the event
              </Button>
            )}

            {ev.status === 'ended' && ev.likes_enabled && ev.reveal !== 'never' && (
              <Button
                variant="coral"
                size="lg"
                className="sm:col-span-2"
                style={{ background: accent.plate }}
                disabled={busy || Boolean(ev.matches_revealed_at)}
                onClick={() => act(() => events.revealMatches(id))}
              >
                {ev.matches_revealed_at ? 'Matches revealed' : 'Reveal the matches'}
              </Button>
            )}
          </div>

          <Broadcast id={id} current={ev.broadcast} onSent={refresh} accent={accent} />

          {/* ── the recap ── */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile n={summary.here} label="here now" />
            <Tile n={summary.rounds} label="rounds" />
            {isStations ? (
              <>
                <Tile n={summary.stations} label="tables" />
                <Tile n={summary.seatings} label="seats filled" />
              </>
            ) : (
              <>
                <Tile n={summary.conversations} label="conversations" />
                {ev.likes_enabled ? (
                  <Tile n={summary.matches} label="matches" />
                ) : (
                  <Tile n={summary.registered} label="registered" />
                )}
              </>
            )}
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-mist">
            Counts only. We never show you who said yes to whom, or anyone’s email address — not
            here, not in an export.
          </p>
        </div>

        {/* ── the room ── */}
        <div>
          <h2 className="font-display text-[19px] font-semibold">In the room</h2>
          <p className="mt-1 text-[13px] text-mist">
            Someone still stuck on their sign-in code will appear here as soon as they’re through.
          </p>
          <ul className="mt-4 space-y-1.5">
            {roster.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-white px-3.5 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="w-6 shrink-0 text-[12.5px] tabular-nums text-mist">
                    {p.badge_no}
                  </span>
                  <span className="truncate text-[14.5px] text-navy">{p.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  {/*  The table by name, not by number: a host looking for
                       somebody scans for "How to pitch", not for "3". */}
                  {isStations
                    ? p.place && (
                        <span className="max-w-[9rem] truncate text-[12.5px] text-graphite">
                          {p.place}
                        </span>
                      )
                    : p.station && (
                        <span className="text-[12.5px] text-graphite">T{p.station}</span>
                      )}
                  {!isStations && p.byes > 0 && (
                    <span className="text-[12px] text-mist">{p.byes} bye</span>
                  )}
                  {['waiting', 'active'].includes(p.state) ? (
                    <button
                      type="button"
                      onClick={() => act(() => events.removeParticipant(id, p.id))}
                      className="press focus-ring rounded-full px-2 py-1 text-[12px] font-medium text-mist hover:text-coral-deep"
                    >
                      Remove
                    </button>
                  ) : (
                    <span className="text-[12px] text-mist">
                      {p.state === 'left' ? 'left' : 'removed'}
                    </span>
                  )}
                </div>
              </li>
            ))}
            {roster.length === 0 && (
              <li className="rounded-xl border border-dashed border-rule px-4 py-6 text-center text-[13.5px] text-mist">
                Nobody yet. Put the poster where people walk in.
              </li>
            )}
          </ul>
        </div>
      </div>
    </HostShell>
  )
}

function RunClock({ ev, rounds, accent }) {
  const [round, setRound] = useState(null)
  const [offset, setOffset] = useState(0)

  //  The console reads the same clock everybody else does, through the same
  //  endpoint, so the number on the projector and the number in forty pockets
  //  cannot drift apart.
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const s = await events.state(ev.code)
        if (cancelled) return
        setOffset(clockOffset(s?.now))
        setRound(s?.round ?? null)
      } catch {
        /* the poll above already surfaces a real failure */
      }
    }
    tick()
    const t = setInterval(tick, 4000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [ev.code])

  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const left = round ? secondsUntil(round.ends_at, offset) : 0

  return (
    <>
      <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-mist">
        Round {round?.index ?? rounds}
        {ev.planned_rounds ? ` of ${ev.planned_rounds}` : ''}
      </p>
      <p
        className="mt-3 font-display text-[86px] font-semibold leading-none tabular-nums"
        style={{ color: accent.ink }}
      >
        {clock(left)}
      </p>
      <p className="mt-3 text-[14.5px] text-graphite">
        {left === 0 ? 'Between rounds' : 'Everyone is talking'}
      </p>
    </>
  )
}

/**
 * The one channel a host has to the room — and the reason they don't need the
 * email list they were going to ask for.
 */
function Broadcast({ id, current, onSent, accent }) {
  const [text, setText] = useState(current ?? '')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    try {
      await events.broadcast(id, text)
      await onSent()
    } catch {
      /* shown by the parent's next poll */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6">
      <label htmlFor="bcast" className="label">
        Say something to the room
      </label>
      <div className="flex gap-2">
        <input
          id="bcast"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={280}
          placeholder="Pizza’s here — grab a slice between rounds."
          className="field"
        />
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={send}
          disabled={busy}
          style={{ background: accent.plate }}
        >
          Send
        </Button>
      </div>
    </div>
  )
}

function Tile({ n, label }) {
  return (
    <div className="rounded-card border border-rule bg-white px-4 py-3.5">
      <p className="font-display text-[26px] font-semibold leading-none tabular-nums">{n ?? 0}</p>
      <p className="mt-1.5 text-[12.5px] text-mist">{label}</p>
    </div>
  )
}
