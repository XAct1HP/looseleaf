import Button from '../ui/Button'
import { IconCheck } from '../ui/Icons'
import { PLAN_COPY, money } from '../../lib/partnerPlans'

/**
 * Three tiers, rendered from the `partner_plans` rows rather than from
 * anything in this file — prices, names and blurbs all arrive as data. The
 * only hard-coded thing is which bullet list reads best under each name, and
 * even that is looked up by id with a sensible fallback.
 */
export default function PlanCards({
  plans,
  selectedId,
  onSelect,
  ctaLabel = 'Choose plan',
  currentPlanId,
  compact = false,
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {plans.map((plan) => {
        const copy = PLAN_COPY[plan.id] ?? { includes: [] }
        const selected = selectedId === plan.id
        const current = currentPlanId === plan.id
        const highlight = copy.highlight && !selectedId

        return (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-card border bg-white transition ${
              compact ? 'px-5 py-5' : 'px-6 py-7'
            } ${
              selected
                ? 'border-coral shadow-lift ring-1 ring-coral/30'
                : highlight
                  ? 'border-navy/20 shadow-paper'
                  : 'border-rule'
            }`}
          >
            {copy.highlight && (
              <span className="absolute -top-2.5 left-6 rounded-full bg-navy px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-paper">
                Most complete
              </span>
            )}
            {current && (
              <span className="absolute -top-2.5 right-6 rounded-full bg-moss px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white">
                Your plan
              </span>
            )}

            <h3 className="font-display text-[22px] font-semibold leading-tight">{plan.name}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-graphite">
              {copy.tagline || plan.blurb}
            </p>

            <p className="mt-5 flex items-baseline gap-1.5">
              <span className="font-sans text-[38px] font-semibold leading-none tabular-nums text-navy">
                {money(plan.monthly_cents)}
              </span>
              <span className="text-[14px] text-mist">/month</span>
            </p>

            {copy.inherits && (
              <p className="mt-5 text-[12.5px] font-semibold uppercase tracking-[0.07em] text-mist">
                {copy.inherits}
              </p>
            )}

            <ul className={`${copy.inherits ? 'mt-3' : 'mt-6'} flex-1 space-y-2.5`}>
              {copy.includes.map((line) => (
                <li key={line} className="flex gap-2.5 text-[14px] leading-snug text-graphite">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-moss-soft text-[#3F7454]">
                    <IconCheck size={10} weight={2.6} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>

            {onSelect && (
              <Button
                variant={selected || copy.highlight ? 'coral' : 'outline'}
                size="md"
                full
                className="mt-7"
                onClick={() => onSelect(plan.id)}
                disabled={current}
              >
                {current ? 'Current plan' : selected ? 'Selected' : ctaLabel}
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
