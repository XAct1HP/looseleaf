import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Logo from '../../components/brand/Logo'
import Button from '../../components/ui/Button'
import {
  IconPin, IconSpark, IconScan, IconTicket, IconEye, IconLock,
  IconSettings, IconDiscover, IconPeople,
} from '../../components/ui/Icons'
import { usePartnerAccount } from '../../state/partnerAccount'
import { can, billingNotice } from '../../lib/partnerBilling'
import * as partners from '../../services/partners'
import * as auth from '../../services/live/auth'
import ForPartners from '../../components/partners/ForPartners'
import { InstallLink } from '../../components/partners/InstallNudge'
import { registerScannerWorker } from '../../lib/pwa'
import { loginWithNext } from '../../lib/partnerNext'
import { PartnerOffline } from './PartnerAuth'

/**
 * ── The Partner Dashboard shell ─────────────────────────────────────────────
 *
 * Warm, not enterprise. A restaurant manager checking this on a phone between
 * covers should recognise it as the same Loose Leaf their customers use.
 *
 * Two filters decide what's in the nav, and they answer different questions:
 *
 *   `page`   what *this person* may reach. Decided by partner_can() in the
 *            database, so a hidden tab is a locked door and not a curtain —
 *            typing the URL gets you a redirect, and the RPC behind it would
 *            refuse anyway.
 *   `needs`  what the *business* has switched on. Since pay-per-redemption
 *            every entitlement is true for everybody, so this filter is
 *            currently inert — kept because it is the seam that would turn a
 *            feature off for a class of partner without a deploy.
 *
 * Those two must not be allowed to multiply into nothing, which is the bug
 * this shell used to have: `scan` is the only page a staff member has, `scan`
 * required the Date Passes entitlement, and so on any plan below the top one a
 * member of waiting staff signed in to a screen saying there was nothing here
 * for them. What the business hasn't bought yet is not the same fact as what
 * this person is allowed to do, and it must never be *reported* as the second
 * one. So:
 *
 *   · `scan` carries no `needs` at all. Somebody granted the scanner always
 *     has the scanner; the page itself says so if there are no passes to scan.
 *   · the entitlement filter may hide pages but may never hide the last one.
 *     If it empties the list, the permission list stands and the pages explain
 *     themselves.
 *
 * When somebody can reach exactly one page, the nav is noise. A staff login
 * gets the scanner and nothing to navigate — see ScannerOnlyShell.
 */

const NAV = [
  { page: 'overview', to: '/partners/dashboard', label: 'Overview', Icon: IconDiscover, end: true },
  { page: 'spot', to: '/partners/dashboard/spot', label: 'Date Spot', Icon: IconPin },
  { page: 'offers', to: '/partners/dashboard/offers', label: 'Offers', Icon: IconSpark, needs: 'offers' },
  { page: 'scan', to: '/partners/dashboard/scan', label: 'Scan a pass', Icon: IconScan },
  { page: 'redemptions', to: '/partners/dashboard/redemptions', label: 'Redemptions', Icon: IconTicket, needs: 'redemption' },
  { page: 'analytics', to: '/partners/dashboard/analytics', label: 'Analytics', Icon: IconEye },
  { page: 'team', to: '/partners/dashboard/team', label: 'Team', Icon: IconPeople },
  { page: 'billing', to: '/partners/dashboard/billing', label: 'Billing', Icon: IconLock },
  { page: 'settings', to: '/partners/dashboard/settings', label: 'Settings', Icon: IconSettings },
]

/** Which nav entry a path belongs to, so a guard can ask "may they be here?". */
function pageForPath(pathname) {
  const rest = pathname.replace(/^\/partners\/dashboard\/?/, '').split('/')[0]
  return rest === '' ? 'overview' : rest
}

