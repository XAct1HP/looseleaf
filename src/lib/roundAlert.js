/**
 * ── Making a phone in a pocket notice a round change ────────────────────────
 *
 * The first version called `navigator.vibrate()` and told everybody their
 * phone would buzz. On an iPhone it does neither: **Safari has never shipped
 * the Vibration API**, so `navigator.vibrate` is simply undefined, the
 * optional-call `?.()` silently did nothing, and the lobby promised a buzz
 * that could not happen. Promising something a device cannot do is worse than
 * promising nothing, because somebody puts the phone in their pocket and
 * trusts it.
 *
 * So this module does three things:
 *
 *  1. **Reports honestly what this device can actually do** — `capability()`
 *     is a real feature test, not a guess from the user agent, and the copy on
 *     screen is written from it.
 *  2. **Falls back to sound** where there is no vibration, which is most
 *     iPhones. Web Audio needs unlocking from a user gesture, so `arm()` is
 *     called from the tap that joins the event — the one guaranteed gesture
 *     every attendee makes.
 *  3. **Never pretends the fallback is perfect.** iOS mutes Web Audio when the
 *     hardware silent switch is on, and there is no way to detect that. The
 *     honest floor is the screen, which changes colour and layout completely
 *     at every transition, and the copy says so.
 */

let ctx = null
let armed = false

/** True where the Vibration API exists *and* is callable. */
export function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

function canAudio() {
  return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext)
}

/**
 * What this phone can genuinely do, in the order we'd prefer.
 *
 *   'buzz'   — vibration, the good case (Android)
 *   'sound'  — no vibration, but audio we've unlocked (iPhone, if not silenced)
 *   'screen' — neither; the visual change is all there is
 */
export function capability() {
  if (canVibrate()) return 'buzz'
  if (canAudio()) return 'sound'
  return 'screen'
}

/** The sentence to put under "your phone will…". Written from the feature test. */
export function alertPromise() {
  switch (capability()) {
    case 'buzz':
      return 'Your phone will buzz and tell you where to go. Keep it where you can feel it.'
    case 'sound':
      return 'Your phone will chime and tell you where to go — this phone can’t vibrate from a web page, so keep the sound on and the silent switch off.'
    default:
      return 'Your screen will change and tell you where to go. Keep an eye on it.'
  }
}

/**
 * Unlock audio. Must be called from inside a real user gesture — a browser
 * will create the context in a suspended state otherwise and every later beep
 * is a silent no-op.
 *
 * Safe to call repeatedly; safe to call where there is no audio at all.
 */
export function arm() {
  if (armed || !canAudio()) return
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    ctx = new Ctx()
    // Some browsers hand back a suspended context even inside a gesture.
    ctx.resume?.()

    //  A zero-length silent buffer is the standard way to convince iOS the
    //  context is genuinely unlocked. Without it the first real tone is
    //  sometimes swallowed.
    const buf = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)

    armed = true
  } catch {
    ctx = null
    armed = false
  }
}

function beep({ freq = 880, ms = 160, gain = 0.16 } = {}) {
  if (!ctx) return
  try {
    if (ctx.state === 'suspended') ctx.resume?.()
    const osc = ctx.createOscillator()
    const vol = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq

    //  Ramped, not switched. A square-edged gain change on a phone speaker is
    //  an audible click, and two of them around a short tone sound like a
    //  fault rather than a signal.
    const t = ctx.currentTime
    vol.gain.setValueAtTime(0.0001, t)
    vol.gain.exponentialRampToValueAtTime(gain, t + 0.015)
    vol.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)

    osc.connect(vol)
    vol.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + ms / 1000 + 0.02)
  } catch {
    /* a phone that won't make a noise is not an error worth showing anybody */
  }
}

/**
 * Fire the alert for a transition.
 *
 * @param kind 'round' — a new round is starting, go somewhere
 *             'break' — time is up, stop talking
 *             'test'  — somebody pressed the button in the lobby to check
 */
export function fire(kind = 'round') {
  //  Both, where both exist. A phone in a coat pocket in a loud room may only
  //  land one of them, and neither costs anything.
  if (canVibrate()) {
    try {
      navigator.vibrate(kind === 'break' ? 220 : [90, 60, 90])
    } catch {
      /* some browsers throw when the page is hidden */
    }
  }

  if (kind === 'break') {
    beep({ freq: 620, ms: 220 })
  } else {
    //  Two rising notes for "go" — distinguishable from the single lower note
    //  that means "stop", without anybody being taught the difference.
    beep({ freq: 740, ms: 130 })
    setTimeout(() => beep({ freq: 988, ms: 170 }), 150)
  }
}
