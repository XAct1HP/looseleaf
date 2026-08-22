/**
 * The "for Partners" suffix beside the wordmark.
 *
 * Its own file because both the public shell and the dashboard header use it,
 * and importing it from either would make the two import each other.
 *
 * The nudge: the leaf mark is a tall box, but "looseleaf" sits on a baseline
 * a few pixels below its middle. A label vertically centred against the mark
 * therefore reads as floating above the word it's attached to. These offsets
 * put it back on the word, and scale with the logo.
 */
const NUDGE = { sm: 'mt-[2px]', md: 'mt-[4px]', lg: 'mt-[6px]' }

export default function ForPartners({ size = 'sm', className = '' }) {
  const nudge = NUDGE[size] ?? NUDGE.sm
  const text = size === 'md' ? 'text-[13.5px]' : 'text-[13px]'

  // Shown at every width now. It used to be hidden on a phone because two
  // buttons and a wordmark could not share 390px; with those buttons behind a
  // menu there is room, and a restaurant owner on a phone should be able to
  // tell at a glance which of the two Loose Leafs they are looking at.
  return (
    <span className={`flex items-center gap-2.5 ${nudge} ${className}`}>
      <span className="h-4 w-px bg-rule" />
      <span className={`${text} font-medium leading-none text-graphite`}>for Partners</span>
    </span>
  )
}
