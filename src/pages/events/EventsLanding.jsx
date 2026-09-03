import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '../../components/brand/Logo'
import TopMenu from '../../components/nav/TopMenu'
import Button from '../../components/ui/Button'
import QrScanner from '../../components/events/QrScanner'
import { BinderHoles, Squiggle, Star, Underline } from '../../components/brand/Doodles'
import { IconScan, IconPeople, IconSpark, IconTicket } from '../../components/ui/Icons'
import { codeFromScan, normaliseCode } from '../../lib/liveEvent'

/**
 * ── /events ─────────────────────────────────────────────────────────────────
 *
 * Live events used to be a strip wedged into the student landing page, and it
 * read exactly like what it was: a thing inserted into a page that was already
 * finished. Two audiences were being served one paragraph each, and neither
 * got what they came for.
 *
 * So this is its own destination, and it is built around a fact about who
 * arrives here. There are only two of them:
 *
 *  · **Somebody standing in a room right now**, whose camera didn't focus or
 *    whose phone is old, and who has maybe forty seconds before the first
 *    bell. Everything they need is the code box, and it is the first thing on
 *    the page — above the explanation, because they do not need one.
 *  · **Somebody curious, or a club president wondering if this is for them.**
 *    They need the explanation and the organiser half, and they will scroll.
 *
 * The first audience is smaller and in far more of a hurry, so they win the
 * fold. That is the whole layout argument.
 */
export default function EventsLanding() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="relative mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8">
        <Logo size="md" />
        <TopMenu
          items={[
            { to: '/partners', label: 'For businesses' },
            { to: '/login', label: 'Log in' },
            { to: '/join', label: 'Join your campus', variant: 'primary' },
          ]}
        />
      </header>

      <Hero />
      <HowItRuns />
      <NoProfile />
      <ForOrganisers />
    </div>
  )
}

/* ── hero ────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.05fr_0.85fr] lg:pb-24 lg:pt-12">
        <div className="relative z-10 order-2 max-w-[540px] lg:order-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-cream px-3.5 py-1.5 text-[12.5px] font-medium text-graphite">
            <span className="h-1.5 w-1.5 rounded-full bg-coral" />
            Live events
          </span>

          <h1 className="relative mt-5 font-display text-[42px] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-[54px]">
            Four minutes.
            <br />
            <span className="relative inline-block">
              Then a bell.
              <Underline className="absolute -bottom-2 left-0 w-full text-coral" width={210} />
            </span>
          </h1>

          <p className="mt-7 max-w-[46ch] text-[16.5px] leading-relaxed text-graphite">
            Speed dating nights, run by clubs and societies on your campus. Scan the code on the
            door and your phone tells you where to sit, who you’re sitting with, and how long you’ve
            got. Then it moves you.
          </p>

          <p className="mt-5 flex items-center gap-2 text-[13px] text-mist">
            <Star size={14} className="text-margin" />
            Free, and you don’t need a Looseleaf profile to join one.
          </p>
        </div>

        {/*  Ordered deliberately, and differently by width.
             On a laptop somebody is usually reading, so the pitch leads and the
             card sits beside it. On a phone they are far more likely to be
             standing in the room with forty seconds to spare, so the card comes
             first and the pitch is what they scroll past. */}
        <div className="order-1 lg:order-2">
          <JoinCard />
        </div>
      </div>
    </section>
  )
}

function JoinCard() {
  const [code, setCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const navigate = useNavigate()

  const go = (value) => {
    const clean = normaliseCode(value)
    if (clean.length === 6) navigate(`/e/${clean}`)
  }

  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <Squiggle className="absolute -right-3 -top-5 text-notebook-deep/50" width={70} />

      {/*  A torn sheet, not a form. The binder holes are the same motif as a
           Date Pass, which is the other thing in Looseleaf you hold up in a
           doorway. */}
      <div className="card relative overflow-hidden px-6 py-7 sm:px-8">
        <BinderHoles className="absolute left-3 top-0 h-full" count={3} />

        <div className="pl-6">
          <h2 className="font-display text-[24px] font-semibold leading-tight">
            At one right now?
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-graphite">
            Type the six characters printed under the code.
          </p>

          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault()
              go(code)
            }}
          >
            <label htmlFor="hero-code" className="sr-only">
              Event code
            </label>
            <input
              id="hero-code"
              value={code}
              onChange={(e) => setCode(normaliseCode(e.target.value))}
              placeholder="K7M2QX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="field text-center font-display text-[30px] font-semibold uppercase tracking-[0.24em] placeholder:tracking-[0.24em]"
            />
            <Button
              type="submit"
              variant="coral"
              size="lg"
              full
              className="mt-4"
              disabled={normaliseCode(code).length !== 6}
            >
              Take me in
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-rule" />
            <span className="text-[12px] text-mist">or</span>
            <span className="h-px flex-1 bg-rule" />
          </div>

          {/*  Worth being honest about what this button is for. A printed QR is
               opened by the phone's own camera — nobody opens a website in
               order to open a camera. This is the fallback for a cracked lens,
               a dim room, or a camera app that won't focus. */}
          {scanning ? (
            <QrScanner
              label="Scan the code"
              match={(raw) => codeFromScan(raw).length === 6}
              onCode={(raw) => go(codeFromScan(raw))}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              full
              onClick={() => setScanning(true)}
            >
              <IconScan size={18} />
              Scan it instead
            </Button>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-[12.5px] text-mist">
        Camera not cooperating? The code always works.
      </p>
    </div>
  )
}

