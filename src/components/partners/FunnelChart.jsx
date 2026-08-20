/**
 * The four stages, in order, as one series.
 *
 * A funnel is an ordered dimension with a steep magnitude drop, so length
 * carries the value and one hue carries all four bars — colouring each stage
 * differently would imply they are separate categories, which is exactly the
 * thing a funnel is not. The interesting number is the step-down between
 * stages, so that is what gets called out between the rows.
 *
 * The bar hue is coral-deep, not brand coral: the lighter one reaches only
 * 2.84:1 on this paper surface and fails the 3:1 floor for a non-text mark.
 */

const BAR = '#E9484D'

const STAGES = [
  ['spot_views', 'Date Spot views', 'Students who opened your page'],
  ['recommendations', 'Recommendations', 'Times Loose Leaf suggested you'],
  ['offer_unlocks', 'Offer unlocks', 'Passes taken out'],
  ['verified_dates', 'Verified dates', 'Passes your staff scanned'],
]

export default function FunnelChart({ data }) {
  const values = STAGES.map(([key]) => Number(data?.[key] ?? 0))
  const top = Math.max(...values, 1)
  const empty = values.every((v) => v === 0)

  return (
    <figure className="rounded-card border border-rule bg-white px-5 py-6">
      <figcaption className="mb-5 flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-navy">From seen to sat down</h3>
        <span className="text-[12.5px] text-mist">Last {data?.days ?? 30} days</span>
      </figcaption>

      {empty ? (
        <p className="py-8 text-center text-[13.5px] text-mist">
          Nothing measured yet in this window.
        </p>
      ) : (
        <ol className="space-y-1">
          {STAGES.map(([key, label, hint], i) => {
            const value = values[i]
            const prev = i > 0 ? values[i - 1] : null
            const rate = prev ? (prev === 0 ? null : Math.round((value / prev) * 1000) / 10) : null

            return (
              <li key={key}>
                {i > 0 && (
                  <p className="py-1.5 pl-1 text-[11.5px] tabular-nums text-mist">
                    ↓ {rate == null ? '—' : `${rate}%`} carried through
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[14px] font-medium text-navy">{label}</span>
                      <span className="shrink-0 font-sans text-[17px] font-semibold tabular-nums text-navy">
                        {value.toLocaleString()}
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-3 overflow-hidden rounded-[4px] bg-cream"
                      role="img"
                      aria-label={`${label}: ${value}`}
                    >
                      <div
                        className="h-full rounded-[4px]"
                        style={{ width: `${Math.max((value / top) * 100, value > 0 ? 1.5 : 0)}%`, background: BAR }}
                      />
                    </div>
                    <p className="mt-1 text-[11.5px] text-mist">{hint}</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </figure>
  )
}
