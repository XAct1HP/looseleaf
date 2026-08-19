import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from './AuthShell'
import Button from '../../components/ui/Button'
import { Underline } from '../../components/brand/Doodles'
import { IconMail } from '../../components/ui/Icons'
import { useStore } from '../../state/store'
import { isDemo } from '../../services/backend'

/**
 * There are no passwords. Signing in is the same six-digit code as signing up,
 * which means one less thing to leak and one less thing to forget.
 */
export default function Login() {
  const { actions } = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState(isDemo ? 'javi@umich.edu' : '')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const value = email.trim().toLowerCase()

    if (isDemo) {
      await actions.sendCode(value)
      await actions.verifyCode(value, '000000')
      await actions.finishOnboarding({})
      navigate('/app/discover')
      return
    }

    setSending(true)
    setError('')
    try {
      await actions.sendCode(value, { existingOnly: true })
      navigate('/verify')
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <AuthShell
      footer={
        <>
          New here?{' '}
          <Link to="/join" className="font-medium text-navy underline underline-offset-4">
            Join your campus
          </Link>
        </>
      }
    >
      <h1 className="relative inline-block font-display text-[34px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
        Welcome back.
        <Underline className="absolute -bottom-1 left-0 text-coral/60" width={180} />
      </h1>
      <p className="mt-6 text-[15.5px] leading-relaxed text-graphite">
        Someone might have left you a note.
      </p>

      <form onSubmit={submit} className="mt-9">
        <label htmlFor="login-email" className="label">
          University email
        </label>
        <div className="relative">
          <IconMail size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist" />
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError('')
            }}
            placeholder="you@umich.edu"
            className="field pl-11"
          />
        </div>

        {error && (
          <p className="mt-2.5 rounded-xl bg-coral-wash px-3.5 py-2.5 text-[13.5px] leading-relaxed text-coral-deep">
            {error}
          </p>
        )}

        <Button type="submit" variant="coral" size="lg" full className="mt-6" disabled={sending}>
          {sending ? 'Sending…' : isDemo ? 'Log in' : 'Email me a code'}
        </Button>
      </form>

      {isDemo && (
        <p className="mt-6 rounded-2xl border border-rule bg-cream/70 px-4 py-3 text-center text-[12.5px] leading-relaxed text-graphite">
          Demo build — log in with anything to land in Javi’s account.
        </p>
      )}
    </AuthShell>
  )
}
