import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '../../components/brand/Logo'
import Button from '../../components/ui/Button'
import QrScanner from '../../components/events/QrScanner'
import { Underline } from '../../components/brand/Doodles'
import { codeFromScan, normaliseCode } from '../../lib/liveEvent'

/**
 * ── "Join a live event" ─────────────────────────────────────────────────────
 *
 * Worth being clear about what this page is *for*, because the obvious reading
 * is wrong. A printed QR code on a door is opened by the phone's own camera
 * app — nobody opens a website in order to open a camera. So the real path
 * into an event is `/e/K7M2QX` straight from the poster, and this page is the
 * fallback: a cracked lens, a camera that won't focus in a dim room, an older
 * phone, or somebody who was sent the code in a group chat.
 *
 * It earns its place a second way, though, which is why it's linked from the
 * landing page rather than buried: a student who has never heard of a
 * Looseleaf event finds out here that they exist.
 */
export default function JoinCode() {
  const [code, setCode] = useState('')
  const navigate = useNavigate()

  const go = (value) => {
    const clean = normaliseCode(value)
    if (clean.length === 6) navigate(`/e/${clean}`)
  }

  return (
    <div className="min-h-[100dvh] bg-paper">
      <div className="mx-auto flex max-w-[440px] flex-col px-5 pb-16 pt-safe">
        <div className="py-6">
          <Logo />
        </div>

        <h1 className="relative inline-block font-display text-[32px] font-semibold leading-tight tracking-[-0.02em]">
          Join a live event.
          <Underline className="absolute -bottom-1 left-0 text-coral/60" width={215} />
        </h1>

        <p className="mt-6 text-[15.5px] leading-relaxed text-graphite">
          Speed dating nights run by clubs, fraternities and anyone else on campus. Scan the code on
          the door — or type the six characters underneath it.
        </p>

        <form
          className="mt-8"
          onSubmit={(e) => {
            e.preventDefault()
            go(code)
          }}
        >
          <label htmlFor="event-code" className="label">
            Event code
          </label>
          <input
            id="event-code"
            value={code}
            onChange={(e) => setCode(normaliseCode(e.target.value))}
            placeholder="K7M2QX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            className="field text-center font-display text-[30px] font-semibold uppercase tracking-[0.28em]"
          />
          <Button
            type="submit"
            variant="coral"
            size="lg"
            full
            className="mt-5"
            disabled={normaliseCode(code).length !== 6}
          >
            Find the event
          </Button>
        </form>

        <div className="my-7 flex items-center gap-3">
          <span className="h-px flex-1 bg-rule" />
          <span className="text-[12.5px] text-mist">or</span>
          <span className="h-px flex-1 bg-rule" />
        </div>

        {/* `match` is a guard, not decoration: a poster can easily carry two
            codes — the event and the club's Instagram — and firing on the
            wrong one sends somebody to a page that means nothing to them. */}
        <QrScanner
          label="Scan the code"
          match={(raw) => codeFromScan(raw).length === 6}
          onCode={(raw) => go(codeFromScan(raw))}
        />

        <p className="mt-8 text-[13px] leading-relaxed text-mist">
          You don’t need a Looseleaf profile to join one of these. Your school email and a name is
          the whole thing.
        </p>
      </div>
    </div>
  )
}
