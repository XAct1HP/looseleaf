import { useEffect } from 'react'
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import Logo from '../../components/brand/Logo'
import Button from '../../components/ui/Button'
import { IconPin, IconSpark, IconCalendar, IconEye, IconLock, IconSettings, IconDiscover } from '../../components/ui/Icons'
import { usePartnerAccount } from '../../state/partnerAccount'
import { can } from '../../lib/partnerPlans'
import * as partners from '../../services/partners'
import * as auth from '../../services/live/auth'
import { PartnerOffline } from './PartnerAuth'

/**
 * ── The Partner Dashboard shell ─────────────────────────────────────────────
 *
 * Warm, not enterprise. A restaurant manager checking this on a phone between
 * covers should recognise it as the same Loose Leaf their customers use, and
 * should be able to find the scanner in one tap — so Scan is a nav item, not
 * something buried inside Redemptions.
 *
 * Nav items appear or don't based on the plan's entitlements, never on a plan
 * id. A tier that doesn't include Date Passes simply has no Scan tab.
 */

const NAV = [
  { to: '/partners/dashboard', label: 'Overview', Icon: IconDiscover, end: true },
  { to: '/partners/dashboard/spot', label: 'Date Spot', Icon: IconPin },
  { to: '/partners/dashboard/offers', label: 'Offers', Icon: IconSpark, needs: 'offers' },
  { to: '/partners/dashboard/scan', label: 'Scan a pass', Icon: IconCalendar, needs: 'redemption' },
  { to: '/partners/dashboard/redemptions', label: 'Redemptions', Icon: IconCalendar, needs: 'redemption' },
  { to: '/partners/dashboard/analytics', label: 'Analytics', Icon: IconEye },
  { to: '/partners/dashboard/billing', label: 'Billing', Icon: IconLock },
  { to: '/partners/dashboard/settings', label: 'Settings', Icon: IconSettings },
]

