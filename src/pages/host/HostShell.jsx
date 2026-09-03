import { Link, useLocation } from 'react-router-dom'
import Logo from '../../components/brand/Logo'
import { IconBack } from '../../components/ui/Icons'

/**
 * ── The host console lives outside /app ─────────────────────────────────────
 *
 * Not a design preference — a requirement. `/app` demands an onboarded
 * `profiles` row, and a club president running a rush event may well not have
 * one and should never be made to build one. So this is its own shell, with
 * its own chrome, reachable by anybody with a verified campus address.
 *
 * It is also not `/partners`. A host is not a business, and putting them in
 * the partner shell would have meant a `partner_users` row on an account that
 * might also be a member — which is precisely the ambiguity the partner
 * platform's founding invariant exists to prevent.
 */
export default function HostShell({ title, subtitle, action, back, children, wide = false }) {
  const { pathname } = useLocation()
  const atHome = pathname === '/host'

  //  One width for the bar and the content.
  //
  //  They used to differ — a 1100px header over a 720px column — and the whole
  //  page read as slightly broken without it being obvious why: the logo sat
  //  left of everything under it. Nothing is centred by accident; if the bar
  //  and the body disagree about where the page starts, they are both wrong.
  const shell = wide ? 'max-w-[1100px]' : 'max-w-[760px]'

  return (
    <div className="min-h-[100dvh] bg-paper">
      <header className="border-b border-rule">
        <div className={`mx-auto flex ${shell} items-center justify-between px-5 py-4 sm:px-8`}>
          {/*  Just the wordmark. "for Partners" earns its suffix because a
               restaurant owner needs telling they're in the right product;
               a club president who came here from an events page does not,
               and "for Hosts" only ever read as a label nobody asked for. */}
          <Link to="/host" className="flex items-center">
            <Logo />
          </Link>
          {!atHome && (
            <Link
              to="/host"
              className="press focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-medium text-graphite hover:text-navy"
            >
              <IconBack size={17} />
              My events
            </Link>
          )}
        </div>
      </header>

      <main className={`mx-auto ${shell} px-5 py-8 sm:px-8 sm:py-12`}>
        {(title || back) && (
          <header className="mb-8">
            {back && (
              <Link
                to={back}
                className="press focus-ring -ml-2 mb-4 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[14px] font-medium text-graphite hover:text-navy"
              >
                <IconBack size={18} />
                Back
              </Link>
            )}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] md:text-[34px]">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-2.5 max-w-[58ch] text-[14.5px] leading-relaxed text-graphite">
                    {subtitle}
                  </p>
                )}
              </div>
              {action}
            </div>
          </header>
        )}
        {children}
      </main>
    </div>
  )
}

/** A status word, in the one place it means something. */
export function StatusPill({ status }) {
  const tones = {
    draft: 'bg-cream text-graphite border-[#F2E6D6]',
    pending: 'bg-notebook-soft text-[#2F5C99] border-notebook/40',
    approved: 'bg-moss-soft text-[#3F7454] border-moss/30',
    running: 'bg-coral-soft text-coral-deep border-coral/25',
    paused: 'bg-cream text-graphite border-[#F2E6D6]',
    ended: 'bg-white text-mist border-rule',
    killed: 'bg-white text-coral-deep border-coral/30',
  }
  const words = {
    draft: 'Draft',
    pending: 'Waiting on us',
    approved: 'Approved',
    running: 'Running now',
    paused: 'Paused',
    ended: 'Finished',
    killed: 'Stopped',
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[12px] font-medium ${
        tones[status] ?? tones.draft
      }`}
    >
      {words[status] ?? status}
    </span>
  )
}
