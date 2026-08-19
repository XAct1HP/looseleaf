import { useState } from 'react'
import SubPageHeader from '../../components/common/SubPageHeader'
import RailCard from '../../components/common/RailCard'
import Button from '../../components/ui/Button'
import { PersonAvatar } from '../../components/brand/Portrait'
import { useRail } from '../../components/nav/AppLayout'
import { CAMPUS_EVENTS } from '../../data/catalog'
import { PEOPLE } from '../../data/people'
import { IconCheck } from '../../components/ui/Icons'

export default function Events() {
  const [going, setGoing] = useState([])

  useRail(
    <RailCard title="How events work">
      <p className="text-[13.5px] leading-relaxed text-graphite">
        Marking yourself interested just means people going to the same thing can find you. It doesn’t post
        anywhere, and it clears once the event passes.
      </p>
    </RailCard>,
    []
  )

  return (
    <>
      <SubPageHeader
        title="Events"
        subtitle="Find people who are going to the same thing as you."
      />

      <ul className="space-y-4">
        {CAMPUS_EVENTS.map((e, idx) => {
          const on = going.includes(e.id)
          const faces = PEOPLE.slice(idx * 3, idx * 3 + 4)
          return (
            <li key={e.id} className="lift-corner rounded-card border border-rule bg-white px-5 py-5">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cream text-[22px]">
                  <span aria-hidden="true">{e.emoji}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[19px] font-semibold leading-tight">{e.title}</p>
                  <p className="mt-1 text-[13.5px] text-graphite">
                    {e.when} · {e.where}
                  </p>
                  <div className="mt-3 flex items-center gap-2.5">
                    <span className="flex -space-x-2">
                      {faces.map((p) => (
                        <PersonAvatar key={p.id} id={`${p.id}-0`} size={26} ring />
                      ))}
                    </span>
                    <span className="text-[12.5px] text-mist">{e.interested} interested</span>
                  </div>
                </div>
              </div>

              <Button
                variant={on ? 'soft' : 'outline'}
                size="md"
                full
                className="mt-4"
                onClick={() => setGoing((g) => (on ? g.filter((x) => x !== e.id) : [...g, e.id]))}
              >
                {on ? (
                  <>
                    <IconCheck size={16} />
                    You’re interested
                  </>
                ) : (
                  'I’m interested'
                )}
              </Button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
