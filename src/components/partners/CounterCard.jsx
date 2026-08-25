import { useEffect } from 'react'
import Sheet from '../ui/Sheet'
import Button from '../ui/Button'
import QrCode from '../dates/QrCode'
import Logo from '../brand/Logo'
import { url } from '../../lib/site'

/**
 * ── A card for the counter ──────────────────────────────────────────────────
 *
 * The layer nobody builds and everybody needs.
 *
 * A restaurant with six part-timers has no reliable way to reach them all
 * through the product: they don't read the owner's email, they aren't in the
 * dashboard, and half of them are told about Loose Leaf verbally at the start
 * of a shift. Something printed and taped by the till reaches every one of
 * them, on their own phone, at the moment they actually need it.
 *
 * The QR goes to `?install=1`, so pointing a phone at it lands on the
 * scanner with the walkthrough already open — and the walkthrough shows that
 * phone's own steps, which is the part a printed card fundamentally cannot do.
 *
 * Printing takes some care, because this card lives inside a Sheet — a fixed,
 * vertically centred box that scrolls internally and is portalled to the end
 * of <body>. Left alone it prints halfway down page one with the last step
 * clipped off the bottom. The `.print-mode` rules in index.css remove #root
 * outright and put the sheet back into ordinary flow; the class is added here
 * only while the card is open, so Ctrl+P everywhere else is unaffected.
 */
export default function CounterCard({ open, onClose, partnerName }) {
  const link = url('/partners/dashboard/scan?install=1')

  // The print rules are gated on this class rather than applying globally, so
  // Ctrl+P anywhere else in the app still prints what a browser would print
  // instead of a blank sheet where the dashboard used to be.
  useEffect(() => {
    if (!open) return undefined
    const root = document.documentElement
    root.classList.add('print-mode')
    return () => root.classList.remove('print-mode')
  }, [open])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="A card for the counter"
      subtitle="Print it and tape it up where staff can see it. Anyone who scans it lands on the steps for their own phone."
      maxWidth="max-w-lg"
      footer={
        <div className="no-print flex flex-wrap gap-3">
          <Button variant="coral" size="md" onClick={() => window.print()}>
            Print this
          </Button>
          <Button variant="outline" size="md" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="print-card rounded-card border border-rule bg-white px-6 py-7">
        <div className="flex items-center gap-2.5">
          <Logo size="sm" />
          <span className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-mist">
            for staff
          </span>
        </div>

        <h2 className="mt-5 font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-navy">
          Put the Loose Leaf scanner on your phone.
        </h2>
        <p className="mt-2.5 max-w-[46ch] text-[14px] leading-relaxed text-graphite">
          It’s how you check a customer’s Date Pass at {partnerName || 'this counter'}. Takes about
          a minute, and you only do it once.
        </p>

        <div className="mt-6 flex items-start gap-5">
          <div className="shrink-0 rounded-2xl border border-rule bg-paper p-2.5">
            <QrCode value={link} size={132} label="Scan to set up the Loose Leaf scanner" />
          </div>

          <ol className="min-w-0 space-y-3">
            {[
              'Point your phone’s camera at this code.',
              'Follow the steps it shows you — they’re written for whatever phone you have.',
              'Log in with the email address your manager added you with.',
            ].map((s, i) => (
              <li key={s} className="flex gap-2.5">
                <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-semibold tabular-nums text-paper">
                  {i + 1}
                </span>
                <span className="text-[13.5px] leading-relaxed text-navy">{s}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* The single sentence that stops the mistake this whole change was
            about: a staff member landing on the marketing page, seeing one
            coral button, and signing their employer up a second time. */}
        <p className="mt-6 rounded-2xl border border-notebook/50 bg-notebook-soft px-4 py-3 text-[13px] leading-relaxed text-graphite">
          <span className="font-medium text-navy">You don’t need to create an account.</span> If
          you’ve been added to the team, logging in with that email is all there is to it — don’t
          go through “Become a Partner”, that’s for signing up a business.
        </p>

        <p className="mt-4 break-all text-[11.5px] text-mist">
          No camera handy? Go to {link}
        </p>
      </div>

      <p className="no-print mt-4 text-[12.5px] leading-relaxed text-mist">
        Prints on one sheet of A4 or Letter. Nothing on it is specific to a person, so one copy by
        the till covers everybody.
      </p>
    </Sheet>
  )
}
