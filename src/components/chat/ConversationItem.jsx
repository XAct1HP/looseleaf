import { Link } from 'react-router-dom'
import { PersonAvatar } from '../brand/Portrait'
import { IconVerified } from '../ui/Icons'

const ago = (ts) => {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
}

export default function ConversationItem({ conversation, person, active = false }) {
  const last = conversation.messages[conversation.messages.length - 1]

  return (
    <Link
      to={`/app/chat/${conversation.id}`}
      className={`flex items-center gap-3.5 rounded-2xl px-3 py-3 transition-colors ${
        active ? 'bg-cream' : 'hover:bg-navy/[0.035]'
      }`}
    >
      <PersonAvatar id={`${person.id}-0`} size={54} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15.5px] font-medium text-navy">{person.firstName}</span>
          <IconVerified size={13} className="shrink-0 text-notebook-deep" />
          <span className="ml-auto shrink-0 text-[12px] text-mist">{last ? ago(last.at) : ''}</span>
        </div>
        <p className="mt-0.5 truncate text-[13.5px] text-graphite">
          {last ? (
            <>
              {last.from === 'me' && <span className="text-mist">You: </span>}
              {last.kind === 'note' && <span className="text-coral-deep">note · </span>}
              {last.text}
            </>
          ) : (
            <span className="text-mist">Say something first.</span>
          )}
        </p>
      </div>
    </Link>
  )
}
