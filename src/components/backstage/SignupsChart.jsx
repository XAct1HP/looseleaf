import { useState } from 'react'

/**
 * Signups per day.
 *
 * One series, so no legend — the heading says what's plotted. Only the busiest
 * day is directly labelled; a value on every bar is noise, and the tooltip and
 * the table below carry the rest.
 *
 * Bar colour is coral-deep rather than the brand coral: the lighter one only
 * reaches 2.84:1 against the paper surface, which fails the 3:1 floor for a
 * non-text mark. Verified with the palette validator.
 */

const BAR = '#E9484D'

const dayLabel = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const weekday = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short' })

export default function SignupsChart({ data = [], height = 168 }) {
  const [hover, setHover] = useState(null)
  const [showTable, setShowTable] = useState(false)

  if (!data.length) {
    return (
      <p className="rounded-card border border-rule bg-cream/50 px-5 py-8 text-center text-[13.5px] text-mist">
        No signups yet.
      </p>
    )
  }

  const counts = data.map((d) => d.count)
  const peak = Math.max(...counts, 1)
  const peakIndex = counts.lastIndexOf(peak)
  const total = counts.reduce((a, b) => a + b, 0)

  // Clean tick values rather than the raw max, and always one step of headroom
  // above the busiest day. Without it a peak that happens to land exactly on a
  // tick — which is *every* peak on a quiet week, where the busiest day is one
  // signup — draws a bar the full height of the plot with its label jammed
  // against the top edge. The axis should end above the data, not on it.
  const step = peak <= 4 ? 1 : peak <= 10 ? 2 : peak <= 25 ? 5 : 10
  const top = (Math.floor(peak / step) + 1) * step
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step).reverse()

  return (
    <figure className="rounded-card border border-rule bg-white px-5 py-5">
      <figcaption className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-navy">Signups per day</h3>
        <span className="text-[12.5px] text-mist">
          {total} in {data.length} days
        </span>
      </figcaption>

      <div className="relative mt-5 flex gap-3">
        {/* y axis */}
        <div
          className="flex shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-mist"
          style={{ height }}
          aria-hidden="true"
        >
          {ticks.map((t) => (
            <span key={t} className="leading-none">
              {t}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* hairline gridlines, one step off the surface */}
          <div className="absolute inset-0" style={{ height }} aria-hidden="true">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute inset-x-0 border-t border-rule"
                style={{ top: `${((top - t) / top) * 100}%` }}
              />
            ))}
          </div>

          {/* One equal band per day. The bar sits centred in its band, capped at
              24px so the leftover stays air, with at least 2px of surface
              between neighbours when the bands get tight. */}
          <div className="relative flex items-end" style={{ height }}>
            {data.map((d, i) => {
              const h = top === 0 ? 0 : (d.count / top) * 100
              const active = hover === i
              return (
                <button
                  key={d.day}
                  type="button"
                  className="group relative flex h-full flex-1 items-end justify-center focus:outline-none"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${dayLabel(d.day)}: ${d.count} signups`}
                >
                  <span
                    className="w-[calc(100%-2px)] max-w-[24px] rounded-t-[4px] transition-opacity"
                    style={{
                      height: `${Math.max(h, d.count > 0 ? 2 : 0)}%`,
                      background: BAR,
                      opacity: hover === null || active ? 1 : 0.45,
                    }}
                  />
                  {/* Sits in the headroom above the bar rather than on top of
                      it, and only when there is something to label. */}
                  {i === peakIndex && d.count > 0 && (
                    <span
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold tabular-nums leading-none text-navy"
                      style={{ bottom: `calc(${h}% + 6px)` }}
                    >
                      {d.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* x axis: first, middle, last only — 14 dates would collide */}
          <div className="mt-2 flex justify-between text-[11px] text-mist">
            <span>{dayLabel(data[0].day)}</span>
            <span className="hidden sm:inline">{dayLabel(data[Math.floor(data.length / 2)].day)}</span>
            <span>{dayLabel(data[data.length - 1].day)}</span>
          </div>

          {hover !== null && (
            <div
              className="pointer-events-none absolute -top-1 z-10 -translate-y-full rounded-xl border border-rule bg-white px-3 py-2 shadow-lift"
              style={{
                left: `${((hover + 0.5) / data.length) * 100}%`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <p className="whitespace-nowrap text-[12px] font-medium text-navy">
                {weekday(data[hover].day)} {dayLabel(data[hover].day)}
              </p>
              <p className="whitespace-nowrap text-[12px] tabular-nums text-graphite">
                {data[hover].count} {data[hover].count === 1 ? 'signup' : 'signups'}
              </p>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        className="mt-4 text-[12.5px] font-medium text-graphite underline underline-offset-4 hover:text-navy"
      >
        {showTable ? 'Hide the numbers' : 'Show the numbers'}
      </button>

      {showTable && (
        <table className="mt-3 w-full text-left text-[12.5px]">
          <thead>
            <tr className="text-mist">
              <th scope="col" className="pb-1 font-medium">
                Day
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                Signups
              </th>
            </tr>
          </thead>
          <tbody className="text-graphite">
            {data.map((d) => (
              <tr key={d.day} className="border-t border-rule">
                <td className="py-1">{dayLabel(d.day)}</td>
                <td className="py-1 text-right tabular-nums">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  )
}
