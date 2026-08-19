import { NavLink } from 'react-router-dom'
import { NAV } from './navItems'
import { useIncoming } from '../../state/store'

export default function MobileNav() {
  const incoming = useIncoming()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {NAV.map(({ to, mobileLabel, Icon, badge }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                `relative flex h-[58px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors ${
                  isActive ? 'text-coral' : 'text-mist'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <Icon size={23} filled={isActive && to === '/app/likes'} weight={isActive ? 2 : 1.7} />
                    {badge === 'likes' && incoming.length > 0 && (
                      <span className="absolute -right-1.5 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-coral px-1 text-[9px] font-bold text-white">
                        {incoming.length}
                      </span>
                    )}
                  </span>
                  {mobileLabel}
                  {isActive && (
                    <span className="absolute top-0 h-[2.5px] w-7 rounded-full bg-coral" aria-hidden="true" />
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
