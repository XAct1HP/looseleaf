import { IconCheck } from '../ui/Icons'
import { PRICING, fee, money } from '../../lib/partnerBilling'

/**
 * ── One price, said once ────────────────────────────────────────────────────
 *
 * Replaces `PlanCards`. Three tiers side by side existed to make a business
 * choose; there is nothing to choose now, so a comparison grid would be three
 * columns of theatre.
 *
 * The design constraint carried over from the Date Spot cards applies here
 * too: the free column and the paid number are the same visual weight. This
 * is not a free trial with the real price hidden underneath — the whole
 * product is free and one specific event costs $1.50, and the layout should
 * say that rather than perform a discount.
 */
export default function Pricing({ feeCents = 150, tiers = [], compact = false }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
      {/* what you get */}
      <div
        className={`flex flex-col rounded-card border border-rule bg-white ${
          compact ? 'px-5 py-5' : 'px-6 py-7'
        }`}
      >
        <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-mist">
          Everything, for
        </p>
        <p className="mt-1.5 flex items-baseline gap-2">
          <span className="font-sans text-[42px] font-semibold leading-none tracking-[-0.02em] text-navy">
            $0
          </span>
          <span className="text-[15px] text-mist">/month</span>
        </p>
        <p className="mt-3 max-w-[46ch] text-[14px] leading-relaxed text-graphite">
          No tiers, no minimum, no contract. Every business on Loose Leaf gets the whole thing.
        </p>

        <ul className="mt-6 flex-1 space-y-2.5">
          {PRICING.free.map((line) => (
            <li key={line} className="flex gap-2.5 text-[14px] leading-snug text-graphite">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-moss-soft text-[#3F7454]">
                <IconCheck size={10} weight={2.6} />
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>

      {/* what you pay for */}
      <div
        className={`relative flex flex-col rounded-card border border-navy/20 bg-white shadow-paper ${
          compact ? 'px-5 py-5' : 'px-6 py-7'
        }`}
      >
        <span className="absolute -top-2.5 left-6 rounded-full bg-navy px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-paper">
          The only charge
        </span>

        <p className="mt-1 flex items-baseline gap-2">
          <span className="font-sans text-[42px] font-semibold leading-none tracking-[-0.02em] text-navy">
            {fee(feeCents)}
          </span>
          <span className="text-[15px] text-mist">{PRICING.paid.label}</span>
        </p>

        <p className="mt-3 max-w-[42ch] text-[14px] leading-relaxed text-graphite">
          {PRICING.paid.caption}
        </p>

        <div className="mt-6 rounded-2xl border border-notebook/50 bg-notebook-soft px-4 py-4">
          <p className="text-[13px] font-medium text-navy">What that looks like</p>
          <dl className="mt-2.5 space-y-1.5 text-[13.5px] text-graphite">
            <Line n={10} feeCents={feeCents} />
            <Line n={40} feeCents={feeCents} />
            <Line n={0} feeCents={feeCents} />
          </dl>
        </div>

        {tiers.length > 0 && (
          <div className="mt-5 border-t border-rule pt-4">
            <p className="text-[12.5px] font-medium text-mist">Billed monthly, in arrears</p>
            <p className="mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-graphite">
              Redemptions add up through the month and Stripe sends one invoice at the end of it.
              New partners run up to {money(tiers[0].limit_cents)} between invoices; that goes up
              on its own as invoices get paid.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Line({ n, feeCents }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt>
        {n === 0 ? 'A month with none' : `${n} redemptions in a month`}
      </dt>
      <dd className="font-medium tabular-nums text-navy">{money(n * feeCents)}</dd>
    </div>
  )
}
