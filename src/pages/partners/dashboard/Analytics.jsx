import { useEffect, useMemo, useState } from 'react'
import { PageHead } from '../DashboardLayout'
import FunnelChart from '../../../components/partners/FunnelChart'
import StatTile from '../../../components/backstage/StatTile'
import { usePartnerAccount } from '../../../state/partnerAccount'
import { level } from '../../../lib/partnerPlans'
import * as partners from '../../../services/partners'

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

const SERIES = [
  ['spot_views', 'Date Spot views'],
  ['recommendations', 'Recommendations'],
  ['offer_unlocks', 'Offer unlocks'],
  ['verified_dates', 'Verified dates'],
]

const BAR = '#E9484D'

/**
 * The funnel, and one series at a time underneath it.
 *
 * Four series on one chart would need a legend and would make every line
 * except views invisible — the magnitudes are an order of magnitude apart by
 * design. So: pick a metric, see it plotted, no legend needed because the
 * selector says what's plotted.
 */
export default function Analytics() {
  const { partner, entitlements } = usePartnerAccount()
  const [days, setDays] = useState(30)
  const [metric, setMetric] = useState('verified_dates')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!partner) return
    let live = true
    setLoading(true)
    partners
      .funnel(partner.id, days)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [partner, days])

  const depth = level(entitlements, 'analytics', 'basic')

  const series = useMemo(() => {
    const rows = data?.by_day ?? []
    return fillDays(rows, days).map((r) => ({ day: r.day, value: Number(r[metric] ?? 0) }))
  }, [data, days, metric])

  return (
    <>
      <PageHead
        title="Analytics"
        subtitle="Where Loose Leaf traffic goes, and how much of it reaches your door."
        action={
          <div className="flex gap-1 rounded-2xl border border-rule bg-white p-1">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setDays(r.days)}
                className={`focus-ring rounded-xl px-3 py-1.5 text-[13px] font-medium transition ${
                  days === r.days ? 'bg-navy text-paper' : 'text-graphite hover:text-navy'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <p className="mb-6 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          label="Unlock → date"
          value={data?.unlock_to_date != null ? `${data.unlock_to_date}%` : null}
          hint="Of the passes taken out, this many were actually used"
        />
        <StatTile
          label="Suggested → unlocked"
          value={data?.rec_to_unlock != null ? `${data.rec_to_unlock}%` : null}
          hint="How often a suggestion turns into a pass"
        />
      </div>

      <div className="mt-4">
        <FunnelChart data={data} />
      </div>

      {depth === 'basic' ? (
        <p className="mt-4 rounded-card border border-notebook/40 bg-notebook-soft/60 px-5 py-4 text-[13.5px] leading-relaxed text-graphite">
          Day-by-day breakdowns and verified-date reporting come with the higher plans. The totals
          above are the whole picture on this one.
        </p>
      ) : (
        <section className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {SERIES.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMetric(key)}
                aria-pressed={metric === key}
                className={`press focus-ring rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
                  metric === key
                    ? 'border-navy bg-navy text-paper'
                    : 'border-rule bg-white text-graphite hover:border-navy/25'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <DayChart
            data={series}
            title={SERIES.find(([k]) => k === metric)?.[1]}
            loading={loading}
          />
        </section>
      )}
    </>
  )
}

/**
 * One series over days. Same construction as the Backstage signups chart:
 * equal bands, bar capped at 24px so the leftover reads as air, only the peak
 * labelled directly.
 */
function DayChart({ data, title, loading, height = 168 }) {
  const [hover, setHover] = useState(null)

  if (loading) return <p className="py-12 text-center text-[13.5px] text-mist">Loading…</p>
  if (!data.length) {
    return (
      <p className="rounded-card border border-rule bg-cream/50 px-5 py-8 text-center text-[13.5px] text-mist">
        Nothing in this window yet.
      </p>
    )
  }

  const values = data.map((d) => d.value)
  const peak = Math.max(...values, 1)
  const peakIndex = values.lastIndexOf(peak)
  const total = values.reduce((a, b) => a + b, 0)

  const step = peak <= 4 ? 1 : peak <= 10 ? 2 : peak <= 25 ? 5 : peak <= 100 ? 20 : 50
  const top = Math.ceil(peak / step) * step
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step).reverse()

  return (
    <figure className="rounded-card border border-rule bg-white px-5 py-5">
      <figcaption className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-navy">{title} per day</h3>
        <span className="text-[12.5px] tabular-nums text-mist">
          {total.toLocaleString()} in {data.length} days
        </span>
      </figcaption>

      <div className="relative mt-5 flex gap-3">
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
          <div className="absolute inset-0" style={{ height }} aria-hidden="true">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute inset-x-0 border-t border-rule"
                style={{ top: `${((top - t) / top) * 100}%` }}
              />
            ))}
          </div>

          <div className="relative flex items-end" style={{ height }}>
            {data.map((d, i) => (
              <button
                key={d.day}
                type="button"
                className="relative flex h-full flex-1 items-end justify-center focus:outline-none"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${dayLabel(d.day)}: ${d.value}`}
              >
                <span
                  className="w-[calc(100%-2px)] max-w-[24px] rounded-t-[4px] transition-opacity"
                  style={{
                    height: `${Math.max((d.value / top) * 100, d.value > 0 ? 2 : 0)}%`,
                    background: BAR,
                    opacity: hover === null || hover === i ? 1 : 0.45,
                  }}
                />
                {i === peakIndex && peak > 0 && (
                  <span className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 text-[11px] font-semibold tabular-nums text-navy">
                    {peak}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="mt-2 flex justify-between text-[11px] text-mist">
            <span>{dayLabel(data[0].day)}</span>
            <span className="hidden sm:inline">{dayLabel(data[Math.floor(data.length / 2)].day)}</span>
            <span>{dayLabel(data[data.length - 1].day)}</span>
          </div>

          {hover !== null && (
            <div
              className="pointer-events-none absolute -top-1 z-10 rounded-xl border border-rule bg-white px-3 py-2 shadow-lift"
              style={{
                left: `${((hover + 0.5) / data.length) * 100}%`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <p className="whitespace-nowrap text-[12px] font-medium text-navy">
                {dayLabel(data[hover].day)}
              </p>
              <p className="whitespace-nowrap text-[12px] tabular-nums text-graphite">
                {data[hover].value.toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>
    </figure>
  )
}

/** A day with nothing in it is a real zero, not a gap — so fill the range. */
function fillDays(rows, days) {
  const byDay = Object.fromEntries((rows ?? []).map((r) => [r.day, r]))
  const out = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    out.push(byDay[key] ?? { day: key })
  }
  return out
}

const dayLabel = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
