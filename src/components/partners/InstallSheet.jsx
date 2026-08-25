import { useEffect, useMemo, useState } from 'react'
import Sheet from '../ui/Sheet'
import Button from '../ui/Button'
import QrCode from '../dates/QrCode'
import { IconCheck } from '../ui/Icons'
import { url } from '../../lib/site'
import {
  PLATFORM_LABELS,
  detectPlatform,
  isStandalone,
  onInstallAvailability,
  promptInstall,
} from '../../lib/pwa'

/**
 * ── "Put the scanner on your phone" ─────────────────────────────────────────
 *
 * The thing this replaces is a manager standing next to a new hire trying to
 * remember where the Share icon is on someone else's phone.
 *
 * Three decisions worth keeping:
 *
 * **One platform's steps, not a matrix.** Install guides fail by showing every
 * platform at once and making a person on a shift work out which paragraph is
 * theirs. This guesses, shows one set, and puts the others behind a single
 * link — so the guess being wrong costs one tap rather than the whole thing
 * being unreadable.
 *
 * **A real button wherever there is one.** Where Chrome has given us a
 * `beforeinstallprompt`, the correct number of instructions is zero: press
 * Install, done. The written steps are what's left for platforms with no such
 * thing — which is every iPhone, and iPhones are most of what is behind a
 * counter.
 *
 * **Drawn glyphs, not screenshots.** A screenshot of iOS goes stale silently:
 * Apple moves the Share sheet, the picture stays, and a member of staff now
 * trusts a diagram that is wrong. These are the same two icons drawn in the
 * app's own hand, which are recognisable precisely because they haven't
 * changed in a decade.
 */

const SCANNER_PATH = '/partners/dashboard/scan'

/* ── the two glyphs that do all the work ─────────────────────────────────── */

/** iOS Share: a box with an arrow leaving the top of it. */
function ShareGlyph({ size = 26, className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="M8.5 6.5 12 3l3.5 3.5" />
      <path d="M7 10.5H5.5A1.5 1.5 0 0 0 4 12v7.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5H17" />
    </svg>
  )
}

/** Chrome / Samsung: the three-dot overflow menu. */
function MenuGlyph({ size = 26, className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="12" cy="19" r="1.9" />
    </svg>
  )
}

/** Desktop Chrome / Edge: the install chip that appears in the address bar. */
function InstallBarGlyph({ size = 26, className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="6.5" width="18" height="11" rx="2.5" />
      <path d="M12 9.5v5" />
      <path d="M9.6 12.4 12 14.8l2.4-2.4" />
    </svg>
  )
}

/* ── what to actually do, per platform ───────────────────────────────────── */
//  Written as the words on the screen, not paraphrases of them: "Add to Home
//  Screen" is capitalised the way iOS capitalises it so it can be matched by
//  eye rather than by meaning.

const STEPS = {
  'ios-safari': {
    Glyph: ShareGlyph,
    lead: 'In Safari, the Share button is in the bar at the bottom of the screen (top-right on an iPad).',
    steps: [
      'Tap the Share button — the square with an arrow coming out of it.',
      'Scroll down the list and tap Add to Home Screen.',
      'Tap Add, top right. The scanner appears on your home screen.',
    ],
    note: 'iPhones never offer to do this for you — Apple leaves it to the Share menu, so this is the only route.',
  },
  'ios-chrome': {
    Glyph: ShareGlyph,
    lead: 'Chrome on an iPhone can do this, but it hides it one level deeper than Safari does.',
    steps: [
      'Tap the Share button in Chrome’s address bar.',
      'Tap Add to Home Screen.',
      'Tap Add.',
    ],
    note: 'If you can’t find it, open this page in Safari instead — it’s two taps there.',
  },
  'ios-other': {
    Glyph: ShareGlyph,
    lead: 'Not every iPhone browser can add an app to the home screen. Safari always can.',
    steps: [
      'Copy this page’s address, or use the QR code below.',
      'Open it in Safari.',
      'Tap Share, then Add to Home Screen, then Add.',
    ],
  },
  'android-chrome': {
    Glyph: MenuGlyph,
    lead: 'Chrome usually offers this by itself. If it hasn’t, the menu always has it.',
    steps: [
      'Tap the ⋮ menu, top right.',
      'Tap Install app — or Add to Home screen if that’s what yours says.',
      'Tap Install.',
    ],
    note: 'Both menu entries do the same thing here; which one you see depends on your Chrome version.',
  },
  'android-samsung': {
    Glyph: MenuGlyph,
    lead: 'Samsung Internet keeps this under the menu at the bottom of the screen.',
    steps: [
      'Tap the ☰ menu.',
      'Tap Add page to, then Home screen.',
      'Tap Add.',
    ],
  },
  'android-firefox': {
    Glyph: MenuGlyph,
    lead: 'Firefox calls it Install rather than Add to Home screen.',
    steps: ['Tap the ⋮ menu.', 'Tap Install, or Add to Home screen.', 'Confirm.'],
  },
  desktop: {
    Glyph: InstallBarGlyph,
    lead: 'On a computer this opens in its own window with no tabs and no address bar — useful for a screen that lives on the counter.',
    steps: [
      'Look for the install icon at the right-hand end of the address bar.',
      'Click it, then click Install.',
    ],
    note: 'No icon there? Chrome’s ⋮ menu has Cast, save and share → Install page as app.',
  },
  other: {
    Glyph: InstallBarGlyph,
    lead: 'We can’t tell what you’re using, so here is the shape of it on every browser that supports this.',
    steps: [
      'Open the browser’s own menu — usually ⋮, ☰, or a Share button.',
      'Look for Install, Install app, or Add to Home Screen.',
      'Confirm.',
    ],
    note: 'If none of those are there, this browser can’t install web apps. Safari on iPhone and Chrome on Android both can.',
  },
}

