import LikeButton from './LikeButton'

/**
 * A prompt answer, set like a line written on a sheet: faint rules, a pink
 * margin, and a heart that shows up when you're paying attention to it.
 */
export default function PromptCard({ prompt, person, onLike, liked = false, compact = false, className = '' }) {
  return (
    <article
      className={`lift-corner group relative overflow-hidden rounded-card border border-rule bg-white ${
        compact ? 'px-5 py-4' : 'px-6 py-6 sm:px-7'
      } ${className}`}
    >
      {/* margin rule */}
      <span className="pointer-events-none absolute inset-y-0 left-4 w-px bg-margin/25 sm:left-5" aria-hidden="true" />
      {/* faint paper lines behind the answer */}
      <span
        className="paper-lines-soft pointer-events-none absolute inset-x-0 bottom-0 top-10 opacity-60"
        aria-hidden="true"
      />

      <div className="relative pl-3 sm:pl-4">
        <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-mist">{prompt.q}</p>
        <p
          className={`mt-2.5 font-display leading-[1.45] text-navy ${
            compact ? 'text-[17px]' : 'text-[19px] sm:text-[21px]'
          }`}
        >
          {prompt.a}
        </p>

        {onLike && (
          <div className="mt-4 flex justify-end transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <LikeButton
              active={liked}
              onClick={onLike}
              label={`Like ${person?.firstName ?? 'this'}'s answer`}
            />
          </div>
        )}
      </div>
    </article>
  )
}
