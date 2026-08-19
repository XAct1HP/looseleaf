import { PersonAvatar } from '../brand/Portrait'
import { IconPeople, IconSpark, IconCap, IconPin, IconHeart, IconCoffee, IconFlag } from '../ui/Icons'

const ICONS = {
  people: IconPeople,
  spark: IconSpark,
  cap: IconCap,
  pin: IconPin,
  heart: IconHeart,
  coffee: IconCoffee,
  flag: IconFlag,
}

/**
 * "Your overlap" — familiarity, not surveillance. Only ever shows things
 * both people chose to put on their own profile.
 */
export default function OverlapCard({ overlap, onSeeMutuals, className = '' }) {
  if (!overlap?.lines?.length) return null

  return (
    <section
      className={`relative overflow-hidden rounded-card border border-notebook/45 bg-notebook-soft px-5 py-5 ${className}`}
      aria-label="Your overlap"
    >
      <h3 className="mb-3.5 font-display text-[17px] font-semibold text-[#22406E]">You two overlap</h3>

      <ul className="space-y-2.5">
        {overlap.lines.map((line) => {
          const Icon = ICONS[line.icon] || IconSpark
          return (
            <li key={line.key} className="flex items-start gap-3">
              <Icon size={18} className="mt-[3px] shrink-0 text-notebook-deep" />
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-medium leading-snug text-[#22406E]">{line.text}</p>
                {line.detail && <p className="mt-0.5 text-[13px] text-[#4A6A99]">{line.detail}</p>}
              </div>
              {line.mutuals && (
                <button
                  type="button"
                  onClick={onSeeMutuals}
                  className="focus-ring -my-1 flex shrink-0 items-center rounded-full px-1 py-1 transition-opacity hover:opacity-80"
                  aria-label="See mutual connections"
                >
                  <span className="flex -space-x-2">
                    {line.mutuals.slice(0, 3).map((m) => (
                      <PersonAvatar key={m.id} id={m.id} size={26} ring />
                    ))}
                  </span>
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
