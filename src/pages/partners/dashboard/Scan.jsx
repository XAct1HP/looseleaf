import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHead } from '../DashboardLayout'
import Button from '../../../components/ui/Button'
import { IconCheck, IconX, IconSearch } from '../../../components/ui/Icons'
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
 * the path that always works. Camera QR scanning uses the browser's built-in
 * BarcodeDetector where it exists (Chrome, Android) and simply isn't offered
 * where it doesn't, rather than shipping a decoder nobody asked for.
 *
 * Neither path decides anything. `partner_lookup_pass` and `redeem_date_pass`
 * are what determine validity, inside the database, under a row lock — this
 * screen is a viewfinder and a button.
 */
export default function Scan() {
  const { partner } = usePartnerAccount()
  const [params, setParams] = useSearchParams()

  const [code, setCode] = useState('')
  const [result, setResult] = useState(null) // lookup result
  const [done, setDone] = useState(null) // redemption result
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [scanning, setScanning] = useState(false)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const loopRef = useRef(null)

  const cameraSupported =
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    Boolean(navigator.mediaDevices?.getUserMedia)

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

  async function startCamera() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      setScanning(true)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return
        try {
          const codes = await detector.detect(videoRef.current)
          const hit = codes.find((c) => /LL-/i.test(c.rawValue))
          if (hit) {
            check(extractCode(hit.rawValue))
            return
          }
        } catch {
          /* a dropped frame is not an error worth showing anybody */
        }
        loopRef.current = requestAnimationFrame(tick)
      }
      loopRef.current = requestAnimationFrame(tick)
    } catch {
      setError('Couldn’t open the camera. You can type the code instead.')
      setScanning(false)
    }
  }

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

        <Button variant="coral" size="lg" full className="mt-5" onClick={reset}>
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
            <Button variant="coral" size="lg" full className="mt-5" onClick={confirm} disabled={busy}>
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
  return (
    <>
      <PageHead
        title="Scan a pass"
        subtitle="Point the camera at the customer's QR code, or type the code underneath it."
      />

      <div className="mx-auto max-w-[440px]">
        {cameraSupported && (
          <div className="mb-5">
            {scanning ? (
              <div className="relative overflow-hidden rounded-sheet border border-rule bg-navy">
                <video
                  ref={videoRef}
                  playsInline
                  muted
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
              <Button variant="coral" size="lg" full onClick={startCamera}>
                Open the camera
              </Button>
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
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="field !text-[19px] !tracking-[0.12em]"
            />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              aria-label="Check code"
              className="press focus-ring flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-navy text-paper transition disabled:bg-navy/15 disabled:text-mist"
            >
              <IconSearch size={20} />
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
            This browser can’t scan QR codes. Typing the code works exactly the same — or open this
            page in Chrome on the phone you keep behind the counter.
          </p>
        )}
      </div>
    </>
  )
}

/** A pass QR encodes a URL; the code is the last path segment. */
function extractCode(raw) {
  const m = /LL-[A-Z0-9]{4}-[A-Z0-9]{4}/i.exec(raw)
  return m ? m[0].toUpperCase() : raw
}
