import { money, redemptionsLeft, tierExplainer } from '../../lib/partnerBilling'

/**
 * ── How much further this business can go before we ask for money ───────────
 *
 * A credit limit is an awkward thing to show somebody, and the temptation is
 * to hide it until it bites. That would be worse: the first a restaurant
 * would hear of it is their offer quietly disappearing from the app.
 *
 * So it is shown plainly, framed as headroom rather than as debt, with the
 * number that actually matters to a person running a counter — roughly how
 * many more passes they can take — sitting next to the money. The bar is a
 * bar and not a gauge, because a gauge implies a score and this is not one.
 */
export default function CreditMeter({ summary, compact = false }) {
  if (!summary?.has_card) return null

  const limit = summary.limit_cents || 0
  const used = Math.min(summary.unbilled_cents || 0, limit)
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const left = redemptionsLeft(summary)

  // Coral is the brand red and only clears 2.84:1 on paper — fine as a wide
  // filled bar, which is a large graphical object, but the amber warning step
  // uses the darker tone so the same rule holds at any width.
  const tone =
    pct >= 100 ? 'bg-coral-deep' : pct >= 80 ? 'bg-[#C9821F]' : 'bg-moss'

  return (
    <div
      className={`rounded-card border border-rule bg-white ${compact ? 'px-5 py-5' : 'px-6 py-6'}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
        <p className="text-[12.5px] font-medium text-mist">Outstanding this cycle</p>
        <p className="text-[12.5px] text-mist">
          {summary.tier_name} · {money(limit)} limit
        </p>
      </div>

      <p className="mt-1.5 font-sans text-[26px] font-semibold leading-tight tabular-nums text-navy">
        {money(summary.unbilled_cents)}
        <span className="ml-2 text-[15px] font-normal text-mist">of {money(limit)}</span>
      </p>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-cream">
        <div
          className={`h-full rounded-full transition-all ${tone}`}
          style={{ width: `${Math.max(pct, used > 0 ? 3 : 0)}%` }}
        />
      </div>

      <p className="mt-3 text-[13.5px] leading-relaxed text-graphite">
        {summary.can_issue
          ? `Room for about ${left} more ${left === 1 ? 'redemption' : 'redemptions'} before your next invoice.`
          : 'At your limit. Passes already issued are still being honoured; new ones resume when this month’s invoice is paid.'}
      </p>

      {!compact && (
        <p className="mt-2 max-w-[54ch] text-[12.5px] leading-relaxed text-mist">
          {tierExplainer(summary)}
        </p>
      )}
    </div>
  )
}
