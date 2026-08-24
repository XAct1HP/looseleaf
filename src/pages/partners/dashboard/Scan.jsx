import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHead } from '../DashboardLayout'
import Button from '../../../components/ui/Button'
import { IconCheck, IconX, IconSearch, IconScan } from '../../../components/ui/Icons'
import { usePartnerAccount } from '../../../state/partnerAccount'
import * as partners from '../../../services/partners'

/**
 * ── Scanning a Date Pass ────────────────────────────────────────────────────
 *
 * Built for a phone held one-handed by somebody with a tray in the other, so:
 * big type, big targets, one decision per screen, and no scrolling to find the
 * confirm button.
 *
 * Two ways in, and the typed one is not a fallback bolted on afterwards — it's
 * the path that always works, including when a camera is refused or there
 * isn't one.
 *
 * Camera scanning uses the browser's own BarcodeDetector where it exists —
 * Chrome and Android — and a small JS decoder everywhere else. That second
 * path is not optional: iOS Safari has no BarcodeDetector, and a restaurant's
 * phone behind the counter is very often an iPhone. The decoder is imported
 * only when the camera actually opens on such a device, so nobody downloads it
 * to type a code.
 *
 * Neither path decides anything. `partner_lookup_pass` and `redeem_date_pass`
 * are what determine validity, inside the database, under a row lock — this
 * screen is a viewfinder and a button.
 */