export default function DashboardLayout() {
  const { status, partner, partners: list, entitlements, select } = usePartnerAccount()
  const navigate = useNavigate()

  useEffect(() => {
    if (status === 'ready' && list.length === 0) navigate('/partners/onboarding', { replace: true })
  }, [status, list.length, navigate])

  if (!partners.partnersEnabled) return <PartnerOffline />
  if (status === 'loading') return <Booting />
  if (status === 'error') return <Navigate to="/partners/login" replace />
  if (!partner) return <Booting />

  const items = NAV.filter((n) => !n.needs || can(entitlements, n.needs))

  return (
    <div className="min-h-screen bg-paper">
      {/* top bar */}
      <header className="sticky top-0 z-40 border-b border-rule/70 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/partners/dashboard" className="focus-ring flex items-center gap-2.5 rounded-lg">
            <Logo size="sm" />
            <span className="hidden h-4 w-px bg-rule sm:block" />
            <span className="hidden text-[13px] font-medium text-graphite sm:block">for Partners</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {list.length > 1 && (
              <select
                value={partner.id}
                onChange={(e) => select(e.target.value)}
                aria-label="Choose a business"
                className="rounded-xl border border-rule bg-white px-3 py-2 text-[13.5px] text-navy focus:outline-none"
              >
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={async () => {
                await auth.signOut()
                navigate('/partners', { replace: true })
              }}
              className="focus-ring rounded-xl px-3 py-2 text-[13.5px] font-medium text-graphite hover:text-navy"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1240px] gap-8 px-4 py-6 sm:px-6 md:py-9">
        {/* desktop nav */}
        <nav className="hidden w-[212px] shrink-0 md:block">
          <p className="mb-1 px-3 font-display text-[17px] font-semibold leading-tight text-navy">
            {partner.name}
          </p>
          <StatusPill partner={partner} className="mx-3 mb-5" />

          <ul className="space-y-0.5">
            {items.map(({ to, label, Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[14.5px] font-medium transition-colors ${
                      isActive ? 'bg-cream text-navy' : 'text-graphite hover:bg-navy/[0.04] hover:text-navy'
                    }`
                  }
                >
                  <Icon size={19} />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 pb-24 md:pb-0">
          <div className="mb-5 md:hidden">
            <p className="font-display text-[20px] font-semibold leading-tight text-navy">{partner.name}</p>
            <StatusPill partner={partner} className="mt-2" />
          </div>

          <StatusBanner partner={partner} />
          <Outlet />
        </main>
      </div>

      {/* mobile nav — a manager on the floor needs Scan in one tap */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <ul className="hide-scrollbar flex overflow-x-auto">
          {items.map(({ to, label, Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-w-[74px] flex-col items-center gap-1 px-2 py-2.5 text-[10.5px] font-medium transition-colors ${
                    isActive ? 'text-coral' : 'text-mist'
                  }`
                }
              >
                <Icon size={20} />
                <span className="whitespace-nowrap">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

function Booting() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="animate-pulse">
        <Logo size="lg" />
      </div>
    </div>
  )
}

const STATUS_TONE = {
  draft: ['bg-cream text-graphite border-rule', 'Draft'],
  pending: ['bg-notebook-soft text-[#2F5C99] border-notebook/50', 'Pending review'],
  active: ['bg-moss-soft text-[#3F7454] border-moss/30', 'Live'],
  paused: ['bg-cream text-graphite border-rule', 'Paused'],
  rejected: ['bg-coral-wash text-coral-deep border-coral/30', 'Not approved'],
  suspended: ['bg-coral-wash text-coral-deep border-coral/30', 'Suspended'],
}

export function StatusPill({ partner, className = '' }) {
  const [tone, label] = STATUS_TONE[partner.status] ?? STATUS_TONE.draft
  const live = partner.isLive
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${tone} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-moss' : 'bg-current opacity-50'}`} />
      {live ? 'Live to students' : label}
    </span>
  )
}

/**
 * The one banner. It says what is wrong and what to press — a partner should
 * never have to work out from a status word why nobody can see them.
 */
function StatusBanner({ partner }) {
  const billingBroken = ['past_due', 'unpaid', 'incomplete'].includes(partner.subStatus)
  const noPlan = !partner.subStatus

  if (partner.status === 'rejected') {
    return (
      <Note tone="coral" title="We couldn’t approve this yet.">
        {partner.reviewNote || 'Have a look at your details and resubmit — reply to our email if anything is unclear.'}
      </Note>
    )
  }
  if (partner.status === 'suspended') {
    return (
      <Note tone="coral" title="This account is suspended.">
        Your Date Spot isn’t being shown to students. Get in touch and we’ll sort it out.
      </Note>
    )
  }
  if (partner.status === 'pending') {
    return (
      <Note tone="blue" title="With us for review.">
        A person at Loose Leaf reads every application, usually within a day or two. Everything below
        works in the meantime — students just can’t see you yet.
      </Note>
    )
  }
  if (billingBroken) {
    return (
      <Note tone="coral" title="Your payment didn’t go through." action={{ to: '/partners/dashboard/billing', label: 'Fix billing' }}>
        Your Date Spot is hidden from students until this is sorted. Nothing else has been lost.
      </Note>
    )
  }
  if (noPlan) {
    return (
      <Note tone="blue" title="One thing left: pick a plan." action={{ to: '/partners/dashboard/billing', label: 'Choose a plan' }}>
        Your profile is saved. Students will see it once billing is set up and we’ve approved you.
      </Note>
    )
  }
  if (partner.cancelAtEnd) {
    return (
      <Note tone="blue" title="Set to cancel." action={{ to: '/partners/dashboard/billing', label: 'Manage billing' }}>
        You’ll stay live until the end of the current period.
      </Note>
    )
  }
  return null
}

function Note({ tone, title, children, action }) {
  const tones = {
    coral: 'border-coral/30 bg-coral-wash text-coral-deep',
    blue: 'border-notebook/50 bg-notebook-soft text-[#2F5C99]',
  }
  return (
    <div className={`mb-6 flex flex-wrap items-start gap-4 rounded-card border px-5 py-4 ${tones[tone]}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold">{title}</p>
        <p className="mt-1 text-[13.5px] leading-relaxed opacity-90">{children}</p>
      </div>
      {action && (
        <Button to={action.to} variant="outline" size="sm" className="shrink-0">
          {action.label}
        </Button>
      )}
    </div>
  )
}

export function PageHead({ title, subtitle, action }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] md:text-[30px]">
          {title}
        </h1>
        {subtitle && <p className="mt-2.5 max-w-[58ch] text-[14.5px] leading-relaxed text-graphite">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}
