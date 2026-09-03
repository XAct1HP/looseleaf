/**
 * Where Looseleaf lives.
 *
 * Anything a person could copy, paste, or share has to point at the real
 * domain — not at whatever host the tab happens to be on. `window.location`
 * is wrong on Vercel preview deployments (a student would get a link to
 * `looseleaf-git-somebranch-you.vercel.app`) and wrong on any bare
 * `*.vercel.app` fallback URL.
 *
 * Set VITE_SITE_URL per environment. Falling back to the current origin keeps
 * local dev working without any config.
 */

const configured = import.meta.env.VITE_SITE_URL

/** No trailing slash, ever — everything below joins with a leading slash. */
function normalise(value) {
  if (!value) return null
  return String(value).trim().replace(/\/+$/, '')
}

/** The one canonical home. Changing domains means changing this and the
 *  absolute og: tags in index.html together. */
const CANONICAL = 'https://hellolooseleaf.com'

function resolve() {
  const explicit = normalise(configured)
  if (explicit) return explicit

  if (typeof window === 'undefined') return CANONICAL

  // Local development should link to itself, or nothing is testable.
  const { hostname, origin } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) {
    return normalise(origin)
  }

  // Anywhere else — including a *.vercel.app preview — fall back to the real
  // domain rather than to whatever host this happens to be served from. A
  // forgotten env var should not put a preview URL in someone's group chat.
  return CANONICAL
}

export const SITE_URL = resolve()

export const url = (path = '/') => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`

/** The link students send each other. Kept in one place so it stays one link. */
export const inviteUrl = () => url('/join')

/**
 * What a Date Pass QR code actually encodes.
 *
 * A URL rather than a bare code, so a member of staff who points a phone
 * camera at it — with no dashboard open, mid-shift — lands on the scanner with
 * the code already filled in. The scanner still verifies it server-side; this
 * only saves the typing.
 */
export const passUrl = (code) => url(`/partners/dashboard/scan?code=${encodeURIComponent(code)}`)

/**
 * What an event's entrance QR encodes.
 *
 * Short on purpose: this gets printed at four inches on a door, photographed
 * at an angle in bad light, and read by whatever camera app a phone happens to
 * have. Every character in the URL is another module in the grid, and a denser
 * grid is a code that fails on the one phone whose owner then gives up and
 * walks off.
 *
 * It is a URL rather than a bare code because a printed QR is opened by the
 * phone's own camera, not by anything of ours — nobody opens a website in
 * order to open a camera.
 */
export const eventUrl = (code) => url(`/e/${String(code || '').toUpperCase()}`)

/**
 * Share sheet on a phone, clipboard everywhere else. Returns how it went so
 * the caller can say the right thing.
 */
export async function shareInvite({ onCopied, onShared, onFailed } = {}) {
  const link = inviteUrl()
  const payload = {
    title: 'Looseleaf',
    text: 'Looseleaf is a free dating app for our campus. Come join before it opens.',
    url: link,
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share(payload)
      onShared?.(link)
      return 'shared'
    } catch (error) {
      // A user dismissing the sheet is not a failure — don't fall through to
      // the clipboard and claim we copied something they didn't ask for.
      if (error?.name === 'AbortError') return 'dismissed'
    }
  }

  try {
    await navigator.clipboard.writeText(link)
    onCopied?.(link)
    return 'copied'
  } catch {
    onFailed?.(link)
    return 'failed'
  }
}
