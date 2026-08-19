import { useState } from 'react'
import Sheet from '../ui/Sheet'
import Button from '../ui/Button'
import { IconShield } from '../ui/Icons'

const REASONS = [
  'Fake profile or someone else’s photos',
  'Harassment or hate',
  'Sexual or explicit content',
  'Underage',
  'Spam, scam, or selling something',
  'Something else',
]

export default function ReportSheet({ open, person, onClose, onReport, onBlock }) {
  const [reason, setReason] = useState(null)

  if (!person) return null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Report ${person.firstName}?`}
      subtitle="This is private. They’re never told who reported them."
    >
      <ul className="space-y-2">
        {REASONS.map((r) => (
          <li key={r}>
            <button
              type="button"
              onClick={() => setReason(r)}
              className={`focus-ring w-full rounded-2xl border px-4 py-3.5 text-left text-[14.5px] transition-colors ${
                reason === r
                  ? 'border-coral bg-coral-wash text-navy'
                  : 'border-rule bg-white text-graphite hover:border-navy/20 hover:text-navy'
              }`}
            >
              {r}
            </button>
          </li>
        ))}
      </ul>

      <label className="mt-4 flex items-start gap-3 rounded-2xl border border-rule bg-cream/60 px-4 py-3">
        <IconShield size={19} className="mt-0.5 shrink-0 text-graphite" />
        <span className="text-[13.5px] leading-relaxed text-graphite">
          Blocking also hides you from them, everywhere on Looseleaf.
        </span>
      </label>

      <div className="mt-5 flex flex-col gap-2">
        <Button
          variant="coral"
          size="lg"
          full
          disabled={!reason}
          onClick={() => {
            onReport(reason)
            onClose()
          }}
        >
          Send report
        </Button>
        <Button
          variant="outline"
          size="lg"
          full
          onClick={() => {
            onBlock()
            onClose()
          }}
        >
          Block {person.firstName}
        </Button>
      </div>
    </Sheet>
  )
}
