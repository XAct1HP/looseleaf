import { logoUrl } from '../../services/liveEvents'
import { accentOf } from '../../lib/liveEvent'
import Logo, { LeafMark } from '../brand/Logo'

/**
 * ── The host's page, with our name on it ────────────────────────────────────
 *
 * Co-branding, and the balance is the whole feature. The club's logo, colour
 * and welcome line lead — it is their night, and a host who feels like they
 * are advertising for us will not run a second one. But Looseleaf's mark is on
 * every screen, top and bottom, because forty people finding out what
 * Looseleaf is *is* the reason this exists.
 *
 * The accent comes from a fixed palette rather than a colour picker. A free
 * hex field means a club eventually ships an event whose timer is unreadable
 * in a dim room, and the person who suffers is a stranger holding a phone.
 */
export default function EventShell({ event, children }) {
  const accent = accentOf(event?.accent)
  const logo = logoUrl(event?.logo_path)

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      <header className="border-b border-rule">
        <div className="mx-auto flex w-full max-w-[440px] items-center justify-between px-5 py-3.5">
          <Logo size="sm" />
          {event?.org_name && (
            <span
              className="max-w-[55%] truncate rounded-full px-3 py-1 text-[12px] font-medium"
              style={{ background: accent.wash, color: accent.ink }}
            >
              {event.org_name}
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto w-full max-w-[440px] flex-1 px-5 pb-12 pt-8">
        {/*  The club's own mark, at a size that says whose event this is. A
             host who uploaded a logo should see it doing something. */}
        {logo ? (
          <img
            src={logo}
            alt=""
            className="mb-6 h-20 w-20 rounded-2xl border border-rule object-cover"
          />
        ) : (
          event?.org_name && (
            <div
              className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl text-[26px] font-display font-semibold"
              style={{ background: accent.wash, color: accent.ink }}
              aria-hidden="true"
            >
              {event.org_name.trim().charAt(0).toUpperCase()}
            </div>
          )
        )}

        {event?.title && (
          <h1 className="font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] [text-wrap:balance]">
            {event.title}
          </h1>
        )}

        {(event?.venue_label || event?.starts_at) && (
          <p className="mt-2 text-[14px] text-mist">
            {[
              event.venue_label,
              event.starts_at &&
                new Date(event.starts_at).toLocaleString(undefined, {
                  weekday: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}

        {children}
      </div>

      <footer className="border-t border-rule">
        <div className="mx-auto flex w-full max-w-[440px] items-center justify-center gap-2 px-5 py-3.5 pb-safe">
          <LeafMark size={16} className="text-mist" />
          <p className="text-[11.5px] text-mist">
            Run on <span className="font-medium text-graphite">Looseleaf</span> — free dating for
            your campus
          </p>
        </div>
      </footer>
    </div>
  )
}
