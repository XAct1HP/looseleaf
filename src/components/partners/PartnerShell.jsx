import { Link } from 'react-router-dom'
import Logo from '../brand/Logo'
import Button from '../ui/Button'

/**
 * The frame around the public partner pages.
 *
 * It is the same Looseleaf — same mark, same paper, same coral — with the
 * volume turned down half a step: a wordmark suffix instead of a campus
 * badge, and no doodles in the chrome. A restaurant owner should feel they
 * have arrived somewhere serious without feeling they have left.
 */
export default function PartnerShell({ children, cta = true }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-40 border-b border-rule/70 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-4 sm:px-8">
          <Link to="/partners" className="focus-ring flex items-center gap-2.5 rounded-lg">
            <Logo size="md" />
            <span className="hidden h-4 w-px bg-rule sm:block" />
            <span className="hidden text-[13.5px] font-medium text-graphite sm:block">
              for Partners
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            <Button to="/partners/login" variant="ghost" size="sm">
              Partner log in
            </Button>
            {cta && (
              <Button to="/partners/join" variant="coral" size="sm">
                Become a Partner
              </Button>
            )}
          </nav>
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
              Partner log in
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
