/**
 * ── Putting the scanner on a phone ──────────────────────────────────────────
 *
 * Everything in here exists because of one fact that was quietly true until
 * now: Looseleaf shipped a single web app manifest, and it described the
 * *student* app — `name: "Looseleaf"`, `start_url: "/"`. A member of staff who
 * followed any "add to home screen" advice got an icon that opened the dating
 * app. Teaching people to install it would have taught them to install the
 * wrong thing.
 *
 * So there are two manifests now, and this module decides which one the page
 * is currently advertising. It swaps three things, because three different
 * platforms read three different places:
 *
 *   · <link rel="manifest">          Android/Chrome, and iOS 16.4+
 *   · <meta apple-mobile-web-app-title>  what iOS writes under the icon
 *   · <link rel="apple-touch-icon">  the icon iOS actually uses
 *
 * None of this is a build-time decision, because index.html is one static file
 * serving both halves of the product.
 */

const STUDENT = {
  manifest: '/manifest.webmanifest',
  appleTitle: 'Looseleaf',
  appleIcon: '/apple-touch-icon.png',
}

const SCANNER = {
  manifest: '/scanner.webmanifest',
  appleTitle: 'LL Scanner',
  appleIcon: '/scanner-apple-touch-icon.png',
}

function setTags({ manifest, appleTitle, appleIcon }) {
  if (typeof document === 'undefined') return
  const link = document.querySelector('link[rel="manifest"]')
  if (link && !link.href.endsWith(manifest)) link.setAttribute('href', manifest)

  const title = document.querySelector('meta[name="apple-mobile-web-app-title"]')
  if (title) title.setAttribute('content', appleTitle)

  const icon = document.querySelector('link[rel="apple-touch-icon"]')
  if (icon && !icon.href.endsWith(appleIcon)) icon.setAttribute('href', appleIcon)
}

/** Called on entering the partner subtree. */
export function applyScannerManifest() {
  setTags(SCANNER)
}

/** Called on leaving it, so the student app never offers to install a scanner. */
export function applyStudentManifest() {
  setTags(STUDENT)
}

/* ── is this already installed? ─────────────────────────────────────────────
 *
 * `display-mode: standalone` is the real answer everywhere except older iOS,
 * which reports `navigator.standalone` and nothing else. Both are checked,
 * and a false answer is treated as "we don't know", never as "definitely a
 * browser" — the nudge that reads this is a suggestion, and being wrong about
 * it should cost somebody a glance, not a mis-tap.
 */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      window.matchMedia?.('(display-mode: fullscreen)').matches === true ||
      window.matchMedia?.('(display-mode: minimal-ui)').matches === true ||
      window.navigator.standalone === true ||
      document.referrer.startsWith('android-app://')
    )
  } catch {
    return false
  }
}

/* ── which set of steps does this person need? ─────────────────────────────
 *
 * User-agent sniffing, which is normally the wrong tool — but the question
 * here is literally "which buttons are on your screen", and there is no
 * feature to detect for "the Share icon is in the bottom bar". Getting it
 * wrong costs a wrong picture, and the sheet lets anybody pick a different
 * platform by hand, so this is a first guess and is presented as one.
 */
export function detectPlatform() {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac, and the touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (ios) {
    // On iOS every browser is Safari underneath, but only some of them expose
    // "Add to Home Screen", and they hide it in different menus.
    if (/CriOS/.test(ua)) return 'ios-chrome'
    if (/FxiOS|EdgiOS|OPT\//.test(ua)) return 'ios-other'
    return 'ios-safari'
  }

  if (/Android/.test(ua)) {
    if (/SamsungBrowser/.test(ua)) return 'android-samsung'
    if (/Firefox/.test(ua)) return 'android-firefox'
    return 'android-chrome'
  }

  return 'desktop'
}

export const PLATFORM_LABELS = {
  'ios-safari': 'iPhone or iPad (Safari)',
  'ios-chrome': 'iPhone or iPad (Chrome)',
  'ios-other': 'iPhone or iPad (another browser)',
  'android-chrome': 'Android (Chrome)',
  'android-samsung': 'Android (Samsung Internet)',
  'android-firefox': 'Android (Firefox)',
  desktop: 'Computer',
  other: 'Something else',
}

/* ── the real install button ────────────────────────────────────────────────
 *
 * Chrome fires `beforeinstallprompt` once, early, and if nobody calls
 * preventDefault on it the chance is gone. That is well before any React
 * component that wants it has mounted — so it is captured here at module
 * scope, held, and handed over later.
 *
 * Where this works, the install sheet is one button and no instructions at
 * all, which is worth a great deal more than three well-drawn steps.
 */
let deferredPrompt = null
const listeners = new Set()

function announce() {
  listeners.forEach((fn) => {
    try {
      fn(Boolean(deferredPrompt))
    } catch {
      /* a broken subscriber must not stop the others hearing */
    }
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    announce()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    announce()
  })
}

export function canPromptInstall() {
  return Boolean(deferredPrompt)
}

/** Subscribe to whether a one-tap install is currently possible. */
export function onInstallAvailability(fn) {
  listeners.add(fn)
  fn(Boolean(deferredPrompt))
  return () => listeners.delete(fn)
}

/**
 * Fire Chrome's own install dialog. Returns 'accepted' | 'dismissed' |
 * 'unavailable'. The prompt is single-use: once it has been shown, the event
 * is spent whichever way the person answered, so it is cleared either way.
 */
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable'
  const e = deferredPrompt
  deferredPrompt = null
  announce()
  try {
    await e.prompt()
    const { outcome } = await e.userChoice
    return outcome === 'accepted' ? 'accepted' : 'dismissed'
  } catch {
    return 'dismissed'
  }
}

/* ── the service worker ─────────────────────────────────────────────────────
 *
 * Registered from partner routes only, scoped to /partners. The script sits at
 * the root because a worker's maximum scope is its own directory — a narrower
 * scope than the script's location is always allowed, a wider one never is.
 */
export function registerScannerWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (typeof window !== 'undefined' && window.isSecureContext === false) return
  navigator.serviceWorker.register('/partner-sw.js', { scope: '/partners/' }).catch(() => {
    /* No worker means no offline shell and no one-tap install. Everything
       else on this page works exactly as before, so this is not worth a
       message to somebody standing at a till. */
  })
}

/* ── remembering that somebody said no ──────────────────────────────────────
 *
 * Per device, which is the right unit: the question is about *this phone*, not
 * about this person, and the same phone behind a counter is used by whoever is
 * on shift. It lapses rather than sticking forever for the same reason — staff
 * turn over, and a new person on the same handset should be asked once.
 */
const SNOOZE_KEY = 'looseleaf.scanner.install.snoozed'
const SNOOZE_DAYS = 30

export function snoozeInstallNudge() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()))
  } catch {
    /* private browsing: they'll be asked again, which is the safe direction */
  }
}

export function installNudgeSnoozed() {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY))
    if (!at) return false
    return Date.now() - at < SNOOZE_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}
