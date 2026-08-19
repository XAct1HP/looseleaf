import { Underline } from '../brand/Doodles'

export default function PageHeader({ title, subtitle, action, underline = true, className = '' }) {
  return (
    <header className={`mb-6 flex items-end justify-between gap-4 ${className}`}>
      <div>
        <h1 className="relative inline-block font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] md:text-[32px]">
          {title}
          {underline && (
            <Underline className="absolute -bottom-1.5 left-0 text-coral/70" width={Math.min(200, String(title).length * 13)} />
          )}
        </h1>
        {subtitle && <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-graphite">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}
