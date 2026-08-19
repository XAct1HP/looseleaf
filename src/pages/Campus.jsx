import { Link } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import RailCard from '../components/common/RailCard'
import { useRail } from '../components/nav/AppLayout'
import { useStore } from '../state/store'
import { CAMPUS_EVENTS, UNIVERSITY } from '../data/catalog'
import { PersonAvatar } from '../components/brand/Portrait'
import { IconMoon, IconPeople, IconCalendar, IconSpark, IconPin, IconChevron } from '../components/ui/Icons'
import { PEOPLE } from '../data/people'

const CARDS = [
  {
    to: '/app/campus/tonight',
    Icon: IconMoon,
    title: 'Tonight',
    body: 'See people who are open to making plans tonight.',
    tone: 'navy',
  },
  {
    to: '/app/campus/double-date',
    Icon: IconPeople,
    title: 'Double Date',
    body: 'Pair up with a friend and meet another pair.',
    tone: 'pink',
  },
  {
    to: '/app/campus/events',
    Icon: IconCalendar,
    title: 'Events',
    body: 'Find people going to the same thing as you.',
    tone: 'blue',
  },
  {
    to: '/app/campus/formals',
    Icon: IconSpark,
    title: 'Formal',
    body: 'Need a date for a formal, gala, or date party?',
    tone: 'coral',
  },
  {
    to: '/app/campus/spots',
    Icon: IconPin,
    title: 'Date Spots',
    body: 'Good places around campus to actually meet.',
    tone: 'moss',
  },
]

const TONES = {
  navy: 'border-navy/12 bg-navy text-paper',
  pink: 'border-margin/25 bg-margin-soft text-[#A93E7F]',
  blue: 'border-notebook/45 bg-notebook-soft text-[#22406E]',
  coral: 'border-coral/25 bg-coral-wash text-coral-deep',
  moss: 'border-moss/25 bg-moss-soft text-[#3F7454]',
}

export default function Campus() {
  const { state } = useStore()
  const tonightPeople = PEOPLE.filter((p) => p.tonight).slice(0, 5)

  useRail(
    <>
      <RailCard title="This week" tone="cream">
        <ul className="space-y-3.5">
          {CAMPUS_EVENTS.map((e) => (
            <li key={e.id} className="flex items-start gap-3">
              <span className="text-[18px] leading-none" aria-hidden="true">
                {e.emoji}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium leading-tight text-navy">{e.title}</p>
                <p className="mt-0.5 text-[12.5px] text-mist">
                  {e.when} · {e.interested} interested
                </p>
              </div>
            </li>
          ))}
        </ul>
      </RailCard>
    </>,
    []
  )

  return (
    <>
      <PageHeader title="Campus" subtitle="There’s more happening than your matches." />

      {/* tonight strip */}
      <Link
        to="/app/campus/tonight"
        className="lift-corner group mb-5 flex items-center gap-4 rounded-card border border-navy/10 bg-navy px-5 py-5 text-paper"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10">
          <IconMoon size={21} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[19px] font-semibold leading-tight">
            87 people are open to plans tonight
          </span>
          <span className="mt-1 block text-[13.5px] text-paper/70">
            {state.tonight.active ? 'You’re one of them.' : 'You’re not on the list yet.'}
          </span>
        </span>
        <span className="flex -space-x-2.5">
          {tonightPeople.slice(0, 3).map((p) => (
            <PersonAvatar key={p.id} id={`${p.id}-0`} size={34} className="ring-2 ring-navy" />
          ))}
        </span>
        <IconChevron size={18} className="shrink-0 text-paper/60 transition-transform group-hover:translate-x-0.5" />
      </Link>

      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.filter((c) => c.title !== 'Tonight').map(({ to, Icon, title, body, tone }) => (
          <Link key={to} to={to} className={`lift-corner rounded-card border px-6 py-6 ${TONES[tone]}`}>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70">
              <Icon size={21} />
            </span>
            <h3 className="mt-4 font-display text-[20px] font-semibold leading-tight">{title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed opacity-85">{body}</p>
          </Link>
        ))}
      </div>

      <section className="mt-8 rounded-card border border-rule bg-cream/60 px-6 py-5">
        <h3 className="font-display text-[17px] font-semibold">{UNIVERSITY.name}</h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-graphite">
          {UNIVERSITY.activeStudents.toLocaleString()} students are on Looseleaf here. Campus features are open to
          everyone — there’s no version of this you can pay to get more of.
        </p>
      </section>
    </>
  )
}
