import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/brand/Logo'
import Button from '../components/ui/Button'
import { Underline, Star, SheetDoodle } from '../components/brand/Doodles'
import UniversityBadge from '../components/common/UniversityBadge'
import { useStore } from '../state/store'

/**
 * The honest answer to "what does user #7 see". Not an empty Discover feed —
 * a real number, a real position, and nothing pretending to be activity.
 */
export default function Waitlist() {
  const { state, actions } = useStore()
  const [checking, setChecking] = useState(false)
  const campus = state.campus

  useEffect(() => {
    actions.refreshCampus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const members = campus?.members ?? 0
  const threshold = campus?.threshold ?? 50
  const position = campus?.position ?? null
  const pct = Math.min(100, Math.round((members / Math.max(threshold, 1)) * 100))
  const remaining = Math.max(0, threshold - members)

  const check = async () => {
    setChecking(true)
    await actions.refreshCampus()
    setTimeout(() => setChecking(false), 400)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper">
      <span className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-coral-soft/40 blur-3xl" />
      <span className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-notebook-soft/60 blur-3xl" />

      <header className="relative mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8">
        <Logo size="sm" />
        <Link to="/app/profile" className="text-[13.5px] font-medium text-graphite hover:text-navy">
          Your profile
        </Link>
      </header>

      <main className="relative mx-auto max-w-[560px] px-5 pb-20 pt-6 sm:px-8 sm:pt-12">
        <div className="relative">
          <Star className="absolute -left-4 -top-3 animate-twinkle text-coral" size={16} />
          <Star className="absolute right-2 top-8 animate-twinkle text-margin [animation-delay:500ms]" size={12} />

          <UniversityBadge name={campus?.short_name ?? 'Michigan'} className="mb-5" />

          <h1 className="relative inline-block font-display text-[34px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">
            You’re on the list.
            <Underline className="absolute -bottom-1 left-0 text-coral/60" width={230} />
          </h1>

          <p className="mt-6 max-w-[44ch] text-[16px] leading-relaxed text-graphite">
            Your profile is built and waiting. Looseleaf opens at{' '}
            {campus?.short_name ?? 'your campus'} once{' '}
            <span className="font-medium text-navy">{threshold} people</span> have joined — because a dating app
            with a handful of people on it isn’t worth your time, and we’d rather say that than fake it.
          </p>
        </div>

        {/* the count */}
        <section className="mt-9 rounded-card border border-rule bg-white px-6 py-6">
          <div className="flex items-baseline justify-between">
            <p className="font-display text-[30px] font-semibold leading-none tabular-nums">
              {members}
              <span className="ml-1.5 text-[16px] font-normal text-mist">of {threshold}</span>
            </p>
            {position && (
              <p className="text-[13.5px] text-graphite">
                You’re <span className="font-semibold text-navy">#{position}</span>
              </p>
            )}
          </div>

          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-cream"
            role="progressbar"
            aria-valuenow={members}
            aria-valuemin={0}
            aria-valuemax={threshold}
            aria-label="Campus signups"
          >
            <div
              className="h-full rounded-full bg-coral transition-all duration-700"
              style={{ width: `${Math.max(pct, 3)}%` }}
            />
          </div>

          <p className="mt-3.5 text-[13.5px] text-graphite">
            {remaining === 0
              ? 'Your campus is ready — refresh to go in.'
              : `${remaining} more ${remaining === 1 ? 'person' : 'people'} to go.`}
          </p>
        </section>

        {/* what happens next */}
        <section className="mt-4 rounded-card border border-rule bg-cream/60 px-6 py-6">
          <div className="flex items-start gap-4">
            <SheetDoodle className="shrink-0 text-navy/40" size={54} />
            <div>
              <h2 className="font-display text-[18px] font-semibold leading-tight">
                The fastest way in is your friends.
              </h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-graphite">
                Everyone who joins moves the whole campus closer. And when it does open, the people you already
                know are what make the first week feel like something.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="md"
            full
            className="mt-5"
            onClick={async () => {
              const url = `${window.location.origin}/join`
              try {
                await navigator.clipboard.writeText(url)
                actions.showToast('Link copied. Send it to someone good.')
              } catch {
                actions.showToast(url)
              }
            }}
          >
            Copy an invite link
          </Button>
        </section>

        <div className="mt-6 flex flex-col gap-2.5">
          <Button variant="coral" size="lg" full onClick={check} disabled={checking}>
            {checking ? 'Checking…' : 'Check again'}
          </Button>
          <Button variant="ghost" size="lg" full to="/app/profile">
            Edit my profile while I wait
          </Button>
        </div>

        <p className="mt-8 text-center text-[13px] leading-relaxed text-mist">
          We’ll email you the moment it opens. Nothing here is trying to keep you on your phone in the meantime.
        </p>
      </main>
    </div>
  )
}
