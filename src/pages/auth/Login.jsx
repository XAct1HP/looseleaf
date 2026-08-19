import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from './AuthShell'
import Button from '../../components/ui/Button'
import { Underline } from '../../components/brand/Doodles'
import { IconMail, IconLock } from '../../components/ui/Icons'
import { useStore } from '../../state/store'

export default function Login() {
  const { actions } = useStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('javi@umich.edu')
  const [password, setPassword] = useState('••••••••')

  const submit = (e) => {
    e.preventDefault()
    actions.signIn(email.trim().toLowerCase())
    actions.verify()
    actions.finishOnboarding({})
    navigate('/app/discover')
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

      <form onSubmit={submit} className="mt-9 space-y-4">
        <div>
          <label htmlFor="login-email" className="label">
            University email
          </label>
          <div className="relative">
            <IconMail size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist" />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field pl-11"
            />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="login-password" className="label">
              Password
            </label>
            <button type="button" className="mb-2 text-[12.5px] text-graphite underline underline-offset-4">
              Forgot?
            </button>
          </div>
          <div className="relative">
            <IconLock size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist" />
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field pl-11"
            />
          </div>
        </div>

        <Button type="submit" variant="coral" size="lg" full className="!mt-7">
          Log in
        </Button>
      </form>

      <p className="mt-6 rounded-2xl border border-rule bg-cream/70 px-4 py-3 text-center text-[12.5px] leading-relaxed text-graphite">
        Demo build — log in with anything to land in Javi’s account.
      </p>
    </AuthShell>
  )
}
