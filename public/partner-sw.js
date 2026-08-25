/* ═══════════════════════════════════════════════════════════════════════════
 *  The scanner's service worker
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Registered only from /partners routes, and scoped to /partners — a student
 *  never gets this worker, and it can never answer for a student's page.
 *
 *  It exists for two reasons, and the second one is the one people notice:
 *
 *    1. Chrome will not offer a real "Install" (the beforeinstallprompt event
 *       our install sheet turns into a one-tap button) for a site with no
 *       service worker that handles fetch. Without this file the best a staff
 *       member gets is a browser bookmark wearing an app icon.
 *    2. Restaurants have terrible wifi in exactly the places the counter
 *       phone lives. Holding the app shell locally means the scanner opens
 *       and shows its camera instead of a dinosaur, and the one request that
 *       genuinely needs the network fails with a sentence.
 *
 *  ── What is deliberately NOT cached ───────────────────────────────────────
 *
 *  Anything that decides whether a pass is good. Those calls go to Supabase,
 *  which is a different origin, and the fetch handler below returns early for
 *  anything not same-origin — so they cannot be served from here even by
 *  accident. This is not an optimisation left on the table: a cached "this
 *  pass is valid" handed to somebody at a till is a free meal and a wrong
 *  number in a partner's invoice, and it would be indistinguishable from the
 *  real thing on screen.
 *
 *  Same reasoning covers anything with a query string (a pass QR opens
 *  /partners/dashboard/scan?code=…) and every non-GET request.
 */

const VERSION = 'v1'
const SHELL = `looseleaf-scanner-shell-${VERSION}`
const ASSETS = `looseleaf-scanner-assets-${VERSION}`
const SHELL_URL = '/index.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(new Request(SHELL_URL, { cache: 'reload' })))
      // A failed pre-cache must not leave a worker that never activates. The
      // fetch handler below falls back to the network for anything missing.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('looseleaf-scanner-') && k !== SHELL && k !== ASSETS)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Content-hashed build output: the filename changes whenever the bytes do,
  // so this can be cache-first with no staleness risk at all.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(ASSETS).then((c) => c.put(request, copy))
            }
            return res
          })
      )
    )
    return
  }

  // Page loads: network first, so a deployed fix reaches the counter phone on
  // its next open rather than whenever a cache happens to expire. The shell is
  // only reached for when there is no network at all.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && !url.search) {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put(SHELL_URL, copy))
          }
          return res
        })
        .catch(() => caches.match(SHELL_URL).then((hit) => hit || Response.error()))
    )
  }

  // Everything else — fonts, the manifest, icons — is left to the browser.
})

// The install sheet sends this after telling somebody the app updated, so a
// counter phone that stays open all evening isn't a shift behind.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})
