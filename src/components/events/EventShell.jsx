import { logoUrl } from '../../services/liveEvents'
import { accentOf } from '../../lib/liveEvent'
import Logo from '../brand/Logo'

/**
 * ── The host's page, with our name on it ────────────────────────────────────
 *
 * Co-branding, and the balance is the entire point of the feature. The club's
 * logo, colour and welcome line lead — it is their night, and a host who feels
 * like they're advertising for us will not run a second one. But Looseleaf's
 * mark stays on every screen, because forty people learning what Looseleaf is
 * *is* the reason this exists.
 *
 * The accent comes from a fixed palette rather than a colour picker. A free
 * hex field means a club eventually ships an event whose timer is unreadable
 * in a dim room, and the person who suffers is a stranger holding a phone.
 */
export default function EventShell({ event, children }) {
  const accent = accentOf(event?.accent)
  const logo = logoUrl(event?.logo_path)

  return (
    <div className="min-h-[100dvh] bg-paper">
      <div className="mx-auto max-w-[440px] px-5 pb-16 pt-safe">
        <header className="flex items-center justify-between py-6">
          <Logo />
          {event?.org_name && (
            <span
              className="rounded-full px-3 py-1 text-[12px] font-medium"
              style={{ background: accent.wash, color: accent.ink }}
            >
              {event.org_name}
            </span>
          )}
        </header>

        {logo && (
          <img
            src={logo}
            alt=""
            className="mb-6 h-16 w-16 rounded-2xl border border-rule object-cover"
          />
        )}

        {event?.title && (
          <h1 className="font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] [text-wrap:balance]">
            {event.title}
          </h1>
        )}

        {event?.venue_label && (
          <p className="mt-2 text-[14px] text-mist">{event.venue_label}</p>
        )}

        {children}
      </div>
    </div>
  )
}