export default function DashboardLayout() {
  const { status, partner, partners: list, entitlements, select } = usePartnerAccount()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()

  // The manifest swap itself is route-level now (see ManifestForRoute in
  // App.jsx) — doing it here missed /partners/login, which is precisely where
  // somebody is standing when they add "the scanner" to their home screen.
  // What stays here is the worker, registered from the partner chunk so a
  // student never installs one at all.
  useEffect(() => {
    registerScannerWorker()
  }, [])

  // "Signed out" and "signed in with no business" are different answers and
  // lead different places. Only the second one is an invitation to onboard.
  useEffect(() => {
    if (status === 'ready' && list.length === 0) navigate('/partners/onboarding', { replace: true })
  }, [status, list.length, navigate])

  // What they may reach, then what the plan actually turns on — and never
  // both at once to the point of nothing. See the note above NAV.
  const allowed = partner ? NAV.filter((n) => (partner.pages ?? []).includes(n.page)) : []
  const bought = allowed.filter((n) => !n.needs || can(entitlements, n.needs))
  const items = bought.length ? bought : allowed

  // ── Why the ceiling is read here and not only on Billing ────────────────
  //
  // `billingNotice()` has always known how to say "new Date Passes are paused,
  // you're at your limit" — but it was rendered on the Billing page alone, so
  // the only person who ever saw it was somebody who had already gone looking.
  // A partner whose offer has quietly stopped being recommended has no reason
  // to suspect billing; they'd sooner assume Loose Leaf is empty. It belongs
  // on every page they might be standing on.
  //
  // Only fetched for people who hold the billing page. `partner_billing_summary`
  // refuses everybody else — correctly, since a shift worker has no business
  // reading their employer's payment history — and telling them about an
  // invoice they cannot pay is noise they can do nothing about.
  const canBill = (partner?.pages ?? []).includes('billing')
  const [billing, setBilling] = useState(null)
  useEffect(() => {
    if (!partner || !canBill) return undefined
    let live = true
    partners
      .billingSummary(partner.id)
      .then((b) => live && setBilling(b))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [partner, canBill])

  const home = items[0]?.to ?? '/partners/dashboard/scan'
  const allowedHere = items.some((n) => n.page === pageForPath(pathname))

  // Somebody who lands on a page they can't reach is moved to their own first
  // page rather than shown an error — for a staff login the dashboard root is
  // simply not where they live.
  useEffect(() => {
    if (status !== 'ready' || !partner || !items.length) return
    if (!allowedHere) navigate(home, { replace: true })
  }, [status, partner, items.length, allowedHere, home, navigate])

  if (!partners.partnersEnabled) return <PartnerOffline />
  if (status === 'loading') return <Booting />
  // ── Carry the destination across the login ──────────────────────────────
  //
  // This used to be a bare `/partners/login`, which threw the query string
  // away — and the query string is sometimes the whole point. A Date Pass QR
  // encodes `…/scan?code=LL-XXXX-XXXX`, so a staff phone that happened to be
  // signed out sent its owner to a login screen and then to an empty scanner,
  // with the customer still holding the pass they had just scanned.
  //
  // `loginWithNext` refuses anything that isn't a dashboard path of ours, so
  // this cannot become a redirect somebody else writes.
  if (status === 'anon') return <Navigate to={loginWithNext(pathname + search)} replace />
  if (status === 'error') return <Navigate to={loginWithNext(pathname + search)} replace />
  if (!partner) return <Booting />

  if (!items.length) return <NoAccess partner={partner} />
  if (items.length === 1) return <ScannerOnlyShell partner={partner} />

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-40 border-b border-rule/70 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link to={home} className="focus-ring flex items-center gap-2.5 rounded-lg">
            <Logo size="sm" />
            <ForPartners />
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
            <LogOut />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1240px] gap-8 px-4 py-6 sm:px-6 md:py-9">
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

          <StatusBanner partner={partner} billing={billing} />
          <Outlet />
        </main>
      </div>

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

/**
 * ── The staff experience ────────────────────────────────────────────────────
 *
 * Somebody whose whole job here is redeeming passes gets a phone-shaped
 * screen: the business name, the scanner, a way out. No tab bar to mis-tap
 * mid-shift, no sidebar taking a third of a 390px screen, and nothing to
 * wonder whether they're allowed to press.
 */
function ScannerOnlyShell({ partner }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      <header className="sticky top-0 z-40 border-b border-rule/70 bg-paper/90 backdrop-blur-md">
        <div
          className="mx-auto flex max-w-[560px] items-center gap-3 px-4 py-3"
          style={{ paddingTop: 'calc(var(--safe-top) + 0.65rem)' }}
        >
          <Logo size="sm" />
          {/* The name and the button are given the same box height and type
              size rather than being left to `items-center` — centring two
              boxes of different heights lines up the boxes, not the words in
              them, which is why the business name used to sit a couple of
              pixels above "Log out". */}
          {/* The one permanent way a member of staff can reach the install
              steps. It cannot live in Settings, which is where this would
              normally go: `partner_can()` refuses `settings` before it even
              reads the column, so staff — the people who most need the app on
              their phone — can never open that page. */}
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden max-w-[20ch] truncate px-2 py-2 text-[13.5px] font-medium leading-[20px] text-graphite sm:block">
              {partner.name}
            </span>
            <InstallLink className="px-3 py-2">
              <span className="hidden sm:inline">Add to home screen</span>
              <span className="sm:hidden">Install</span>
            </InstallLink>
            <LogOut />
          </div>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-[560px] flex-1 px-4 pt-5"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 1.5rem)' }}
      >
        <p className="mb-4 truncate text-[15px] font-medium text-navy sm:hidden">{partner.name}</p>
        <Outlet />
      </main>
    </div>
  )
}

