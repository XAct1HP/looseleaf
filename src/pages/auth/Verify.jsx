import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from './AuthShell'
import Button from '../../components/ui/Button'
import { Underline, Star } from '../../components/brand/Doodles'
import { IconVerified } from '../../components/ui/Icons'
import { useStore } from '../../state/store'
import { isDemo } from '../../services/backend'
import { OTP_LENGTH, OTP_MIN_LENGTH } from '../../lib/supabase'

const empty = () => Array.from({ length: OTP_LENGTH }, () => '')

export default function Verify() {
  const { state, actions } = useStore()
  const navigate = useNavigate()
  const [digits, setDigits] = useState(empty)
  const [stage, setStage] = useState('entry') // entry | checking | done
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)
  const inputs = useRef([])

  const email = state.session.email
  const typed = digits.join('')

  // Eight boxes don't fit a 320px screen at the six-box size.
  const roomy = OTP_LENGTH <= 6
  const boxClass = roomy
    ? 'h-16 rounded-2xl text-[26px]'
    : 'h-[52px] rounded-xl text-[19px] sm:h-16 sm:rounded-2xl sm:text-[24px]'
  const gapClass = roomy ? 'gap-2 sm:gap-3' : 'gap-1.5 sm:gap-2.5'

  const attempt = async (code) => {
    setStage('checking')
    setError('')
    try {
      const { onboarded } = await actions.verifyCode(email, code)
      if (onboarded) {
        navigate('/app/discover')
        return
      }
      setStage('done')
    } catch (err) {
      setError(err.message)
      setStage('entry')
      setDigits(empty())
      inputs.current[0]?.focus()
    }
  }

  const setDigit = (i, value) => {
    // Handles a single keystroke and a pasted code identically.
    const cleaned = value.replace(/\D/g, '')
    if (!cleaned) {
      const next = [...digits]
      next[i] = ''
      setDigits(next)
      return
    }

    const next = [...digits]
    for (let k = 0; k < cleaned.length && i + k < OTP_LENGTH; k++) next[i + k] = cleaned[k]
    setDigits(next)

    inputs.current[Math.min(i + cleaned.length, OTP_LENGTH - 1)]?.focus()

    if (next.every(Boolean)) attempt(next.join(''))
  }

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus()
    if (e.key === 'Enter' && typed.length >= OTP_MIN_LENGTH) attempt(typed)
  }

  const resend = async () => {
    setDigits(empty())
    setError('')
    try {
      await actions.sendCode(email)
      setResent(true)
      setTimeout(() => setResent(false), 4000)
    } catch (err) {
      setError(err.message)
    }
  }

  if (stage === 'done') {
    return (
      <AuthShell step="2 of 3" back="/join">
        <div className="relative text-center">
          <Star className="absolute left-6 top-0 animate-twinkle text-coral" size={18} />
          <Star className="absolute right-8 top-6 animate-twinkle text-margin [animation-delay:400ms]" size={14} />

          <h1 className="relative inline-block font-display text-[38px] font-semibold leading-tight tracking-[-0.02em]">
            You’re in.
            <Underline className="absolute -bottom-1 left-0 text-coral/60" width={120} />
          </h1>

          <div className="mx-auto mt-9 flex max-w-[360px] items-center gap-3.5 rounded-card border border-notebook/50 bg-notebook-soft px-5 py-4 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-notebook-deep">
              <IconVerified size={22} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15.5px] font-semibold text-[#22406E]">
                {state.me?.university?.name ?? 'University of Michigan'}
              </p>
              <p className="truncate text-[13px] text-[#4A6A99]">Verified · {email}</p>
            </div>
          </div>

          <p className="mx-auto mt-7 max-w-[38ch] text-[15px] leading-relaxed text-graphite">
            Next: your profile. Eight short screens, and you can change any of it later.
          </p>

          <Button variant="coral" size="lg" full className="mt-8" onClick={() => navigate('/onboarding')}>
            Build my profile
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell step="2 of 3" back="/join">
      <h1 className="relative inline-block font-display text-[34px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
        Check your email.
        <Underline className="absolute -bottom-1 left-0 text-coral/60" width={200} />
      </h1>

      <p className="mt-6 max-w-[42ch] text-[15.5px] leading-relaxed text-graphite">
        We sent a code to <span className="font-medium text-navy">{email || 'your school email'}</span>. It
        expires in an hour.
      </p>

      <div className={`mt-9 flex justify-between ${gapClass}`}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (inputs.current[i] = el)}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
            autoFocus={i === 0}
            disabled={stage === 'checking'}
            className={`w-full border border-rule bg-white text-center font-display font-semibold text-navy transition focus:border-coral/50 focus:outline-none focus:ring-4 focus:ring-coral/15 disabled:opacity-50 ${boxClass}`}
          />
        ))}
      </div>

      {/* The box count comes from config, but the code Supabase actually sent
          is the source of truth — so a shorter one can still be submitted. */}
      {typed.length >= OTP_MIN_LENGTH && typed.length < OTP_LENGTH && stage === 'entry' && (
        <Button variant="coral" size="lg" full className="mt-5" onClick={() => attempt(typed)}>
          Verify this code
        </Button>
      )}

      {stage === 'checking' && <p className="mt-5 text-center text-[13.5px] text-graphite">Checking…</p>}

      {error && (
        <p className="mt-5 rounded-xl bg-coral-wash px-4 py-3 text-center text-[13.5px] leading-relaxed text-coral-deep">
          {error}
        </p>
      )}

      {isDemo && (
        <p className="mt-5 text-center text-[13px] text-mist">
          Demo mode — any {OTP_LENGTH} digits will do.
        </p>
      )}

      <button
        type="button"
        onClick={resend}
        className="mx-auto mt-6 block text-[13.5px] font-medium text-graphite underline underline-offset-4 hover:text-navy"
      >
        {resent ? 'Sent — check your inbox' : 'Didn’t get it? Send another'}
      </button>
    </AuthShell>
  )
}
