/**
 * ── Which app is this page offering to install? ─────────────────────────────
 *
 * Looseleaf serves two products from one static `index.html`, and that file can
 * only name one web app manifest. So the tags are swapped at runtime by route.
 *
 * ── Why this is its own module ──────────────────────────────────────────────
 *
 * Everything here is pure DOM: no event listeners, no service worker, no
 * module-level side effects at all. That matters, because this is imported by
 * `App.jsx` and therefore lands in the main bundle that every *student*
 * downloads. Its sibling `pwa.js` — which listens for `beforeinstallprompt`
 * and registers a worker — must stay out of that bundle, or a student's own
 * install banner would be silently suppressed by a listener meant for staff.
 *
 * ── Why by route, and not on the dashboard ──────────────────────────────────
 *
 * The first version of this swapped the tags in `DashboardLayout`. That left
 * `/partners`, `/partners/login`, `/partners/join` and `/partners/onboarding`
 * still advertising the *student* manifest — and the login page is exactly
 * where a member of staff is standing when somebody says "add this to your
 * home screen". They got an icon named Looseleaf with `start_url: "/"`, which
 * opened the dating app. Which is the whole failure this was built to prevent.
 *
 * Three tags, because three platforms read three different places:
 *
 *   · <link rel="manifest">                  Android/Chrome, and iOS 16.4+
 *   · <meta apple-mobile-web-app-title>      what iOS writes under the icon
 *   · <link rel="apple-touch-icon">          the icon iOS actually uses
 */

const STUDENT = {
  kind: 'student',
  manifest: '/manifest.webmanifest',
  appleTitle: 'Looseleaf',
  appleIcon: '/apple-touch-icon.png',
}

const SCANNER = {
  kind: 'scanner',
  manifest: '/scanner.webmanifest',
  appleTitle: 'LL Scanner',
  appleIcon: '/scanner-apple-touch-icon.png',
}

let current = null
const watchers = new Set()

function setTags(spec) {
  if (typeof document === 'undefined') return
  if (current === spec.kind) return

  const link = document.querySelector('link[rel="manifest"]')
  if (link) link.setAttribute('href', spec.manifest)

  const title = document.querySelector('meta[name="apple-mobile-web-app-title"]')
  if (title) title.setAttribute('content', spec.appleTitle)

  const icon = document.querySelector('link[rel="apple-touch-icon"]')
  if (icon) icon.setAttribute('href', spec.appleIcon)

  current = spec.kind
  watchers.forEach((fn) => {
    try {
      fn(spec.kind)
    } catch {
      /* one broken subscriber must not stop the others hearing */
    }
  })
}

export function applyScannerManifest() {
  setTags(SCANNER)
}

export function applyStudentManifest() {
  setTags(STUDENT)
}

/** 'student' | 'scanner' | null (nothing has claimed it yet). */
export function currentManifest() {
  return current
}

/**
 * Notified whenever the advertised app changes.
 *
 * This exists for one specific hazard. Chrome fires `beforeinstallprompt`
 * against whichever manifest was current *at the time*, and that event stays
 * valid-looking long after the page has swapped to a different one. Firing a
 * stale prompt would install the student app from a button labelled "Install
 * the scanner" — the exact bug, wearing a disguise. `pwa.js` subscribes here
 * and throws any captured prompt away the moment the manifest moves.
 */
export function onManifestChange(fn) {
  watchers.add(fn)
  return () => watchers.delete(fn)
}
