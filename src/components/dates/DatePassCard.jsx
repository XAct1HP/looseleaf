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
 */
export default function DatePassCard({ pass, compact = false }) {
  const expired = pass.status === 'expired' || new Date(pass.expiresAt) < new Date()
  const used = pass.status === 'redeemed'
  const dead = expired || used || pass.status === 'void'

  return (
    <article
      className={`relative overflow-hidden rounded-sheet border shadow-lift ${
        dead ? 'border-rule bg-navy/70' : 'border-navy/10 bg-navy'
      } text-paper`}
    >
      <span className="paper-lines pointer-events-none absolute inset-0 opacity-[0.05]" aria-hidden="true" />
      <BinderHoles className="absolute left-3 top-10 bottom-10 hidden opacity-30 sm:flex" count={3} />

      {/* stub */}
      <header className="relative px-7 pt-7 sm:pl-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-paper/55">
          Your Loose Leaf Date Pass
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
      <div className="relative px-7 pb-8 pt-5 text-center sm:pl-12">
        {dead ? (
          <div className="py-6">
            <p className="font-display text-[22px] font-semibold text-paper/70">
              {used ? 'Already used' : expired ? 'This one expired' : 'Cancelled'}
            </p>
            <p className="mx-auto mt-2 max-w-[32ch] text-[13.5px] leading-relaxed text-paper/50">
              {used
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
              />
            </div>

            <p className="mt-4 font-sans text-[17px] font-semibold tracking-[0.16em] text-paper/90">
              {pass.code}
            </p>
            <p className="mt-3 text-[13.5px] text-paper/60">Show this to your server</p>

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
