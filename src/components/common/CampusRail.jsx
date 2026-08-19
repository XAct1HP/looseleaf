import { Link } from 'react-router-dom'
import RailCard from './RailCard'
import { UNIVERSITY, CAMPUS_EVENTS } from '../../data/catalog'
import { IconVerified, IconMoon, IconChevron } from '../ui/Icons'
import { useStore } from '../../state/store'

export default function CampusRail() {
  const { state } = useStore()

  return (
    <>
      <RailCard title="Your campus" tone="blue">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-notebook-deep">
            <IconVerified size={19} />
          </span>
          <div>
            <p className="text-[15px] font-semibold leading-tight text-[#22406E]">{UNIVERSITY.short}</p>
            <p className="mt-1 text-[13px] text-[#4A6A99]">
              {UNIVERSITY.activeStudents.toLocaleString()} active students
            </p>
          </div>
        </div>
      </RailCard>

      <RailCard title="Tonight">
        <Link to="/app/campus/tonight" className="group flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream text-graphite">
            <IconMoon size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium leading-tight text-navy">
              87 people open to plans
            </span>
            <span className="mt-0.5 block text-[12.5px] text-mist">
              {state.tonight.active ? 'You’re on the list' : 'You’re not on the list'}
            </span>
          </span>
          <IconChevron size={16} className="text-mist transition-transform group-hover:translate-x-0.5" />
        </Link>
      </RailCard>

      <RailCard title="Upcoming">
        <ul className="space-y-3">
          {CAMPUS_EVENTS.slice(0, 2).map((e) => (
            <li key={e.id} className="flex items-start gap-3">
              <span className="mt-0.5 text-[18px] leading-none" aria-hidden="true">
                {e.emoji}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium leading-tight text-navy">{e.title}</p>
                <p className="mt-0.5 text-[12.5px] text-mist">{e.when}</p>
              </div>
            </li>
          ))}
        </ul>
        <Link
          to="/app/campus/events"
          className="mt-3.5 inline-flex items-center gap-1 text-[13px] font-medium text-graphite hover:text-navy"
        >
          All events <IconChevron size={14} />
        </Link>
      </RailCard>

      <p className="px-1 text-[11.5px] leading-relaxed text-mist">
        Looseleaf is free. Nothing here can be bought — not visibility, not likes, not you.
      </p>
    </>
  )
}
