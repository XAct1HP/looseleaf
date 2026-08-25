import { useEffect, useState } from 'react'
import { IconX } from '../ui/Icons'
import InstallSheet from './InstallSheet'
import { isStandalone, installNudgeSnoozed, snoozeInstallNudge } from '../../lib/pwa'

/**
 * ── "You're in a browser" ───────────────────────────────────────────────────
 *
 * A strip above the scanner, shown only to somebody who is demonstrably not
 * running the installed app.
 *
 * A strip and not a modal, on purpose. This screen is opened by a person with
 * a customer in front of them and a tray in the other hand; a dialog between
 * them and the camera would be, correctly, the most annoying thing in the
 * product. It sits above the viewfinder, takes one line, and has an X.
 *
 * Dismissal is remembered per *device* rather than per person, because the
 * question is about this handset — the phone behind a counter is used by
 * whoever is on shift. It lapses after a month for the same reason: staff turn
 * over, and the next person should be asked once.
 *
 * The permanent way back in is not this strip. It's the header link in the
 * scanner-only shell, which never goes away — a nudge somebody can dismiss
 * for good, with no other route to the thing it offered, is a dead end.
 */
export default function InstallNudge({ autoOpen = false, onAutoOpened }) {
  // Read once, at mount. Re-reading on every render would make the strip
  // vanish under somebody's thumb the moment they installed it in another tab,
  // which reads as a glitch rather than as success.
  const [hidden, setHidden] = useState(() => isStandalone() || installNudgeSnoozed())
  const [open, setOpen] = useState(false)

  // A ?install= link — from an invitation email, or a QR by the till — should
  // land on the steps, not merely near them.
  useEffect(() => {
    if (!autoOpen) return
    setOpen(true)
    onAutoOpened?.()
  }, [autoOpen, onAutoOpened])

  function dismiss() {
    snoozeInstallNudge()
    setHidden(true)
  }

  return (
    <>
      {!hidden && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-notebook/50 bg-notebook-soft px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-relaxed text-graphite">
              <span className="font-medium text-navy">You’re using this in a browser.</span>{' '}
              Add the scanner to your home screen and it opens straight to the camera — and it
              can’t get lost behind your other tabs mid-shift.
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="focus-ring mt-2 rounded-lg text-[13px] font-medium text-[#2F5C99] underline underline-offset-2 hover:text-navy"
            >
              Show me how
            </button>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Not now"
            className="press focus-ring -mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-mist hover:text-graphite"
          >
            <IconX size={16} />
          </button>
        </div>
      )}

      <InstallSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * The same thing as a plain link, for places that already have their own
 * chrome — the scanner-only header, and the Settings page. No dismissal and no
 * detection: somebody who came looking for this has already decided.
 */
export function InstallLink({ className = '', children = 'Add to home screen' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`focus-ring rounded-xl text-[13.5px] font-medium leading-[20px] text-graphite hover:text-navy ${className}`}
      >
        {children}
      </button>
      <InstallSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
