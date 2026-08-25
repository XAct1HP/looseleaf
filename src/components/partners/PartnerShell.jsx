import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../brand/Logo'
import ForPartners from './ForPartners'
import TopMenu from '../nav/TopMenu'
import { registerScannerWorker } from '../../lib/pwa'

/**
 * The frame around the public partner pages.
 *
 * It is the same Looseleaf — same mark, same paper, same coral — with the
 * volume turned down half a step: a wordmark suffix instead of a campus
 * badge, and no doodles in the chrome. A restaurant owner should feel they
 * have arrived somewhere serious without feeling they have left.
 */
export default function PartnerShell({ children, cta = true }) {
  // Chrome only offers a real install where a service worker covers the
  // manifest's start_url, and the login page is the most likely place for a
  // member of staff to be told "put this on your phone" — so the worker is
  // registered from the public partner pages as well as from the dashboard.
  // Registering an existing worker is a no-op update check, so calling it from
  // both costs nothing.
  useEffect(() => {
    registerScannerWorker()
  }, [])

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-40 border-b border-rule/70 bg-paper/90 backdrop-blur-md">
        <div className="relative mx-auto flex max-w-[1180px] items-center justify-between px-5 py-4 sm:px-8">
          <Link to="/partners" className="focus-ring flex items-center gap-2.5 rounded-lg">
            <Logo size="md" />
            <ForPartners size="md" />
          </Link>

          {/* Plain "Log in", not "Partner log in". Most people who ever use
              this link are staff at a business that is already a partner, and
              the qualifier read to them as a door for somebody else — leaving
              "Become a Partner" as the only button that looked like theirs.
              The page it opens says who it's for.

              Together with the coral CTA that's five words, and a phone is
              390px wide, so below `sm` they live behind one button. */}
          <TopMenu
            items={[
              { to: '/partners/login', label: 'Log in' },
              ...(cta ? [{ to: '/partners/join', label: 'Become a Partner', variant: 'coral' }] : []),
            ]}
          />
        </div>
      </header>

      {children}

      <footer className="border-t border-rule bg-cream/40">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo size="sm" />
            <p className="mt-2 max-w-[46ch] text-[13px] leading-relaxed text-mist">
              Loose Leaf helps students meet each other, and then helps them figure out where to go.
              Partners are the second half of that.
            </p>
          </div>
          <nav className="flex flex-wrap gap-5 text-[13px] text-graphite">
            <Link to="/partners" className="hover:text-navy">
              For Partners
            </Link>
            <Link to="/partners/join" className="hover:text-navy">
              Become a Partner
            </Link>
            <Link to="/partners/login" className="hover:text-navy">
              Log in
            </Link>
            {/* Same destination, second name. A staff member sent to
                hellolooseleaf.com by their manager scans this footer for the
                word "staff", not for "log in" — and finding neither is how
                they end up clicking "Become a Partner". */}
            <Link to="/partners/login" className="hover:text-navy">
              Staff sign-in
            </Link>
            <Link to="/" className="hover:text-navy">
              Loose Leaf for students
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
