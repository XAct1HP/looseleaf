import { PaperPlane, SheetDoodle, CoffeeDoodle, Star } from '../brand/Doodles'

const ART = {
  plane: PaperPlane,
  sheet: SheetDoodle,
  coffee: CoffeeDoodle,
}

export default function EmptyState({ art = 'sheet', title, body, action, className = '' }) {
  const Art = ART[art] || SheetDoodle
  return (
    <div
      className={`relative flex flex-col items-center rounded-card border border-rule bg-cream/70 px-8 py-12 text-center ${className}`}
    >
      <Star className="absolute left-8 top-8 text-coral/40" size={14} />
      <Star className="absolute right-10 top-12 text-notebook-deep/40" size={11} />
      <div className="animate-float-soft">
        <Art className="text-navy/45" />
      </div>
      <h3 className="mt-5 font-display text-[21px] font-semibold leading-snug">{title}</h3>
      {body && <p className="mt-2 max-w-[34ch] text-[14.5px] leading-relaxed text-graphite">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
