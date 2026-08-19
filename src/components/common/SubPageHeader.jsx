import { useNavigate } from 'react-router-dom'
import { IconBack } from '../ui/Icons'
import { Underline } from '../brand/Doodles'

export default function SubPageHeader({ title, subtitle, backTo = '/app/campus', action }) {
  const navigate = useNavigate()
  return (
    <header className="mb-7">
      <button
        onClick={() => navigate(backTo)}
        className="press focus-ring -ml-2 mb-4 flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[14px] font-medium text-graphite hover:text-navy"
      >
        <IconBack size={18} />
        Campus
      </button>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="relative inline-block font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] md:text-[32px]">
            {title}
            <Underline className="absolute -bottom-1.5 left-0 text-coral/60" width={Math.min(200, title.length * 13)} />
          </h1>
          {subtitle && <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-graphite">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  )
}
