import { DATE_TYPES } from '../../data/catalog'
import { IconX } from '../ui/Icons'
import { Star } from '../brand/Doodles'

/**
 * Shows up once a conversation has legs. Dismissible, never repeated after
 * dismissal, never pushy. Leaving the app is the win condition.
 */
export default function DateNudge({ onPick, onDismiss }) {
  return (
    <div className="relative animate-slide-note overflow-hidden rounded-card border border-rule bg-white px-5 py-5 shadow-paper">
      <Star className="absolute right-12 top-3 text-margin/50" size={13} />
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="press absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-mist hover:bg-navy/[0.05] hover:text-graphite"
      >
        <IconX size={16} />
      </button>

      <h3 className="font-display text-[19px] font-semibold leading-tight">This seems promising.</h3>
      <p className="mt-1.5 text-[14px] text-graphite">Want to actually meet?</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {DATE_TYPES.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onPick(d)}
            className="press focus-ring inline-flex items-center gap-2 rounded-full border border-rule bg-cream/70 px-3.5 py-2 text-[13.5px] font-medium text-navy transition hover:border-coral/40 hover:bg-coral-wash"
          >
            <span aria-hidden="true">{d.emoji}</span>
            {d.label}
          </button>
        ))}
      </div>
    </div>
  )
}
