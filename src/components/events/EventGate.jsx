import { useRef, useState } from 'react'
import Button from '../ui/Button'
import { IconMail } from '../ui/Icons'
import { useStore } from '../../state/store'
import { OTP_LENGTH, OTP_MIN_LENGTH } from '../../lib/supabase'
import { accentOf } from '../../lib/liveEvent'

/**
 * ── The door ────────────────────────────────────────────────────────────────
 *
 * A campus email and a six-digit code. The same OTP path everybody else uses,
 * the same domain hook, the same campus gating — nothing new in the auth
 * layer, which is the main reason this was chosen over an anonymous account.
 *
 * It buys the thing that matters: somebody who comes back a week later and
 * wants a Looseleaf profile logs in with the address they already used, and
 * everything from the event is waiting for them. It is a login, not a
 * migration.
 *
 * What it costs is a slower door, and two details here are about paying that
 * down. Supabase enforces a **60-second per-user cooldown** on codes, so a
 * mistyped address costs a full minute — hence the address is validated hard
 * before we send, echoed back for confirmation, and "wrong email?" is an
 * obvious link rather than a browser back button. And the copy says plainly
 * that a profile is not being asked for, because the single biggest reason
 * somebody bounces here is assuming it is.
 */
export default function EventGate({ event }) {
  const { actions } = useStore()
  const accent = accentOf(event?.accent)

  const [stage, setStage] = useState('email') // email | code
  const [email, setEmail] = useState('')
  const [digits, setDigits] = useState(() => Array.from({ length: OTP_LENGTH }, () => ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputs = useRef([])

  const typed = digits.join('')

  const send = async (e) => {
    e?.preventDefault()
    const value = email.trim().toLowerCase()

    //  Checked here rather than only by the server, because a rejected send
    //  still burns the 60-second window on some paths and a typo is the most
    //  common thing that happens at a door.
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(value)) {
      setError('That doesn’t look like an email address yet.')
      return
    }

    setBusy(true)
    setError('')
    try {
      await actions.sendCode(value)
      setStage('code')
      setTimeout(() => inputs.current[0]?.focus(), 60)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const attempt = async (codeValue) => {
    setBusy(true)
    setError('')
    try {
      await actions.verifyCode(email.trim().toLowerCase(), codeValue)
      // The page above re-reads the session and moves on to the join form.
    } catch (err) {
      setError(err.message)
      setDigits(Array.from({ length: OTP_LENGTH }, () => ''))
      inputs.current[0]?.focus()
    } finally {
      setBusy(false)
    }
  }

  const setDigit = (i, value) => {
    const cleaned = value.replace(/\D/g, '')
    if (!cleaned) {
      const next = [...digits]
      next[i] = ''
      setDigits(next)
      return
    }
    const next = [...digits]
    // Handles a keystroke and a pasted code identically.
    for (let k = 0; k < cleaned.length && i + k < OTP_LENGTH; k += 1) {
      next[i + k] = cleaned[k]
    }
    setDigits(next)

    const landed = Math.min(i + cleaned.length, OTP_LENGTH - 1)
    inputs.current[landed]?.focus()

    const joined = next.join('')
    if (joined.length === OTP_LENGTH && !joined.includes('')) attempt(joined)
  }

  if (event && !event.join_open) {
    return (
      <Closed
        accent={accent}
        title={event.status === 'ended' ? 'This one’s finished.' : 'Joining is closed.'}
        body={
          event.status === 'ended'
            ? 'Ask whoever ran it when the next one is.'
            : 'The host closed the door when the event started. Find them and they can let you in.'
        }
      />
    )
  }

  return (
    <div className="mt-8">
      {event?.blurb && (
        <p className="mb-7 text-[15.5px] leading-relaxed text-graphite">{event.blurb}</p>
      )}

      {stage === 'email' ? (
        <form onSubmit={send}>
          <label htmlFor="event-email" className="label">
            Your school email
          </label>
          <div className="relative">
            <IconMail
              size={19}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist"
            />
            <input
              id="event-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError('')
              }}
              placeholder="you@umich.edu"
              className="field pl-11"
              aria-invalid={!!error}
            />
          </div>

          {error && (
            <p className="mt-2.5 rounded-xl bg-coral-wash px-3.5 py-2.5 text-[13.5px] leading-relaxed text-coral-deep">
              {error}
            </p>
          )}

          <Button type="submit" variant="coral" size="lg" full className="mt-5" disabled={busy}>
            {busy ? 'Sending…' : 'Send me a code'}
          </Button>

          <p className="mt-4 text-[13px] leading-relaxed text-mist">
            So you can get back in later. It’s never shown to anyone here, and{' '}
            <span className="font-medium text-graphite">
              you don’t need a Looseleaf profile to join
            </span>{' '}
            — just a name.
          </p>
        </form>
      ) : (
        <div>
          <p className="text-[15.5px] leading-relaxed text-graphite">
            We sent a code to <span className="font-medium text-navy">{email}</span>.
          </p>

          <div className="mt-6 flex gap-1.5 sm:gap-2.5">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus()
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH}
                aria-label={`Digit ${i + 1}`}
                className="field h-[52px] flex-1 px-0 text-center text-[19px] font-semibold sm:h-16 sm:text-[24px]"
              />
            ))}
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-coral-wash px-3.5 py-2.5 text-[13.5px] leading-relaxed text-coral-deep">
              {error}
            </p>
          )}

          {typed.length >= OTP_MIN_LENGTH && typed.length < OTP_LENGTH && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              full
              className="mt-4"
              onClick={() => attempt(typed)}
              disabled={busy}
            >
              Check this code
            </Button>
          )}

          {/*  Not a back button. A mistyped address costs a full minute of
               Supabase's per-user cooldown, so the way to fix one has to be
               the most obvious thing on the screen. */}
          <button
            type="button"
            onClick={() => {
              setStage('email')
              setError('')
            }}
            className="mt-6 text-[13.5px] font-medium underline underline-offset-4"
            style={{ color: accent.ink }}
          >
            Wrong email? Change it
          </button>
        </div>
      )}
    </div>
  )
}

function Closed({ accent, title, body }) {
  return (
    <div className="mt-8 rounded-card border border-rule bg-white p-6">
      <h2 className="font-display text-[22px] font-semibold leading-tight" style={{ color: accent.ink }}>
        {title}
      </h2>
      <p className="mt-3 text-[14.5px] leading-relaxed text-graphite">{body}</p>
    </div>
  )
}
