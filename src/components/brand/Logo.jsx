/**
 * Looseleaf mark: a friendly sheet of loose-leaf paper — rounded corners,
 * three binder holes, faint blue rules, a pink margin, a hand-drawn coral
 * heart, and a folded lower corner.
 */
export function LeafMark({ size = 34, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* sheet with a folded lower-right corner */}
      <path
        d="M11 9a5 5 0 0 1 5-5h32a5 5 0 0 1 5 5v34.5L41.5 55H16a5 5 0 0 1-5-5V9Z"
        fill="#FFFDF8"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M53 43.5H46.5a5 5 0 0 0-5 5V55"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      {/* binder holes */}
      <circle cx="18.5" cy="15" r="2.1" fill="currentColor" />
      <circle cx="18.5" cy="29.5" r="2.1" fill="currentColor" />
      <circle cx="18.5" cy="44" r="2.1" fill="currentColor" />
      {/* margin rule */}
      <path d="M25.5 5.5v46" stroke="#DF62AD" strokeWidth="1.6" opacity=".75" />
      {/* notebook lines */}
      <path
        d="M30 17.5h17M30 24.5h17M30 45.5h8"
        stroke="#A9C8F5"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* hand-drawn heart */}
      <path
        d="M38.6 41.2c-4.6-3.5-7.3-5.9-7.3-8.7 0-2.2 1.8-3.9 3.9-3.9 1.3 0 2.5.6 3.3 1.6.8-1 2-1.6 3.3-1.6 2.1 0 3.9 1.7 3.9 3.9 0 2.8-2.6 5.2-7.1 8.7Z"
        fill="#FF6468"
      />
    </svg>
  )
}

export default function Logo({ size = 'md', className = '', mono = false }) {
  const dims = { sm: 24, md: 30, lg: 40, xl: 52 }[size] || 30
  const text = { sm: 'text-[17px]', md: 'text-[21px]', lg: 'text-[27px]', xl: 'text-[35px]' }[size]

  return (
    <span className={`inline-flex select-none items-center gap-2 ${className}`}>
      <LeafMark size={dims} className={mono ? 'text-current' : 'text-navy'} />
      <span
        className={`${text} font-display font-semibold lowercase leading-none tracking-[-0.02em] ${
          mono ? 'text-current' : 'text-navy'
        }`}
      >
        looseleaf
      </span>
    </span>
  )
}
