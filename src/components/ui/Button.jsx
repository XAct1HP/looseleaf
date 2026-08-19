import { Link } from 'react-router-dom'

const VARIANTS = {
  primary:
    'bg-navy text-paper hover:bg-navy-soft shadow-[0_10px_20px_-12px_rgba(17,28,56,0.6)]',
  coral:
    'bg-coral text-white hover:bg-coral-deep shadow-[0_10px_22px_-12px_rgba(255,100,104,0.9)]',
  soft: 'bg-cream text-navy hover:bg-[#FBEDDD] border border-rule',
  outline: 'bg-white text-navy border border-navy/15 hover:border-navy/30 hover:bg-white',
  ghost: 'bg-transparent text-graphite hover:text-navy hover:bg-navy/[0.04]',
  danger: 'bg-white text-coral-deep border border-coral/35 hover:bg-coral-wash',
}

const SIZES = {
  sm: 'h-9 px-3.5 text-[13px] rounded-xl gap-1.5',
  md: 'h-11 px-5 text-[14.5px] rounded-2xl gap-2',
  lg: 'h-[52px] px-6 text-[15.5px] rounded-2xl gap-2',
}

export default function Button({
  as,
  to,
  href,
  variant = 'primary',
  size = 'md',
  full = false,
  className = '',
  children,
  ...props
}) {
  const cls = `press focus-ring inline-flex select-none items-center justify-center font-medium tracking-[-0.01em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
    VARIANTS[variant]
  } ${SIZES[size]} ${full ? 'w-full' : ''} ${className}`

  if (to) {
    return (
      <Link to={to} className={cls} {...props}>
        {children}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className={cls} {...props}>
        {children}
      </a>
    )
  }
  const Tag = as || 'button'
  return (
    <Tag className={cls} {...props}>
      {children}
    </Tag>
  )
}

export function IconButton({ label, children, className = '', tone = 'default', ...props }) {
  const tones = {
    default: 'text-graphite hover:text-navy hover:bg-navy/[0.05]',
    coral: 'text-coral hover:bg-coral-soft',
    plain: 'text-navy hover:bg-navy/[0.05]',
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`press focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