/**
 * Nothing takes the scanner away any more, but the rule below still holds —
 * that can leave a staff login with nowhere to go. Better to say so than to
 * bounce them around an empty dashboard.
 */
function NoAccess({ partner }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
      <Logo size="md" />
      <h1 className="mt-8 font-display text-[24px] font-semibold leading-tight">
        We can’t open your dashboard.
      </h1>
      <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-graphite">
        Something is wrong with how your account at {partner.name} is set up — every member should
        at least be able to scan a pass. Whoever runs the account can put it right in Settings; if
        it looks fine to them, this is our bug and not yours.
      </p>
      <div className="mt-7">
        <LogOut />
      </div>
    </div>
  )
}

function LogOut() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={async () => {
        await auth.signOut()
        navigate('/partners', { replace: true })
      }}
      className="focus-ring rounded-xl px-3 py-2 text-[13.5px] font-medium leading-[20px] text-graphite hover:text-navy"
    >
      Log out
    </button>
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
 * never have to work out from a status word why nobody can see them. Only
 * shown to people who can act on it; telling a shift worker that the card
 * bounced is noise they can do nothing about.
 */
function StatusBanner({ partner, billing }) {
  const canBill = (partner.pages ?? []).includes('billing')
  const billingBroken = ['past_due', 'unpaid'].includes(partner.subStatus)
  // No Stripe customer at all means nobody has ever added a card. That is a
  // perfectly normal state to sit in for weeks — a business can be listed,
  // photographed and recommended without one — so this reads as a next step
  // rather than as something being wrong.
  const noCard = !partner.subStatus || partner.subStatus === 'incomplete'

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
  // Under pay-per-redemption a failed payment does *not* pull the listing.
  // The Date Spot was free; what stops is Date Passes. Saying "you're hidden
  // from students" here when they aren't would be a lie that costs Loose Leaf
  // nothing and costs the partner a panic.
  if (billingBroken && canBill) {
    return (
      <Note
        tone="coral"
        title="Your payment didn’t go through."
        action={{ to: '/partners/dashboard/billing', label: 'Fix billing' }}
      >
        Date Passes are paused until it clears. Your Date Spot is still live and students can
        still find you — nothing else has been lost.
      </Note>
    )
  }
  // ── The ceiling, said where they are ────────────────────────────────────
  //
  // Ordered after the moderation states and the failed payment, and before
  // "add a card", because those are all more basic facts about the account
  // than how much headroom is left in it. Reuses `billingNotice()` rather
  // than writing a second set of words for the same three situations — two
  // copies of a sentence about somebody's money is how they end up
  // disagreeing.
  //
  // Only the ones that need acting on. `billingNotice` also returns a
  // perfectly cheerful "you're fine" state for a healthy account, and a
  // banner that appears on every page to say nothing is wrong is a banner
  // people learn to look past — including on the day it says something else.
  const credit = canBill ? billingNotice(billing) : null
  if (credit && ['bad', 'warn'].includes(credit.tone)) {
    return (
      <Note
        tone={credit.tone === 'bad' ? 'coral' : 'amber'}
        title={credit.title}
        action={{ to: '/partners/dashboard/billing', label: credit.cta }}
      >
        {credit.body}
      </Note>
    )
  }

  if (noCard && canBill) {
    return (
      <Note
        tone="blue"
        title="Add a card when you’re ready to run an offer."
        action={{ to: '/partners/dashboard/billing', label: 'Add a card' }}
      >
        Nothing is charged for having one, and nothing at all until somebody actually redeems a
        Date Pass. Everything else here works without it.
      </Note>
    )
  }
  return null
}

function Note({ tone, title, children, action }) {
  const tones = {
    coral: 'border-coral/30 bg-coral-wash text-coral-deep',
    blue: 'border-notebook/50 bg-notebook-soft text-[#2F5C99]',
    // Its own tone rather than borrowing blue. "You have about four
    // redemptions of headroom" is not news and it is not an emergency — it
    // is the one in between, and the two neighbours already had colours.
    amber: 'border-[#C9821F]/30 bg-[#FBF3E4] text-[#7A5210]',
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
