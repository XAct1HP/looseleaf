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
 * ── Why this is not the whole story on iOS ──────────────────────────────────
 *
 * Safari takes its app metadata once, at document load, and does not go back
 * for it when the tags change afterwards. So swapping from JavaScript fixes
 * Chrome and does nothing at all for an iPhone.
 *
 * Measured on a real handset, the asymmetry is worth knowing: of the three
 * things Add to Home Screen shows, **only the icon** picked up the swap —
 * Safari re-resolves that one because it has to go and fetch the image. The
 * name and `start_url` both came from the load-time snapshot, so the sheet
 * offered the scanner's coral icon under the name "Looseleaf" pointing at
 * "/". An icon that looks perfect, opening the dating app.
 *
 * The decision therefore happens *before this file runs*, in an inline head
 * script in `index.html`, from the same pathname. What is left here is the
 * client-side half: a Chrome user navigating between the two products without
 * a document load. Both must agree, and both read `location.pathname`.
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

/**
 * Seeded from the DOM rather than starting at null, because `index.html` has
 * already made this decision — synchronously, in a head script, from the same
 * pathname — before any of this runs. Starting blind would make the first call
 * here look like a *change*, and a change throws away any install prompt the
 * browser has already handed us for the very manifest we are re-selecting.
 */
let current = (() => {
  if (typeof document === 'undefined') return null
  const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href')
  if (!href) return null
  return href.includes('scanner') ? 'scanner' : 'student'
})()

const watchers = new Set()

/** The head script creates these; this is for the case where it somehow didn't. */
function ensure(selector, make) {
  let el = document.querySelector(selector)
  if (!el) {
    el = make()
    document.head.appendChild(el)
  }
  return el
}

function setTags(spec) {
  if (typeof document === 'undefined') return
  if (current === spec.kind) return

  ensure('link[rel="manifest"]', () => {
    const l = document.createElement('link')
    l.setAttribute('rel', 'manifest')
    return l
  }).setAttribute('href', spec.manifest)

  ensure('meta[name="apple-mobile-web-app-title"]', () => {
    const m = document.createElement('meta')
    m.setAttribute('name', 'apple-mobile-web-app-title')
    return m
  }).setAttribute('content', spec.appleTitle)

  ensure('link[rel="apple-touch-icon"]', () => {
    const l = document.createElement('link')
    l.setAttribute('rel', 'apple-touch-icon')
    l.setAttribute('sizes', '180x180')
    return l
  }).setAttribute('href', spec.appleIcon)

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
