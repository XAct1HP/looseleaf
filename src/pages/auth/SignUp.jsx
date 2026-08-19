import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from './AuthShell'
import Button from '../../components/ui/Button'
import { Underline } from '../../components/brand/Doodles'
import { IconMail } from '../../components/ui/Icons'
import { useStore } from '../../state/store'
import { isDemo } from '../../services/backend'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const { actions } = useStore()
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    const value = email.trim().toLowerCase()

    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(value)) {
      setError('That doesn’t look like an email address yet.')
      return
    }

    setSending(true)
    setError('')
    try {
      await actions.sendCode(value)
      navigate('/verify')
    } catch (err) {
      // Off-campus rejections come back from the signup hook already worded
      // for a person, so they're shown as-is.
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <AuthShell
      step="1 of 3"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-navy underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <h1 className="relative inline-block font-display text-[34px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">
        Let’s start with school.
        <Underline className="absolute -bottom-1 left-0 text-coral/60" width={260} />
      </h1>

      <p className="mt-6 max-w-[42ch] text-[15.5px] leading-relaxed text-graphite">
        Looseleaf is built around real campus communities. We’ll send you a six-digit code — that’s the whole
        sign-up.
      </p>

      <form onSubmit={submit} className="mt-9">
        <label htmlFor="email" className="label">
          University email
        </label>
        <div className="relative">
          <IconMail size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist" />
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError('')
            }}
            placeholder="you@umich.edu"
            className="field pl-11"
            aria-invalid={!!error}
            aria-describedby={error ? 'email-error' : undefined}
          />
        </div>
        {error && (
          <p id="email-error" className="mt-2.5 rounded-xl bg-coral-wash px-3.5 py-2.5 text-[13.5px] leading-relaxed text-coral-deep">
            {error}
          </p>
        )}

        <Button type="submit" variant="coral" size="lg" full className="mt-6" disabled={sending}>
          {sending ? 'Sending…' : 'Send me a code'}
        </Button>

        <p className="mt-4 text-center text-[12.5px] leading-relaxed text-mist">
          {isDemo
            ? 'Demo mode — no email is actually sent.'
            : 'We only use your school email to verify your campus. It’s never shown on your profile.'}
        </p>
      </form>
    </AuthShell>
  )
}
