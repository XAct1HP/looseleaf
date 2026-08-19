import { useState } from 'react'
import Sheet from '../ui/Sheet'
import Button from '../ui/Button'
import { PersonAvatar } from '../brand/Portrait'
import { IconCheck } from '../ui/Icons'

/**
 * "Ask a mutual" — a mutual can only answer warmly or neutrally.
 * Looseleaf is not a place where people get reviewed.
 */
export default function MutualsSheet({ open, person, mutuals = [], onClose }) {
  const [asked, setAsked] = useState([])

  if (!person) return null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`You and ${person.firstName} both know`}
      subtitle="Only people you’ve both connected with show up here."
    >
      <ul className="space-y-2">
        {mutuals.map((m) => {
          const done = asked.includes(m.id)
          return (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-2xl border border-rule bg-white px-4 py-3"
            >
              <PersonAvatar id={m.id} size={42} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-navy">{m.firstName}</p>
                <p className="truncate text-[13px] text-mist">{m.major}</p>
              </div>
              <Button
                size="sm"
                variant={done ? 'soft' : 'outline'}
                disabled={done}
                onClick={() => setAsked((a) => [...a, m.id])}
              >
                {done ? (
                  <>
                    <IconCheck size={15} /> Asked
                  </>
                ) : (
                  'Ask them'
                )}
              </Button>
            </li>
          )
        })}
      </ul>

      <p className="mt-4 rounded-2xl bg-cream/70 px-4 py-3 text-[13px] leading-relaxed text-graphite">
        Asking sends one private question — <span className="font-medium text-navy">“Think we’d get along?”</span> — and
        they can only answer kindly or say they don’t know them well. No ratings, ever.
      </p>
    </Sheet>
  )
}
