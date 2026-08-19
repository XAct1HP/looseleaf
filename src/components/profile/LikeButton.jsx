import { HandHeart } from '../brand/Doodles'

/**
 * Attached directly to one photo or one prompt — you never like a whole
 * person, you like something about them.
 */
export default function LikeButton({ active = false, onClick, label = 'Like this', size = 'md', className = '' }) {
  const dims = size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`press focus-ring inline-flex ${dims} items-center justify-center rounded-full border transition-all duration-200 ${
        active
          ? 'border-coral bg-coral text-white shadow-[0_8px_18px_-8px_rgba(255,100,104,0.9)]'
          : 'border-rule bg-white/95 text-coral shadow-paper backdrop-blur hover:border-coral/40 hover:bg-coral-wash'
      } ${className}`}
    >
      <HandHeart size={size === 'lg' ? 22 : 19} filled={active} animate={active} className="text-current" />
    </button>
  )
}
