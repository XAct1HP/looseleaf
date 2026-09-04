/**
 * ── Where somebody was heading before they were asked to log in ─────────────
 *
 * The case this exists for is small and completely invisible until it happens
 * to you: a Date Pass QR encodes a link to the scanner *with the code on it*,
 * so a member of staff can point their phone's own camera at a customer's
 * pass and land on a checked pass without opening anything first. Lovely — on
 * a device that is already signed in.
 *
 * On one that isn't, the dashboard redirected to `/partners/login` with
 * `replace`, and the query string went with it. The employee then signed in
 * and arrived at an empty scanner, with the customer still holding the phone
 * they had just scanned. Nothing errored; the code simply evaporated.
 *
 * So the destination is carried across the login and handed back afterwards.
 * The whole of the security thinking is `safeNext()`: a `?next=` parameter is
 * a redirect somebody else can write, and the only thing standing between
 * that and an open redirect is refusing to be clever about it.
 */

/** Everything reachable this way lives under the dashboard. Nothing else is. */
const ALLOWED_PREFIX = '/partners/dashboard'

/**
 * A destination we are willing to send somebody to after they sign in, or
 * null.
 *
 * Deliberately strict, and deliberately not a URL parser: anything with a
 * scheme, a host, or a protocol-relative `//` opening is rejected outright
 * rather than normalised, because "normalise this until it looks safe" is how
 * open redirects are written. It must be a path, and it must be one of ours.
 */
export function safeNext(value) {
  if (typeof value !== 'string' || !value) return null
  const raw = value.trim()

  // `//evil.com` is a valid protocol-relative URL and reads like a path.
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  if (raw.includes('\\')) return null

  // Backstops for an encoded scheme sneaking through a double-decode.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null

  const path = raw.split(/[?#]/)[0]
  if (path !== ALLOWED_PREFIX && !path.startsWith(`${ALLOWED_PREFIX}/`)) return null

  return raw
}

/** The login URL that will bring somebody back to where they were going. */
export function loginWithNext(destination) {
  const next = safeNext(destination)
  return next ? `/partners/login?next=${encodeURIComponent(next)}` : '/partners/login'
}
