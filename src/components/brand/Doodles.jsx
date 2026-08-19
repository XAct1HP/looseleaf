/**
 * NotebookDoodle — small hand-drawn accents. Used sparingly, never as
 * decoration that competes with content.
 */

export function Underline({ className = 'text-coral', width = 120 }) {
  return (
    <svg
      viewBox="0 0 120 10"
      width={width}
      height={10}
      fill="none"
      className={`pointer-events-none ${className}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M2 7.2c14-3 33-4.6 58-4.6s39 1.4 58 3.4"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity=".85"
      />
    </svg>
  )
}

export function Squiggle({ className = 'text-notebook-deep', width = 64 }) {
  return (
    <svg viewBox="0 0 64 12" width={width} height={12} fill="none" className={className} aria-hidden="true">
      <path
        d="M2 8c4-6 8 6 12 0s8 6 12 0 8 6 12 0 8 6 12 0 8 6 12 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Star({ className = 'text-coral', size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2.5c.7 4.6 2.2 6.1 6.8 6.8-4.6.7-6.1 2.2-6.8 6.8-.7-4.6-2.2-6.1-6.8-6.8 4.6-.7 6.1-2.2 6.8-6.8Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function HandHeart({ className = 'text-coral', size = 20, filled = true, animate = false }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className} aria-hidden="true">
      <path
        d="M12 20.2C6.2 15.9 3 12.9 3 9.4 3 6.6 5.2 4.5 8 4.5c1.7 0 3.2.8 4 2 .8-1.2 2.3-2 4-2 2.8 0 5 2.1 5 4.9 0 3.5-3.2 6.5-9 10.8Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeDasharray={animate ? 120 : undefined}
        className={animate ? 'animate-draw-heart origin-center' : undefined}
      />
    </svg>
  )
}

export function PaperPlane({ className = 'text-navy/70', size = 84 }) {
  return (
    <svg viewBox="0 0 120 90" width={size} height={size * 0.75} fill="none" className={className} aria-hidden="true">
      <path
        d="M8 46 108 12 78 78 60 56 8 46Z"
        fill="#FFF6EB"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M108 12 60 56M60 56v18l14-12" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path
        d="M6 70c10-8 22-13 34-15M14 84c8-6 16-10 24-12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".35"
      />
    </svg>
  )
}

export function CoffeeDoodle({ className = 'text-navy/70', size = 80 }) {
  return (
    <svg viewBox="0 0 100 90" width={size} height={size * 0.9} fill="none" className={className} aria-hidden="true">
      <path d="M22 34h48v26a16 16 0 0 1-16 16H38a16 16 0 0 1-16-16V34Z" fill="#FFF6EB" stroke="currentColor" strokeWidth="2.4" />
      <path d="M70 40h8a9 9 0 0 1 0 18h-8" stroke="currentColor" strokeWidth="2.4" />
      <path d="M36 22c0-5 6-5 6-10M50 22c0-5 6-5 6-10" stroke="#FF6468" strokeWidth="2.2" strokeLinecap="round" opacity=".7" />
      <path d="M18 82h64" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity=".4" />
    </svg>
  )
}

export function SheetDoodle({ className = 'text-navy/60', size = 82 }) {
  return (
    <svg viewBox="0 0 90 100" width={size} height={size * 1.1} fill="none" className={className} aria-hidden="true">
      <path
        d="M12 12a6 6 0 0 1 6-6h44a6 6 0 0 1 6 6v58L48 88H18a6 6 0 0 1-6-6V12Z"
        fill="#FFFDF8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M68 70H54a6 6 0 0 0-6 6v12" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M26 28h30M26 40h30M26 52h20" stroke="#A9C8F5" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="20" cy="22" r="1.8" fill="currentColor" opacity=".5" />
      <circle cx="20" cy="44" r="1.8" fill="currentColor" opacity=".5" />
      <circle cx="20" cy="66" r="1.8" fill="currentColor" opacity=".5" />
    </svg>
  )
}

export function Sparkles({ className = '' }) {
  return (
    <span className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      <Star className="absolute -left-3 top-6 animate-twinkle text-coral" size={16} />
      <Star className="absolute right-2 top-0 animate-twinkle text-margin [animation-delay:400ms]" size={20} />
      <Star className="absolute -right-4 bottom-10 animate-twinkle text-notebook-deep [animation-delay:800ms]" size={14} />
      <Star className="absolute left-4 -bottom-2 animate-twinkle text-coral [animation-delay:1200ms]" size={12} />
    </span>
  )
}

/** Three binder holes, for the left edge of sheet-like panels. */
export function BinderHoles({ className = '', count = 3 }) {
  return (
    <span className={`pointer-events-none flex flex-col justify-around ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="block h-2.5 w-2.5 rounded-full bg-navy/[0.07] shadow-[inset_0_1px_1px_rgba(17,28,56,0.12)]" />
      ))}
    </span>
  )
}

export default { Underline, Squiggle, Star, HandHeart, PaperPlane, CoffeeDoodle, SheetDoodle, Sparkles, BinderHoles }
