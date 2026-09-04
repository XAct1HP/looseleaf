import QrCode from './QrCode'
import { BinderHoles } from '../brand/Doodles'
import { passUrl } from '../../lib/site'

/**
 * ── The Date Pass ───────────────────────────────────────────────────────────
 *
 * This wants to feel like a ticket, not a coupon — because what it actually
 * marks is that two people decided to go somewhere together, and the discount
 * is the smaller half of that.
 *
 * So: dark stock, a perforated tear line, the code set wide like a booking
 * reference, and the QR sitting on paper rather than in a white box. Loose
 * Leaf's own binder holes down the left edge, because a pass is still a sheet.
 *
 * ── Why the gutter is on one side and the centring is on neither ────────────
 *
 * The binder holes need room, so the *stub* is padded away from them on the
 * left only — the text there is left-aligned, and an asymmetric gutter is what
 * makes it look like a bound sheet rather than a box.
 *
 * The code half is centred, and a one-sided gutter there is a lie: everything
 * inside it centres on the padded box, which sits 48px right of the card's
 * real middle. On the wide student wallet nobody notices; in the 340px column
 * on the Partners landing page the QR is visibly off to the right, because
 * Tailwind's `sm:` reads the *viewport*, not this card — so a narrow card on a
 * wide screen gets a desktop-sized gutter it has no room for. Hence `sm:px-12`
 * rather than `sm:pl-12`: the same clearance from the holes, applied to both
 * sides, so centred means centred at every width.
 */
export default function DatePassCard({ pass, compact = false, justRedeemed = false }) {
  const expired = pass.status === 'expired' || new Date(pass.expiresAt) < new Date()
  const used = pass.status === 'redeemed'
  const dead = expired || used || pass.status === 'void'

  // ── The one dead state that is good news ────────────────────────────────
  //
  // A used pass is normally history, and history is grey. But `justRedeemed`
  // means the wallet watched this happen — somebody behind a counter scanned
  // it thirty seconds ago while its owner stood there — and at that moment the
  // card is not a record, it is the answer to *did that work?*
  //
  // Only the wallet can tell the difference, so only the wallet passes it in.
  // A pass rendered anywhere else is history by default, which is the right
  // way round: the flourish has to be earned by having witnessed the event.
  const fresh = used && justRedeemed

  return (
    <article
      className={`relative overflow-hidden rounded-sheet border shadow-lift ${
        fresh ? 'border-moss/60 bg-navy' : dead ? 'border-rule bg-navy/70' : 'border-navy/10 bg-navy'
      } text-paper`}
    >
      <span className="paper-lines pointer-events-none absolute inset-0 opacity-[0.05]" aria-hidden="true" />
      <BinderHoles className="absolute left-3 top-10 bottom-10 hidden opacity-30 sm:flex" count={3} />

      {/* stub */}
      <header className="relative px-7 pt-7 sm:pl-12">
        <p
          className={`text-[11px] font-semibold uppercase tracking-[0.11em] ${
            fresh ? 'text-moss' : 'text-paper/55'
          }`}
        >
          {fresh ? 'Redeemed ✓' : 'Your Loose Leaf Date Pass'}
        </p>
        <h3 className="mt-3 font-display text-[26px] font-semibold leading-tight">
          {pass.partnerName}
        </h3>
        <p className="mt-1.5 text-[17px] text-paper/80">{pass.offerSummary || pass.offerTitle}</p>
        {pass.daysText && pass.daysText !== 'Any day' && (
          <p className="mt-1 text-[13px] text-paper/55">Valid {pass.daysText}</p>
        )}
        <p className="mt-1 text-[13px] text-paper/55">
          {used
            ? `Used ${formatDay(pass.redeemedAt)}`
            : expired
              ? `Expired ${formatDay(pass.expiresAt)}`
              : `Expires ${formatDay(pass.expiresAt)}`}
        </p>
      </header>

      {/* the tear */}
      <div className="relative mt-6 flex items-center" aria-hidden="true">
        <span className="h-6 w-6 -translate-x-1/2 rounded-full bg-paper" />
        <span className="h-px flex-1 border-t border-dashed border-paper/25" />
        <span className="h-6 w-6 translate-x-1/2 rounded-full bg-paper" />
      </div>

      {/* the code */}
      <div className="relative px-7 pb-8 pt-5 text-center sm:px-12">
        {dead ? (
          <div className="py-6">
            <p
              className={`font-display text-[22px] font-semibold ${
                fresh ? 'text-paper' : 'text-paper/70'
              }`}
            >
              {fresh
                ? 'That went through.'
                : used
                  ? 'Already used'
                  : expired
                    ? 'This one expired'
                    : 'Cancelled'}
            </p>
            <p
              className={`mx-auto mt-2 max-w-[32ch] text-[13.5px] leading-relaxed ${
                fresh ? 'text-paper/75' : 'text-paper/50'
              }`}
            >
              {fresh
                ? 'Scanned just now. Enjoy the date.'
                : used
                  ? 'Hope it was a good one.'
                  : 'You can unlock it again from the Date Spot if the offer is still running.'}
            </p>
          </div>
        ) : (
          <>
            <div className="mx-auto w-fit rounded-2xl bg-paper p-3.5">
              <QrCode
                value={passUrl(pass.code)}
                size={compact ? 132 : 168}
                label={`Date Pass ${pass.code}`}
                // Block, or the svg sits on a text baseline and the white
                // plate gains a descender's worth of extra room along the
                // bottom edge — which reads as a QR that isn't quite centred.
                className="block"
              />
            </div>

            <p className="mt-4 font-sans text-[17px] font-semibold tracking-[0.16em] text-paper/90">
              {pass.code}
            </p>
            <p className="mt-3 text-[13.5px] text-paper/60">Show this when you arrive</p>

            {pass.isDemo && (
              <p className="mx-auto mt-4 max-w-[34ch] rounded-xl bg-white/10 px-3 py-2 text-[12px] leading-relaxed text-paper/70">
                This is a demo pass for an invented restaurant. It won’t scan anywhere real.
              </p>
            )}
          </>
        )}

        {pass.terms && !dead && (
          <p className="mx-auto mt-5 max-w-[38ch] text-[11.5px] leading-relaxed text-paper/45">
            {pass.terms}
          </p>
        )}
      </div>
    </article>
  )
}

function formatDay(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}
