import { useEffect, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import Logo from '../brand/Logo'
import { NAV } from './navItems'
import { PersonAvatar } from '../brand/Portrait'
import { IconSettings, IconBell, IconShield, IconFlag, IconCalendar } from '../ui/Icons'
import { useIncoming, useStore, useUnreadCount } from '../../state/store'
import * as staff from '../../services/staff'

const linkClass = ({ isActive }) =>
  `group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[15px] font-medium transition-colors ${
    isActive ? 'bg-cream text-navy' : 'text-graphite hover:bg-navy/[0.035] hover:text-navy'
  }`

const smallLinkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[14px] font-medium transition-colors ${
    isActive ? 'bg-cream text-navy' : 'text-graphite hover:bg-navy/[0.035] hover:text-navy'
  }`

/**
 * Staff see exactly the same five tabs as everyone else. Backstage sits below
 * a divider, visually separate, and never bleeds into the product.
 */
function BackstageSection() {
  const [counts, setCounts] = useState({ reports: 0, events: 0 })

  useEffect(() => {
    let live = true
    staff
      .overview(1)
      .then((d) => live && setCounts({ reports: d.open_reports ?? 0, events: d.pending_events ?? 0 }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const Badge = ({ n }) =>
    n > 0 ? (
      <span className="rounded-full bg-coral px-2 py-0.5 text-[11px] font-bold text-white">{n}</span>
    ) : null

  return (
    <div className="mt-5 border-t border-rule pt-4">
      <p className="mb-1 px-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-mist">Backstage</p>
      <ul className="space-y-0.5">
        <li>
          <NavLink to="/app/backstage" end className={smallLinkClass}>
            <IconShield size={19} className="text-mist" />
            Overview
          </NavLink>
        </li>
        <li>
          <NavLink to="/app/backstage/reports" className={smallLinkClass}>
            <IconFlag size={19} className="text-mist" />
            <span className="flex-1">Reports</span>
            <Badge n={counts.reports} />
          </NavLink>
        </li>
        <li>
          <NavLink to="/app/backstage/events" className={smallLinkClass}>
            <IconCalendar size={19} className="text-mist" />
            <span className="flex-1">Event queue</span>
            <Badge n={counts.events} />
          </NavLink>
        </li>
      </ul>
    </div>
  )
}

export default function DesktopSidebar() {
  const { state } = useStore()
  const incoming = useIncoming()
  const unread = useUnreadCount()
  const isStaff = Boolean(state.me?.isAdmin)

  return (
    <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col overflow-y-auto border-r border-rule bg-paper px-4 py-6 md:flex lg:w-[262px]">
      <Link to="/app/discover" className="focus-ring mb-8 ml-2 rounded-lg">
        <Logo size="md" />
      </Link>

      <nav aria-label="Primary">
        <ul className="space-y-1">
          {NAV.map(({ to, label, Icon, badge }) => (
            <li key={to}>
              <NavLink to={to} className={linkClass}>
                {({ isActive }) => (
                  <>
                    <Icon
                      size={22}
                      className={isActive ? 'text-coral' : 'text-mist group-hover:text-graphite'}
                      filled={isActive && to === '/app/likes'}
                    />
                    <span className="flex-1">{label}</span>
                    {badge === 'likes' && incoming.length > 0 && (
                      <span className="rounded-full bg-coral px-2 py-0.5 text-[11px] font-bold text-white">
                        {incoming.length}
                      </span>
                    )}
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-coral" aria-hidden="true" />}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {isStaff && <BackstageSection />}

      <div className="mt-auto space-y-1 border-t border-rule pt-4">
        <NavLink to="/app/notifications" className={smallLinkClass}>
          <IconBell size={20} className="text-mist" />
          <span className="flex-1">Notifications</span>
          {unread > 0 && <span className="h-2 w-2 rounded-full bg-coral" aria-hidden="true" />}
        </NavLink>

        <NavLink to="/app/settings" className={smallLinkClass}>
          <IconSettings size={20} className="text-mist" />
          Settings
        </NavLink>

        <Link
          to="/app/profile"
          className="mt-2 flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-navy/[0.035]"
        >
          <PersonAvatar id={state.me?.id ?? 'me'} size={36} />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium text-navy">{state.me?.firstName}</span>
            <span className="block truncate text-[12px] text-mist">
              {state.paused ? 'Paused' : `${state.me?.major} '${state.me?.gradYear}`}
            </span>
          </span>
        </Link>
      </div>
    </aside>
  )
}