/* ── how a night runs ────────────────────────────────────────────────────── */

const STEPS = [
  {
    n: '01',
    title: 'Scan the code on the door.',
    body: 'Your school email and a first name. That’s the whole sign-up, and it takes about twenty seconds.',
  },
  {
    n: '02',
    title: 'Your phone says Table 5.',
    body: 'Go and sit there. The person opposite has a name on your screen and nothing else — you’re meant to be looking at them, not at a phone.',
  },
  {
    n: '03',
    title: 'It buzzes. You move.',
    body: 'Nobody has to shout over the room. Everyone’s phone changes at the same second, and it tells you exactly where to go next.',
  },
  {
    n: '04',
    title: 'Yes or no, in private.',
    body: 'After each one you say whether you’d talk to them again. A no is invisible forever. Only a yes from both of you ever surfaces.',
  },
  {
    n: '05',
    title: 'At the end, who said yes back.',
    body: 'Revealed all at once, when whoever ran the night is ready. Nobody is refreshing their phone at the table.',
  },
]

function HowItRuns() {
  return (
    <section className="border-y border-rule bg-cream/50">
      <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-24">
        <h2 className="max-w-[17ch] font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
          How a night actually runs.
        </h2>

        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="lift-corner rounded-card border border-rule bg-white px-6 py-6">
              <span className="font-display text-[15px] font-semibold text-coral">{s.n}</span>
              <h3 className="mt-3 font-display text-[20px] font-semibold leading-tight">
                {s.title}
              </h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-graphite">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ── the differentiator ──────────────────────────────────────────────────── */

function NoProfile() {
  return (
    <section className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-24">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.9fr]">
        <div className="max-w-[520px]">
          <h2 className="relative font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">
            You don’t need a{' '}
            <span className="relative inline-block">
              profile
              <Underline className="absolute -bottom-1 left-0 w-full text-margin/70" width={120} />
            </span>{' '}
            to come to one.
          </h2>
          <p className="mt-6 text-[16px] leading-relaxed text-graphite">
            A school email and a name gets you in the room. No photos, no prompts, no questionnaire
            — you’re about to meet these people in person anyway.
          </p>
          <p className="mt-4 text-[16px] leading-relaxed text-graphite">
            If somebody says yes back and you want to carry on talking, that’s the moment to make a
            profile. Same email, same login, and the people you met are waiting.
          </p>
        </div>

        <ul className="space-y-3">
          {[
            {
              Icon: IconPeople,
              tone: 'bg-notebook-soft text-[#2F5C99]',
              title: 'Nobody can browse the room.',
              body: 'You see one name at a time — the person in front of you. There is no attendee list, for anyone.',
            },
            {
              Icon: IconTicket,
              tone: 'bg-coral-soft text-coral-deep',
              title: 'The organiser never sees your answers.',
              body: 'They get counts: how many came, how many matched. Never who said yes to whom, and never your email address.',
            },
            {
              Icon: IconSpark,
              tone: 'bg-moss-soft text-[#3F7454]',
              title: 'A no goes nowhere.',
              body: 'It is not shown, not counted back to them, and not inferable from anything they see.',
            },
          ].map(({ Icon, tone, title, body }) => (
            <li key={title} className="flex gap-4 rounded-card border border-rule bg-white px-5 py-5">
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
                <Icon size={19} />
              </span>
              <div>
                <h3 className="font-display text-[18px] font-semibold leading-tight">{title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-graphite">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ── organisers ──────────────────────────────────────────────────────────── */

function ForOrganisers() {
  return (
    <section className="mx-auto max-w-[1180px] px-5 pb-20 sm:px-8">
      <div className="relative overflow-hidden rounded-sheet border border-navy/10 bg-navy px-7 py-14 text-paper sm:px-14">
        <span className="paper-lines absolute inset-0 opacity-[0.06]" aria-hidden="true" />

        <div className="relative grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <div className="max-w-[520px]">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[12.5px] font-medium text-paper/85">
              For clubs and societies
            </span>
            <h2 className="mt-5 font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">
              Run one for your club.
            </h2>
            <p className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-paper/75">
              You bring a room and some chairs. We do the part that goes wrong: who sits with whom,
              nobody meeting the same person twice, whoever sat out last round going first this
              time, and a timer that keeps running even when your phone locks.
            </p>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-paper/60">
              It’s free. There is no business to set up and no card to add — that’s the other
              product.
            </p>

            {/*  One button. There was briefly a second saying "I already run
                 one", which went to exactly the same place — two doors into
                 one room, which only makes a reader stop and work out whether
                 they differ. The returning host is covered by a sentence. */}
            <div className="mt-8">
              <Button to="/host" variant="coral" size="lg" className="px-8">
                Set up an event
              </Button>
              <p className="mt-4 text-[13.5px] text-paper/60">
                Already run one? Same door — sign in with your campus email.
              </p>
            </div>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {[
              [
                'It’s not only for dating.',
                'A rush night where newcomers rotate through members, with matching switched off entirely, is the same three settings.',
              ],
              [
                'Printable, on the day.',
                'A door poster, flyers, numbered table tents and a square for your story — straight from the browser, no design work.',
              ],
              [
                'Share the link early.',
                'Anyone who taps it before the night verifies at home. At the door they scan and walk in, and you have no queue.',
              ],
            ].map(([title, body]) => (
              <li key={title} className="rounded-card bg-white/[0.07] px-5 py-4">
                <h3 className="font-display text-[17px] font-semibold leading-tight">{title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-paper/70">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
