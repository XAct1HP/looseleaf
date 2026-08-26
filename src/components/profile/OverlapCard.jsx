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
 * "Your overlap" — familiarity, not surveillance. Only ever shows things both
 * people chose to put on their own profile.
 *
 * When a `fit` is passed it becomes the heading, because the number and the
 * reasons behind it are the same fact told twice and two cards saying "3
 * shared interests" one above the other is how a screen stops being read. The
 * score comes from `compatibility()`; every line under it is the arithmetic in
 * words. Without a fit — on somebody's profile page rather than in Discover —
 * it is the plain overlap card it always was.
 */
export default function OverlapCard({ overlap, fit = null, onSeeMutuals, className = '' }) {
  if (!overlap?.lines?.length) return null

  return (
    <section
      className={`relative overflow-hidden rounded-card border border-notebook/45 bg-notebook-soft px-5 py-5 ${className}`}
      aria-label={fit == null ? 'Your overlap' : `${fit}% match`}
    >
      {fit == null ? (
        <h3 className="mb-3.5 font-display text-[17px] font-semibold text-[#22406E]">You two overlap</h3>
      ) : (
        <div className="mb-4 flex items-center gap-3.5">
          <FitRing value={fit} />
          <div>
            <h3 className="font-display text-[19px] font-semibold leading-tight text-[#22406E]">
              {fit}% match
            </h3>
            <p className="mt-0.5 text-[12.5px] text-[#4A6A99]">Here’s what that’s based on</p>
          </div>
        </div>
      )}

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

/** A 44px dial. Drawn rather than a bar because it sits beside two lines of text. */
function FitRing({ value }) {
  const r = 18
  const c = 2 * Math.PI * r
  const shown = Math.max(0, Math.min(100, value))
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-[#22406E]/15" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${(c * shown) / 100} ${c}`}
        transform="rotate(-90 22 22)"
        className="text-notebook-deep"
      />
    </svg>
  )
}
