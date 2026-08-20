import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import PartnerShell from '../../components/partners/PartnerShell'
import Button from '../../components/ui/Button'
import { Star } from '../../components/brand/Doodles'
import { IconMail, IconBack } from '../../components/ui/Icons'
import * as partners from '../../services/partners'
import * as auth from '../../services/live/auth'
import { OTP_LENGTH, OTP_MIN_LENGTH } from '../../lib/supabase'

/**
 * Partner sign-in, in the same shape students get: an emailed code, no
 * password to forget behind a bar during a dinner rush.
 *
 * The one difference from the student flow is a flag in the signup metadata
 * that lets a non-.edu address through. That flag is not a back door — the
 * profiles insert policy checks the real address in the JWT, so all it can
 * ever produce is an account with no campus, which is exactly what a business
 * should have.
 */
export default function PartnerAuth() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const joining = pathname.endsWith('/join')

  const [step, setStep] = useState('email')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const codeRef = useRef(null)

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
  }, [step])

  const emailLooksReal = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const ready = joining ? emailLooksReal && name.trim().length > 1 : emailLooksReal

  async function sendCode(e) {
    e?.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      await partners.sendCode(email, { createAccount: joining })
      try {
        sessionStorage.setItem('looseleaf.partner.name', name.trim())
      } catch {
        /* the onboarding form asks again if this didn't stick */
      }
      setStep('code')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(e) {
    e?.preventDefault()
    if (code.trim().length < OTP_MIN_LENGTH || busy) return
    setBusy(true)
    setError(null)
    try {
      await auth.verifyCode(email, code)
      const mine = await partners.mine()
      navigate(mine.length ? '/partners/dashboard' : '/partners/onboarding', { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (!partners.partnersEnabled) return <PartnerOffline />

  return (
    <PartnerShell cta={false}>
      <main className="mx-auto flex max-w-[520px] flex-col px-5 pb-20 pt-10 sm:px-8 sm:pt-16">
        <div className="relative">
          <Star className="absolute -left-6 -top-4 hidden text-coral/50 sm:block" size={16} />

          {step === 'code' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep('email')
                  setCode('')
                  setError(null)
                }}
                className="press focus-ring -ml-2 mb-5 flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[14px] font-medium text-graphite hover:text-navy"
              >
                <IconBack size={18} />
                Back
              </button>

              <h1 className="font-display text-[32px] font-semibold leading-tight tracking-[-0.02em]">
                Check your inbox.
              </h1>
              <p className="mt-3 text-[15.5px] leading-relaxed text-graphite">
                We sent a {OTP_LENGTH}-digit code to{' '}
                <span className="font-medium text-navy">{email.trim().toLowerCase()}</span>. It’s good
                for a few minutes.
              </p>

              <form onSubmit={verify} className="mt-8">
                <label className="label" htmlFor="partner-code">
                  Your code
                </label>
                <input
                  id="partner-code"
                  ref={codeRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={'0'.repeat(OTP_LENGTH)}
                  className="field !text-[24px] !tracking-[0.3em] tabular-nums"
                />

                {error && <p className="mt-3 text-[13.5px] text-coral-deep">{error}</p>}

                <Button
                  type="submit"
                  variant="coral"
                  size="lg"
                  full
                  className="mt-6"
                  disabled={busy || code.length < OTP_MIN_LENGTH}
                >
                  {busy ? 'Checking…' : 'Continue'}
                </Button>
              </form>

              <button
                type="button"
                onClick={sendCode}
                disabled={busy}
                className="focus-ring mt-5 w-full rounded-xl py-2 text-[13.5px] text-graphite hover:text-navy"
              >
                Didn’t arrive? Send another
              </button>
            </>
          ) : (
            <>
              <h1 className="font-display text-[32px] font-semibold leading-tight tracking-[-0.02em]">
                {joining ? 'Let’s get your place on Loose Leaf.' : 'Welcome back.'}
              </h1>
              <p className="mt-3 max-w-[44ch] text-[15.5px] leading-relaxed text-graphite">
                {joining
                  ? 'Use whatever email you actually check — no .edu address needed, this side is for businesses.'
                  : 'We’ll email you a code. No password to lose behind the bar.'}
              </p>

              <form onSubmit={sendCode} className="mt-8 space-y-5">
                {joining && (
                  <div>
                    <label className="label" htmlFor="partner-name">
                      Your name
                    </label>
                    <input
                      id="partner-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      placeholder="Sam Okafor"
                      className="field"
                    />
                  </div>
                )}

                <div>
                  <label className="label" htmlFor="partner-email">
                    Email
                  </label>
                  <input
                    id="partner-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@yourplace.com"
                    className="field"
                  />
                </div>

                {error && <p className="text-[13.5px] text-coral-deep">{error}</p>}

                <Button type="submit" variant="coral" size="lg" full disabled={!ready || busy}>
                  {busy ? 'Sending…' : 'Email me a code'}
                </Button>
              </form>

              <p className="mt-6 flex items-center gap-2 text-[13px] text-mist">
                <IconMail size={15} />
                We only use this to sign you in and to reach you about your business.
              </p>
            </>
          )}
        </div>

        <p className="mt-10 text-center text-[13.5px] text-graphite">
          {joining ? (
            <>
              Already a partner?{' '}
              <Link to="/partners/login" className="font-medium underline underline-offset-2 hover:text-navy">
                Log in
              </Link>
            </>
          ) : (
            <>
              New here?{' '}
              <Link to="/partners/join" className="font-medium underline underline-offset-2 hover:text-navy">
                Become a Partner
              </Link>
            </>
          )}
        </p>
      </main>
    </PartnerShell>
  )
}

/**
 * Shown when the app is running on the demo campus. Building a convincing
 * fake of a signup that takes card details would be worse than saying so.
 */
export function PartnerOffline() {
  return (
    <PartnerShell cta={false}>
      <main className="mx-auto max-w-[560px] px-5 pb-24 pt-16 sm:px-8">
        <h1 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.02em]">
          This part needs the real Loose Leaf.
        </h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-graphite">
          You’re looking at the demo campus, which runs entirely in your browser with invented
          students and invented places. The Partner platform takes payment details and issues
          passes that a real business will honour, so it only runs against a configured Looseleaf
          rather than being simulated.
        </p>
        <div className="mt-7 rounded-card border border-rule bg-cream/70 px-5 py-5">
          <p className="text-[13.5px] font-medium text-navy">To turn it on</p>
          <ol className="mt-3 space-y-1.5 text-[13.5px] leading-relaxed text-graphite">
            <li>1. Set <code className="text-navy">VITE_DATA_MODE=supabase</code></li>
            <li>2. Set <code className="text-navy">VITE_SUPABASE_URL</code> and <code className="text-navy">VITE_SUPABASE_ANON_KEY</code></li>
            <li>3. Apply the partner migrations and deploy the billing functions</li>
          </ol>
          <p className="mt-3 text-[13px] text-mist">docs/PARTNERS.md has the full list.</p>
        </div>
        <Button to="/partners" variant="outline" size="lg" className="mt-8">
          Back to the partner page
        </Button>
      </main>
    </PartnerShell>
  )
}