export default function Scan() {
  const { partner } = usePartnerAccount()
  // Why this is allowed to fail silently: `partner_billing_summary()` refuses
  // anybody without the billing page, which is most staff — and correctly so,
  // since a waiter has no business reading their employer's payment history.
  // So the banner is a courtesy for whoever *can* see it, and a staff member
  // learns the same thing the honest way, from the sentence `redeem_date_pass`
  // hands back when they scan.
  const [billing, setBilling] = useState(null)

  useEffect(() => {
    if (!partner) return undefined
    let live = true
    partners
      .billingSummary(partner.id)
      .then((b) => live && setBilling(b))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [partner])
  const [params, setParams] = useSearchParams()

  const [code, setCode] = useState('')
  const [result, setResult] = useState(null) // lookup result
  const [done, setDone] = useState(null) // redemption result
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [scanning, setScanning] = useState(false)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const loopRef = useRef(null)
  const checkRef = useRef(null)

  // A camera is all that's required; the decoding is our problem, not the
  // browser's.
  const cameraSupported =
    typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(loopRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanning(false)
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const check = useCallback(
    async (raw) => {
      const value = (raw ?? '').trim()
      if (!value || busy) return
      setBusy(true)
      setError(null)
      setDone(null)
      try {
        const r = await partners.lookupPass(partner.id, value)
        setResult({ ...r, code: value })
        stopCamera()
      } catch (e) {
        setError(e.message)
      } finally {
        setBusy(false)
      }
    },
    [busy, partner, stopCamera]
  )

  // The frame loop calls this through a ref, so a new `check` never restarts
  // the camera.
  checkRef.current = check

  // A pass QR encodes a link to this page with the code on it, so a member of
  // staff can point a phone camera at it without opening the dashboard first.
  useEffect(() => {
    const fromLink = params.get('code')
    if (!fromLink || !partner) return
    setParams({}, { replace: true })
    setCode(fromLink.toUpperCase())
    check(fromLink)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner])

  /**
   * One frame, decoded whichever way this browser can manage.
   *
   * BarcodeDetector reads the video element directly and is much cheaper.
   * jsQR needs pixels, so the frame goes through a canvas first — at a capped
   * width, because decoding a full 4K frame sixty times a second turns a phone
   * into a hand warmer and finds the code no faster.
   */
  async function readFrame(detector, decodeFallback) {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null

    if (detector) {
      const codes = await detector.detect(video)
      return codes.find((c) => /LL-/i.test(c.rawValue))?.rawValue ?? null
    }

    if (!decodeFallback) return null

    const canvas = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'))
    const scale = Math.min(1, 640 / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)

    const hit = decodeFallback(data, width, height, { inversionAttempts: 'dontInvert' })
    return hit?.data && /LL-/i.test(hit.data) ? hit.data : null
  }

  /**
   * Ask for the camera. That is *all* this does.
   *
   * It used to attach the stream here too, and that was the bug: the `<video>`
   * element only exists once `scanning` is true, and setting state does not
   * mount anything synchronously — so `videoRef.current` was still null one
   * line later, the stream was silently never attached, and staff got a lit
   * camera light above a black rectangle. Attaching belongs in an effect,
   * which by definition runs after the element is on the page.
   */
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

  /**
   * Attach the stream and decode frames — once the element it goes into is
   * actually on the page.
   */
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
            checkRef.current(extractCode(raw))
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
    // `check` is read through a ref on purpose: it changes whenever `busy`
    // does, and depending on it here would tear the camera down mid-scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning])

  async function confirm() {
    if (busy || !result?.valid) return
    setBusy(true)
    setError(null)
    try {
      const r = await partners.redeemPass(partner.id, result.code)
      if (r.ok) {
        setDone(r)
        setResult(null)
        setCode('')
      } else {
        setResult({ ...result, valid: false, reason: r.reason })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setResult(null)
    setDone(null)
    setCode('')
    setError(null)
  }

  /* ── after a successful redemption ────────────────────────────────── */
  if (done) {
    return (
      <div className="mx-auto max-w-[440px] pt-4">
        <div className="rounded-sheet border border-moss/40 bg-moss-soft px-6 py-12 text-center">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-moss text-white">
            <IconCheck size={40} weight={2.4} />
          </span>
          <h1 className="mt-6 font-display text-[30px] font-semibold leading-tight text-navy">
            Date verified ✓
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[#3F7454]">
            Give them the discount. This is now counted in your dashboard.
          </p>
        </div>

        <Button variant="coral" size="lg" full className="mt-5 !h-[60px] !text-[17px]" onClick={reset}>
          Scan another
        </Button>
      </div>
    )
  }

  /* ── a pass has been looked up ────────────────────────────────────── */
  if (result) {
    return (
      <div className="mx-auto max-w-[440px] pt-4">
        <div
          className={`rounded-sheet border px-6 py-8 text-center ${
            result.valid ? 'border-moss/40 bg-moss-soft' : 'border-coral/30 bg-coral-wash'
          }`}
        >
          <span
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white ${
              result.valid ? 'bg-moss' : 'bg-coral-deep'
            }`}
          >
            {result.valid ? <IconCheck size={32} weight={2.4} /> : <IconX size={30} weight={2.4} />}
          </span>

          <h1 className="mt-5 font-display text-[26px] font-semibold leading-tight text-navy">
            {result.valid ? 'Valid Loose Leaf Date Pass' : 'Not valid'}
          </h1>

          {result.valid ? (
            <>
              <p className="mt-6 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-[#3F7454]">
                Offer
              </p>
              <p className="mt-1 font-display text-[28px] font-semibold leading-tight text-navy">
                {result.offerSummary}
              </p>
              <p className="mt-1 text-[14px] text-[#3F7454]">{result.offerTitle}</p>

              {result.terms && (
                <p className="mx-auto mt-5 max-w-[36ch] text-[12.5px] leading-relaxed text-graphite">
                  {result.terms}
                </p>
              )}

              <p className="mt-5 text-[12.5px] uppercase tracking-[0.08em] text-[#3F7454]">
                Status · Unused
              </p>
            </>
          ) : (
            <p className="mt-4 text-[15px] leading-relaxed text-coral-deep">{result.reason}</p>
          )}
        </div>

        {result.valid ? (
          <>
            <Button
              variant="coral"
              size="lg"
              full
              className="mt-5 !h-[60px] !text-[17px]"
              onClick={confirm}
              disabled={busy}
            >
              {busy ? 'Confirming…' : 'Confirm redemption'}
            </Button>
            <p className="mt-3 text-center text-[12.5px] leading-relaxed text-mist">
              Press this once they’re actually here. It can’t be undone, and the pass can’t be used
              again.
            </p>
          </>
        ) : null}

        <button
          type="button"
          onClick={reset}
          className="focus-ring mt-4 w-full rounded-xl py-2.5 text-[14px] font-medium text-graphite hover:text-navy"
        >
          Back
        </button>
      </div>
    )
  }

  /* ── the scanner ──────────────────────────────────────────────────── */
  //  Sized for one hand behind a counter: the camera is the biggest thing on
  //  the screen, the code field is thumb-height, and the two together fill a
  //  phone rather than sitting in a column at the top of one.
  return (
    <>
      <PageHead
        title="Scan a pass"
        subtitle="Point the camera at the customer's QR code, or type the code underneath it."
      />

      <div className="mx-auto max-w-[440px]">
        {/* Saying so up front is the honest version — the old behaviour was to
            remove the page, which for a member of staff meant signing in to a
            screen that said they had no access, as though the problem were
            them. The scanner itself always works; what varies is whether
            there is anything out there to scan. */}
        {billing && !billing.has_card && (
          <p className="mb-5 rounded-2xl border border-[#F2E6D6] bg-cream px-4 py-3.5 text-[13px] leading-relaxed text-graphite">
            <span className="font-medium text-navy">
              {partner?.name} isn’t issuing Date Passes yet.
            </span>{' '}
            The scanner works, but there won’t be any codes to scan until a card is added under
            Billing. Nothing is charged until somebody actually redeems one.
          </p>
        )}

        {billing?.has_card && !billing.can_redeem && (
          <p className="mb-5 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3.5 text-[13px] leading-relaxed text-coral-deep">
            <span className="font-medium">Date Passes are paused on this account.</span>{' '}
            Scans will be refused until the outstanding Loose Leaf invoice is settled under
            Billing. Your Date Spot is unaffected and students can still find you.
          </p>
        )}

        {billing?.has_card && billing.can_redeem && !billing.can_issue && (
          <p className="mb-5 rounded-2xl border border-[#C9821F]/30 bg-[#FBF3E4] px-4 py-3.5 text-[13px] leading-relaxed text-graphite">
            <span className="font-medium text-navy">No new passes are going out right now.</span>{' '}
            Anything already in a customer’s hand still scans normally — keep honouring them.
            New ones resume when this month’s invoice is paid.
          </p>
        )}

        {cameraSupported && (
          <div className="mb-5">
            {scanning ? (
              <div className="relative overflow-hidden rounded-sheet border border-rule bg-navy">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="aspect-square w-full object-cover"
                />
                <span
                  className="pointer-events-none absolute inset-[18%] rounded-3xl border-2 border-white/70"
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={stopCamera}
                  className="press absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-graphite"
                  aria-label="Stop scanning"
                >
                  <IconX size={18} />
                </button>
                <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/80 to-transparent px-4 pb-4 pt-10 text-center text-[13.5px] text-white/85">
                  Hold the code inside the square
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={startCamera}
                className="press focus-ring flex aspect-square w-full flex-col items-center justify-center gap-4 rounded-sheet border-2 border-dashed border-navy/20 bg-cream/60 text-graphite transition hover:border-coral/40 hover:bg-coral-wash/60"
              >
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-coral text-white shadow-[0_10px_22px_-12px_rgba(255,100,104,0.9)]">
                  <IconScan size={38} />
                </span>
                <span className="text-[17px] font-medium text-navy">Open the camera</span>
                <span className="max-w-[28ch] text-center text-[13px] leading-relaxed text-mist">
                  Hold the customer's code in the square and it scans itself.
                </span>
              </button>
            )}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            check(code)
          }}
        >
          <label className="label" htmlFor="pass-code">
            {cameraSupported ? 'Or type the code' : 'Type the code'}
          </label>
          <div className="flex gap-2">
            <input
              id="pass-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="LL-XXXX-XXXX"
              /* inputMode text, not numeric: the codes are letters and digits
                 and a number pad would hide half of them. */
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className="field !h-[60px] !py-0 !text-[21px] !tracking-[0.14em]"
            />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              aria-label="Check code"
              className="press focus-ring flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl bg-navy text-paper transition disabled:bg-navy/15 disabled:text-mist"
            >
              <IconSearch size={22} />
            </button>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
            Codes never use the letters O, I or L, or the digits 0 and 1 — so nothing here is
            ambiguous read out loud.
          </p>
        </form>

        {error && (
          <p className="mt-5 rounded-2xl border border-coral/30 bg-coral-wash px-4 py-3 text-[13.5px] leading-relaxed text-coral-deep">
            {error}
          </p>
        )}

        {!cameraSupported && (
          <p className="mt-6 rounded-2xl border border-rule bg-cream/60 px-4 py-3 text-[12.5px] leading-relaxed text-graphite">
            No camera on this device. Typing the code works exactly the same — or open this page on
            the phone you keep behind the counter.
          </p>
        )}
      </div>
    </>
  )
}

/**
 * Why the camera didn't open, in words somebody behind a counter can act on.
 * "Permission denied" and "there is no camera" need completely different
 * responses, and one message for both leaves people tapping the same button.
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

/** A pass QR encodes a URL; the code is the last path segment. */
function extractCode(raw) {
  const m = /LL-[A-Z0-9]{4}-[A-Z0-9]{4}/i.exec(raw)
  return m ? m[0].toUpperCase() : raw
}
