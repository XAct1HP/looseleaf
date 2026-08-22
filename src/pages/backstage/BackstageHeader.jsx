import { Link, useLocation } from 'react-router-dom'
import { IconBack } from '../../components/ui/Icons'

const TABS = [
  { to: '/app/backstage', label: 'Overview', end: true },
  { to: '/app/backstage/reports', label: 'Reports' },
  { to: '/app/backstage/events', label: 'Events' },
  { to: '/app/backstage/partners', label: 'Partners' },
]

/**
 * Backstage looks deliberately unlike the product: a dark strip, sans figures,
 * no doodles. You should always know which mode you're in.
 */
export default function BackstageHeader({ title, subtitle, action, back }) {
  const { pathname } = useLocation()

  return (
    <header className="mb-7">
      {back && (
        <Link
          to={back}
          className="press focus-ring -ml-2 mb-4 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[14px] font-medium text-graphite hover:text-navy"
        >
          <IconBack size={18} />
          Backstage
        </Link>
      )}

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-1.5 inline-flex items-center gap-2 rounded-full bg-navy px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-paper">
            Backstage
          </p>
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] md:text-[32px]">
            {title}
          </h1>
          {subtitle && <p className="mt-2.5 max-w-md text-[14.5px] leading-relaxed text-graphite">{subtitle}</p>}
        </div>
        {action}
      </div>

      <nav className="hide-scrollbar mt-6 flex gap-1 overflow-x-auto border-b border-rule">
        {TABS.map((t) => {
          const active = t.end ? pathname === t.to : pathname.startsWith(t.to)
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-[14px] font-medium transition-colors ${
                active
                  ? 'border-coral text-navy'
                  : 'border-transparent text-graphite hover:border-navy/20 hover:text-navy'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
