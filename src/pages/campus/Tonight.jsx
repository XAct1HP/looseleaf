import { Link } from 'react-router-dom'
import SubPageHeader from '../../components/common/SubPageHeader'
import Portrait from '../../components/brand/Portrait'
import Button from '../../components/ui/Button'
import RailCard from '../../components/common/RailCard'
import { useRail } from '../../components/nav/AppLayout'
import { TONIGHT_MOODS } from '../../data/catalog'
import { PEOPLE } from '../../data/people'
import { useStore } from '../../state/store'
import { IconMoon, IconCheck } from '../../components/ui/Icons'

export default function Tonight() {
  const { state, actions } = useStore()
  const active = state.tonight.active
  const around = PEOPLE.filter((p) => p.tonight && !state.blocked.includes(p.id))

  useRail(
    <RailCard title="How Tonight works">
      <ul className="space-y-2.5 text-[13.5px] leading-relaxed text-graphite">
        <li>Your status clears itself tomorrow morning. Nothing to remember to turn off.</li>
        <li>Nobody sees your location — only that you’re around campus tonight.</li>
        <li>It’s free, like everything else that decides who you meet.</li>
      </ul>
    </RailCard>,
    []
  )

  return (
    <>
      <SubPageHeader
        title="Tonight"
        subtitle="A low-stakes way to say you’re free, without texting anyone first."
      />

      <section
        className={`mb-7 rounded-card border px-6 py-6 transition-colors ${
          active ? 'border-coral/30 bg-coral-wash' : 'border-navy/10 bg-navy text-paper'
        }`}
      >
        <div className="flex items-start gap-4">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              active ? 'bg-white text-coral' : 'bg-white/10'
            }`}
          >
            <IconMoon size={21} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className={`font-display text-[20px] font-semibold leading-tight ${active ? 'text-navy' : ''}`}>
              {active ? 'You’re around tonight.' : 'I’m around tonight.'}
            </h2>
            <p className={`mt-1.5 text-[14px] ${active ? 'text-graphite' : 'text-paper/70'}`}>
              {active
                ? `${TONIGHT_MOODS.find((m) => m.id === state.tonight.mood)?.label} · clears in the morning`
                : 'Pick a vibe. It expires on its own tomorrow.'}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {TONIGHT_MOODS.map((m) => {
            const on = state.tonight.mood === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => actions.setTonight(on ? null : m.id)}
                className={`press focus-ring inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13.5px] font-medium transition ${
                  on
                    ? 'border-coral bg-coral text-white'
                    : active
                      ? 'border-rule bg-white text-graphite hover:border-coral/40'
                      : 'border-white/15 bg-white/10 text-paper hover:bg-white/20'
                }`}
              >
                <span aria-hidden="true">{m.emoji}</span>
                {m.label}
                {on && <IconCheck size={14} />}
              </button>
            )
          })}
        </div>
      </section>

      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-[20px] font-semibold">87 people are open to plans</h2>
        <span className="text-[12.5px] text-mist">Central Campus and nearby</span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {around.map((p) => {
          const mood = TONIGHT_MOODS.find((m) => m.id === p.tonight)
          return (
            <li key={p.id}>
              <Link
                to={`/app/person/${p.id}`}
                className="lift-corner flex items-center gap-3.5 rounded-card border border-rule bg-white px-4 py-3.5"
              >
                <span className="h-16 w-14 shrink-0 overflow-hidden rounded-xl bg-cream">
                  <Portrait id={`${p.id}-0`} scene={p.photos?.[0]?.scene ?? 'portrait'} rounded="rounded-xl" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-medium text-navy">
                    {p.firstName}, {p.age}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-mist">
                    {p.major} ’{p.gradYear}
                  </span>
                  <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-cream px-2.5 py-1 text-[11.5px] font-medium text-graphite">
                    <span aria-hidden="true">{mood?.emoji}</span>
                    {mood?.label}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="mt-6 text-center text-[13px] text-mist">
        Everyone here chose to be listed. It disappears in the morning either way.
      </p>

      {!active && (
        <div className="mt-6">
          <Button variant="coral" size="lg" full onClick={() => actions.setTonight('plans')}>
            Add me to tonight
          </Button>
        </div>
      )}
    </>
  )
}
