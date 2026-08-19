import { HandHeart } from '../brand/Doodles'

const time = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function ChatBubble({ message, person }) {
  const mine = message.from === 'me'

  if (message.kind === 'note') {
    return (
      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[85%] sm:max-w-[70%]">
          <p className={`mb-1.5 flex items-center gap-1.5 text-[12px] text-mist ${mine ? 'justify-end' : ''}`}>
            <HandHeart size={12} className="text-coral" />
            {mine ? `You ${message.meta ?? 'left a note'}` : `${person.firstName} ${message.meta ?? 'left a note'}`}
          </p>
          <div className="relative overflow-hidden rounded-2xl border border-coral/20 bg-coral-wash px-4 py-3">
            <span className="absolute inset-y-0 left-0 w-[3px] bg-coral/45" aria-hidden="true" />
            <p className="pl-2 font-hand text-[18px] leading-snug text-navy">“{message.text}”</p>
          </div>
        </div>
      </div>
    )
  }

  if (message.kind === 'plan') {
    return (
      <div className="flex justify-center">
        <div className="max-w-[90%] rounded-2xl border border-moss/30 bg-moss-soft px-4 py-3 text-center">
          <p className="text-[13.5px] font-medium text-[#3F7454]">{message.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`group max-w-[80%] rounded-2xl px-4 py-2.5 sm:max-w-[62%] ${
          mine
            ? 'rounded-br-md border border-coral/20 bg-coral-wash text-navy'
            : 'rounded-bl-md border border-rule bg-cream text-navy'
        }`}
      >
        <p className="text-[15px] leading-relaxed">{message.text}</p>
        <p className={`mt-1 text-[11px] tabular-nums text-mist ${mine ? 'text-right' : ''}`}>{time(message.at)}</p>
      </div>
    </div>
  )
}
