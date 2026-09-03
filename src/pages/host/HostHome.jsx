import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import HostShell, { StatusPill } from './HostShell'
import Button from '../../components/ui/Button'
import EventGate from '../../components/events/EventGate'
import * as events from '../../services/liveEvents'
import { useStore } from '../../state/store'
import { Underline } from '../../components/brand/Doodles'

/**
 * ── /host ───────────────────────────────────────────────────────────────────
 *
 * Four states in one page, because they are four steps of the same walk:
 * signed out → not registered as a host → registered and waiting on us →
 * running events.
 */
export default function HostHome() {
  const { state } = useStore()
  const [host, setHost] = useState(undefined) // undefined = still asking
  const [list, setList] = useState([])
  const [error, setError] = useState(null)

  const signedIn = state.session.authed

  useEffect(() => {
    if (!signedIn || !events.eventsEnabled) {
      setHost(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const h = await events.myHost()
        if (cancelled) return
        setHost(h)
        if (h) setList(await events.myEvents())
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn])

  if (!events.eventsEnabled) {
    return (
      <HostShell title="Hosting needs a configured Looseleaf.">
        <p className="text-[15px] leading-relaxed text-graphite">
          This build is running on demo data. An event puts real people in a real room, so there is
          nothing honest to show here.
        </p>
      </HostShell>
    )
  }

  if (!signedIn) return <SignIn />
  if (host === undefined) return <HostShell title="One moment…" />
  if (!host) return <Register onDone={setHost} />

  return (
    <HostShell
      title={host.orgName}
      subtitle="Every event you’ve set up. Anything you print stays valid — the code on the poster doesn’t change."
      action={
        <Button to="/host/new" variant="coral" size="md">
          New event
        </Button>
      }
      wide
    >
      {host.status === 'pending' && (
        <Note>
          We’ll look over your first event before it goes out. It usually takes an hour or two —
          you can build it now.
        </Note>
      )}
      {host.status === 'suspended' && (
        <Note tone="coral">
          This host account is on hold. {host.reviewNote || 'Email us and we’ll sort it out.'}
        </Note>
      )}

      {error && <Note tone="coral">{error}</Note>}

      {list.length === 0 ? (
        <div className="mt-8 rounded-card border border-dashed border-rule bg-white p-8 text-center">
          <h2 className="font-display text-[22px] font-semibold">Nothing yet.</h2>
          <p className="mx-auto mt-3 max-w-[40ch] text-[14.5px] leading-relaxed text-graphite">
            An event takes about three minutes to set up: a name, how long the rounds are, and
            whatever you want to ask people at the door.
          </p>
          <Button to="/host/new" variant="coral" size="lg" className="mt-6">
            Set one up
          </Button>
        </div>
      ) : (
        <ul className="mt-2 space-y-3">
          {list.map((e) => (
            <li key={e.id}>
              <Link
                to={`/host/${e.id}`}
                className="lift-corner card flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-[19px] font-semibold leading-tight">
                    {e.title}
                  </p>
                  <p className="mt-1 text-[13px] text-mist">
                    {e.venue ? `${e.venue} · ` : ''}
                    {e.startsAt ? new Date(e.startsAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    }) : 'No date yet'}
                  </p>
                  {/*  The two numbers that predict how the night goes. A wide
                       gap between them a day before means the link hasn't
                       been shared; a wide gap on the night means a queue. */}
                  {e.registered > 0 && (
                    <p className="mt-1.5 text-[13px] text-graphite">
                      {e.registered} registered · {e.checkedIn} checked in
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <code className="hidden font-display text-[17px] font-semibold tracking-[0.14em] text-mist sm:inline">
                    {e.code}
                  </code>
                  <StatusPill status={e.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HostShell>
  )
}

/**
 * Signing in as a host.
 *
 * Centred — the content, not the wordmark. The bar keeps its logo on the left
 * where a logo goes; it is the column underneath that used to sit hard against
 * the left edge of a wide page with nothing beside it, which reads as a layout
 * that gave up rather than a deliberately narrow one.
 *
 * Note this is the one place in live events that still asks for an email, and
 * it should be: a host is a person we will approve, whose club's name goes on
 * a poster, and who we may need to reach. An attendee is not.
 */
function SignIn() {
  return (
    <HostShell narrow>
      <div className="py-6 text-center">
        <h1 className="relative inline-block font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">
          Run a live event.
          <Underline className="absolute -bottom-1 left-0 text-coral/60" width={240} />
        </h1>
        <p className="mx-auto mt-6 max-w-[40ch] text-[15.5px] leading-relaxed text-graphite">
          Speed dating for your club, fraternity, dorm or society. We handle the rotation, the
          timer and who sits where; you handle the room. It’s free.
        </p>

        <div className="mt-9 text-left">
          <EventGate event={null} />
        </div>

        <p className="mt-8 text-[12.5px] leading-relaxed text-mist">
          Only you need an account. The people who turn up just type a name.
        </p>
      </div>
    </HostShell>
  )
}

function Register({ onDone }) {
  const [fullName, setFullName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await events.registerHost({ fullName: fullName.trim(), orgName: orgName.trim() })
      onDone(await events.myHost())
      navigate('/host/new')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <HostShell
      title="Who’s running this?"
      subtitle="Two things, and then you can build your first event."
      narrow
    >
      <form onSubmit={submit}>
        <label htmlFor="host-name" className="label">
          Your name
        </label>
        <input
          id="host-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          maxLength={80}
          autoFocus
          className="field"
        />

        <label htmlFor="host-org" className="label mt-6">
          Club, fraternity or group
        </label>
        <input
          id="host-org"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          maxLength={120}
          placeholder="Michigan Marketing Club"
          className="field"
        />
        <p className="mt-2 text-[12.5px] text-mist">
          This goes on the poster and on everyone’s phone during the event.
        </p>

        {error && (
          <p className="mt-5 rounded-xl bg-coral-wash px-3.5 py-2.5 text-[13.5px] text-coral-deep">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="coral"
          size="lg"
          full
          className="mt-7"
          disabled={busy || !fullName.trim() || orgName.trim().length < 2}
        >
          {busy ? 'Saving…' : 'Continue'}
        </Button>
      </form>
    </HostShell>
  )
}

function Note({ children, tone = 'cream' }) {
  const tones = {
    cream: 'border-[#F2E6D6] bg-cream/70 text-graphite',
    coral: 'border-coral/30 bg-coral-wash text-coral-deep',
  }
  return (
    <div className={`mb-6 rounded-card border px-4 py-3.5 text-[14px] leading-relaxed ${tones[tone]}`}>
      {children}
    </div>
  )
}
