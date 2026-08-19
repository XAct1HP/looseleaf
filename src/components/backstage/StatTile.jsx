/**
 * Figures wear the sans, not Fraunces — a display serif on a number reads as
 * decoration, and it also quietly signals that Backstage is a different mode
 * from the product.
 */

const compact = (n) => {
  if (n === null || n === undefined) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) return n.toLocaleString()
  return String(n)
}

export default function StatTile({ label, value, hint, tone = 'default', href, onClick }) {
  const tones = {
    default: 'border-rule bg-white',
    attention: 'border-coral/30 bg-coral-wash',
    quiet: 'border-rule bg-cream/60',
  }

  const Tag = onClick ? 'button' : href ? 'a' : 'div'

  return (
    <Tag
      href={href}
      onClick={onClick}
      className={`rounded-card border px-5 py-4 text-left transition-colors ${tones[tone]} ${
        onClick || href ? 'hover:border-navy/25' : ''
      }`}
    >
      <p className="text-[12.5px] font-medium text-mist">{label}</p>
      <p className="mt-1.5 font-sans text-[30px] font-semibold leading-none tabular-nums text-navy">
        {compact(value)}
      </p>
      {hint && <p className="mt-1.5 text-[12.5px] leading-snug text-graphite">{hint}</p>}
    </Tag>
  )
}
