import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthShell from './AuthShell'
import Button from '../../components/ui/Button'
import { Underline, Star } from '../../components/brand/Doodles'
import { IconVerified } from '../../components/ui/Icons'
import { UNIVERSITY } from '../../data/catalog'
import { useStore } from '../../state/store'

export default function Verify() {
  const { state, actions } = useStore()
  const navigate = useNavigate()
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [done, setDone] = useState(false)
  const inputs = useRef([])

  const setDigit = (i, v) => {
    const clean = v.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = clean
    setDigits(next)
    if (clean && i < 5) inputs.current[i + 1]?.focus()
    if (next.every((d) => d)) {
      setTimeout(() => {
        actions.verify()
        setDone(true)
      }, 320)
    }
  }

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus()
  }

  if (done) {
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
            <div>
              <p className="text-[15.5px] font-semibold text-[#22406E]">{UNIVERSITY.name}</p>
              <p className="text-[13px] text-[#4A6A99]">Verified · {UNIVERSITY.city}</p>
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
        We sent a six-digit code to{' '}
        <span className="font-medium text-navy">{state.session.email || 'your school email'}</span>. It expires in
        ten minutes.
      </p>

      <div className="mt-9 flex justify-between gap-2 sm:gap-3">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (inputs.current[i] = el)}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={`Digit ${i + 1}`}
            autoFocus={i === 0}
            className="h-16 w-full rounded-2xl border border-rule bg-white text-center font-display text-[26px] font-semibold text-navy transition focus:border-coral/50 focus:outline-none focus:ring-4 focus:ring-coral/15"
          />
        ))}
      </div>

      <p className="mt-5 text-center text-[13px] text-mist">
        Demo: type any six digits.
      </p>

      <button
        type="button"
        onClick={() => setDigits(['', '', '', '', '', ''])}
        className="mx-auto mt-6 block text-[13.5px] font-medium text-graphite underline underline-offset-4 hover:text-navy"
      >
        Didn’t get it? Send another
      </button>
    </AuthShell>
  )
}
