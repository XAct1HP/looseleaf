import { IconVerified } from '../ui/Icons'
import { UNIVERSITY } from '../../data/catalog'

/** Reads like a small sticker on the page. */
export default function UniversityBadge({ name = UNIVERSITY.short, size = 'md', className = '' }) {
  const sizes = {
    sm: 'text-[11.5px] px-2 py-0.5 gap-1',
    md: 'text-[12.5px] px-2.5 py-1 gap-1.5',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border border-notebook/60 bg-notebook-soft font-medium text-[#2F5C99] ${sizes[size]} ${className}`}
    >
      <IconVerified size={size === 'sm' ? 12 : 13} className="text-notebook-deep" />
      {name}
    </span>
  )
}
