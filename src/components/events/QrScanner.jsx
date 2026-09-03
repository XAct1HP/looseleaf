import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '../ui/Button'
import { IconScan } from '../ui/Icons'

/**
 * ── A QR camera, extracted ──────────────────────────────────────────────────
 *
 * Lifted out of the partner scanner so the event join screen doesn't get a
 * second, subtly-different copy of code that took a real bug to get right.
 * What was specific to redeeming a pass — the LL- code shape, the lookup —
 * is now the caller's business: this hands back whatever string it read.
 *
 * The bug worth not re-introducing, in one sentence: **getting permission and
 * attaching the stream are separate steps.** `startCamera` only asks. The
 * `<video>` element does not exist until `scanning` is true, and setting state
 * mounts nothing synchronously, so attaching the stream on the next line put
 * it on a null ref — a lit camera light above a black rectangle, which
 * survived a round of screenshot review because a screenshot cannot tell that
 * apart from a dark room.
 *
 * @param onCode   called with the raw decoded string; the caller decides what
 *                 counts as valid
 * @param match    optional predicate — keep scanning until a frame matches,
 *                 so a poster with two QR codes on it doesn't fire the wrong one
 */
export default function QrScanner({ onCode, match, label = 'Scan a code', className = '' }) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState(null)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const loopRef = useRef(null)
  const onCodeRef = useRef(onCode)
  const matchRef = useRef(match)

  onCodeRef.current = onCode
  matchRef.current = match

  // A camera is all that's required. The decoding is our problem, not the
  // browser's: iOS Safari has no BarcodeDetector and jsQR covers it.
  const supported =
    typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  const stop = useCallback(() => {
    cancelAnimationFrame(loopRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanning(false)
  }, [])

  useEffect(() => stop, [stop])

  async function readFrame(detector, decodeFallback) {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null

    if (detector) {
      const codes = await detector.detect(video)
      const hit = codes.find((c) => (matchRef.current ? matchRef.current(c.rawValue) : true))
      return hit?.rawValue ?? null
    }
    if (!decodeFallback) return null

    // A capped canvas: decoding a full 4K frame sixty times a second turns a
    // phone into a hand warmer and finds the code no faster.
    const canvas = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'))
    const scale = Math.min(1, 640 / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)

    const hit = decodeFallback(data, width, height, { inversionAttempts: 'dontInvert' })
    if (!hit?.data) return null
    if (matchRef.current && !matchRef.current(hit.data)) return null
    return hit.data
  }

  /** Asks for the camera. That is *all* this does — see the header. */
  async function startCamera() {
    setError(null)

    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setError('The camera only works over a secure (https) connection. You can type the code instead.')
      return
    }

    try {
      let stream
      try {
        // `ideal`, not `exact`: a laptop with only a front camera should still
        // open rather than throw.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        })
      } catch (e) {
        if (e?.name !== 'OverconstrainedError') throw e
        stream = await navigator.mediaDevices.getUserMedia({ video: true })
      }
      streamRef.current = stream
      setScanning(true)
    } catch (e) {
      setError(cameraProblem(e))
      setScanning(false)
    }
  }

  /** Attach and decode — once the element it goes into is on the page. */
  useEffect(() => {
    if (!scanning) return undefined
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return undefined

    let cancelled = false

    video.srcObject = stream
    // Both are required on iOS or the video never starts, and setting them as
    // attributes as well as properties covers older WebKit.
    video.setAttribute('playsinline', 'true')
    video.setAttribute('muted', 'true')
    video.muted = true

    const run = async () => {
      try {
        await video.play()
      } catch {
        /* an autoplay refusal doesn't stop us reading frames */
      }

      let detector = null
      let decodeFallback = null
      if ('BarcodeDetector' in window) {
        try {
          detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        } catch {
          detector = null
        }
      }
      if (!detector) {
        const mod = await import('jsqr')
        decodeFallback = mod.default ?? mod
      }
      if (cancelled) return

      const tick = async () => {
        if (cancelled || !streamRef.current) return
        try {
          const raw = await readFrame(detector, decodeFallback)
          if (raw) {
            onCodeRef.current?.(raw)
            return
          }
        } catch {
          /* a dropped frame is not an error worth showing anybody */
        }
        loopRef.current = requestAnimationFrame(tick)
      }
      loopRef.current = requestAnimationFrame(tick)
    }

    run()

    return () => {
      cancelled = true
      cancelAnimationFrame(loopRef.current)
    }
    // `onCode` is read through a ref on purpose: it changes on every render of
    // most callers, and depending on it here would tear the camera down
    // mid-scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning])

  if (!supported) return null

  return (
    <div className={className}>
      {scanning ? (
        <div className="overflow-hidden rounded-card border border-rule bg-navy">
          <div className="relative aspect-[4/3]">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* A frame to aim at. Purely cosmetic, and the reason people hold
                the phone at the right distance without being told. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-40 w-40 rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(17,28,56,0.45)]" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-[13px] text-white/70">Point at the code on the poster.</p>
            <Button type="button" variant="soft" size="sm" onClick={stop}>
              Stop
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="lg" full onClick={startCamera}>
          <IconScan size={18} />
          {label}
        </Button>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-coral-wash px-3.5 py-2.5 text-[13.5px] leading-relaxed text-coral-deep">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Why the camera didn't open, in words somebody can act on. "Permission
 * denied" and "there is no camera" need completely different responses, and
 * one message for both leaves people tapping the same button.
 */
function cameraProblem(e) {
  switch (e?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow it for this site in your browser settings, or type the code instead.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera on this device. Typing the code works exactly the same.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Another app is using the camera. Close it and try again, or type the code instead.'
    default:
      return 'Couldn’t open the camera. You can type the code instead.'
  }
}