const ORDER = [
  'ios-safari',
  'ios-chrome',
  'android-chrome',
  'android-samsung',
  'android-firefox',
  'ios-other',
  'desktop',
  'other',
]

export default function InstallSheet({ open, onClose }) {
  const guessed = useMemo(() => detectPlatform(), [])
  const [platform, setPlatform] = useState(guessed)
  const [picking, setPicking] = useState(false)
  const [oneTap, setOneTap] = useState(false)
  const [outcome, setOutcome] = useState(null)

  // Chrome can hand us a real install prompt at any moment, including after
  // this sheet is already open, so this is a subscription rather than a read.
  useEffect(() => onInstallAvailability(setOneTap), [])

  // Reopening after a failed attempt should not still be showing the last
  // answer, and the platform guess should win again over a hand-pick made two
  // days ago on somebody else's shift.
  useEffect(() => {
    if (!open) return
    setOutcome(null)
    setPicking(false)
    setPlatform(guessed)
  }, [open, guessed])

  const installed = isStandalone()
  const plan = STEPS[platform] ?? STEPS.other
  const { Glyph } = plan
  const scannerUrl = url(SCANNER_PATH)

  async function install() {
    const result = await promptInstall()
    setOutcome(result)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Put the scanner on your phone"
      subtitle="It opens straight to the camera, and it won't get lost behind your other tabs."
      maxWidth="max-w-lg"
    >
      {installed ? (
        <AlreadyInstalled />
      ) : (
        <>
          {/* Where a browser will do this for us, the instructions are the
              fallback and not the headline — so they move below the button. */}
          {oneTap && outcome !== 'accepted' && (
            <div className="mb-6 rounded-2xl border border-moss/30 bg-moss-soft px-4 py-4">
              <p className="text-[14px] font-medium text-navy">
                Your browser can do this for you.
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#3F7454]">
                One tap — no menus to go hunting through.
              </p>
              <Button variant="coral" size="lg" full className="mt-4" onClick={install}>
                Install the scanner
              </Button>
              {outcome === 'dismissed' && (
                <p className="mt-3 text-[13px] leading-relaxed text-graphite">
                  No problem — you can still do it by hand with the steps below, or ask again from
                  this screen whenever you like.
                </p>
              )}
            </div>
          )}

          {outcome === 'accepted' && (
            <div className="mb-6 rounded-2xl border border-moss/30 bg-moss-soft px-4 py-4">
              <p className="flex items-center gap-2 text-[14px] font-medium text-navy">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-moss text-white">
                  <IconCheck size={12} weight={2.6} />
                </span>
                That’s it — look for the coral Scanner icon.
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#3F7454]">
                Open it from there from now on rather than through the browser. You’ll stay signed
                in.
              </p>
            </div>
          )}

          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-coral-soft text-coral-deep">
              <Glyph size={24} />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold uppercase tracking-[0.07em] text-mist">
                {PLATFORM_LABELS[platform]}
              </p>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-graphite">{plan.lead}</p>
            </div>
          </div>

          <ol className="mt-6 space-y-4">
            {plan.steps.map((s, i) => (
              <li key={s} className="flex gap-3.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-[13px] font-semibold tabular-nums text-paper">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-[15px] leading-relaxed text-navy">{s}</span>
              </li>
            ))}
          </ol>

          {plan.note && (
            <p className="mt-5 rounded-2xl border border-rule bg-cream/70 px-4 py-3 text-[13px] leading-relaxed text-graphite">
              {plan.note}
            </p>
          )}

          {/* The guess is stated as a guess. Somebody holding a phone knows
              what it is better than a user-agent string does. */}
          <div className="mt-6 border-t border-rule pt-5">
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className="focus-ring rounded-lg text-[13.5px] font-medium text-graphite underline underline-offset-2 hover:text-navy"
            >
              {picking ? 'Never mind' : 'Using something else?'}
            </button>

            {picking && (
              <div className="mt-3 flex flex-wrap gap-2">
                {ORDER.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setPlatform(id)
                      setPicking(false)
                    }}
                    className={`press focus-ring rounded-full border px-3.5 py-2 text-[13px] transition ${
                      id === platform
                        ? 'border-navy bg-navy text-paper'
                        : 'border-rule bg-white text-graphite hover:border-coral/40 hover:text-navy'
                    }`}
                  >
                    {PLATFORM_LABELS[id]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* The manager-on-a-laptop case: they're reading this on the wrong
              device entirely, and what they need is to get it onto a phone in
              somebody else's hand without reading a URL out loud. */}
          <div className="mt-6 flex items-start gap-4 rounded-2xl border border-rule bg-cream/60 px-4 py-4">
            <div className="shrink-0 rounded-xl bg-paper p-2">
              <QrCode value={scannerUrl} size={92} label="Link to the Loose Leaf scanner" />
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-navy">On the wrong device?</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-graphite">
                Point the counter phone’s camera at this. It opens the scanner there, and these
                same steps come with it.
              </p>
              <p className="mt-2 break-all text-[12px] text-mist">{scannerUrl}</p>
            </div>
          </div>
        </>
      )}
    </Sheet>
  )
}

function AlreadyInstalled() {
  return (
    <div className="py-4 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-moss text-white">
        <IconCheck size={28} weight={2.4} />
      </span>
      <p className="mt-5 font-display text-[19px] font-semibold leading-tight text-navy">
        You’re already running the installed scanner.
      </p>
      <p className="mx-auto mt-2.5 max-w-[38ch] text-[14px] leading-relaxed text-graphite">
        Nothing to do. If you want it on another phone as well, open this page there and this
        screen will show that phone’s steps.
      </p>
    </div>
  )
}
