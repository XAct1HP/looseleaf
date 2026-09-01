import { interestById } from '../../data/catalog'

export function Chip({ children, tone = 'default', className = '', ...props }) {
  const tones = {
    default: 'bg-white border-rule text-graphite',
    cream: 'bg-cream border-[#F2E6D6] text-navy',
    coral: 'bg-coral-soft border-coral/25 text-coral-deep',
    blue: 'bg-notebook-soft border-notebook/50 text-[#2F5C99]',
    pink: 'bg-margin-soft border-margin/30 text-[#A93E7F]',
    moss: 'bg-moss-soft border-moss/30 text-[#3F7454]',
    navy: 'bg-navy text-paper border-navy',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium leading-none ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}

/**
 * InterestChip — tinted coral when it's something you both picked.
 *
 * The tint is the whole signal. It used to also append the word "both" to
 * every shared chip, which meant a profile with nine shared interests said
 * "both" nine times, and — because previewing your own profile compares you to
 * yourself — said it on *every* chip there. Whatever groups these now
 * (`InterestGroups`) says it once, in a heading.
 */
export function InterestChip({ id, shared = false, className = '' }) {
  const interest = interestById(id) || { label: id, emoji: '·' }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium leading-none transition-colors ${
        shared
          ? 'border-coral/30 bg-coral-soft text-coral-deep'
          : 'border-rule bg-white text-graphite'
      } ${className}`}
    >
      <span aria-hidden="true" className="text-[13px]">
        {interest.emoji}
      </span>
      {interest.label}
    </span>
  )
}

/** A selectable chip used across onboarding and filters. */
export function SelectChip({ selected, children, className = '', ...props }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`press focus-ring inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[14px] font-medium transition-all ${
        selected
          ? 'border-navy bg-navy text-paper'
          : 'border-rule bg-white text-graphite hover:border-navy/25 hover:text-navy'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
