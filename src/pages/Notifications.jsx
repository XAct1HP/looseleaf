import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import EmptyState from '../components/common/EmptyState'
import RailCard from '../components/common/RailCard'
import { PersonAvatar } from '../components/brand/Portrait'
import { useRail } from '../components/nav/AppLayout'
import { useStore } from '../state/store'
import { personById } from '../data/people'
import { HandHeart } from '../components/brand/Doodles'
import { IconChat, IconCampus, IconNote } from '../components/ui/Icons'

const ICONS = {
  like: HandHeart,
  note: IconNote,
  match: HandHeart,
  message: IconChat,
  campus: IconCampus,
}

const TONES = {
  like: 'bg-coral-soft text-coral-deep',
  note: 'bg-coral-soft text-coral-deep',
  match: 'bg-margin-soft text-[#A93E7F]',
  message: 'bg-notebook-soft text-[#2F5C99]',
  campus: 'bg-cream text-graphite',
}

const ago = (ts) => {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

const linkFor = (n, state) => {
  if (n.kind === 'like' || n.kind === 'note') return '/app/likes'
  if (n.kind === 'campus') return '/app/campus/tonight'
  const match = state.matches.find((m) => m.personId === n.personId)
  return match ? `/app/chat/${match.conversationId}` : '/app/matches'
}

export default function Notifications() {
  const { state, actions } = useStore()

  useEffect(() => {
    const t = setTimeout(actions.markNotificationsRead, 800)
    return () => clearTimeout(t)
  }, [actions])

  useRail(
    <RailCard title="No pressure by design" tone="cream">
      <p className="text-[13.5px] leading-relaxed text-graphite">
        Looseleaf won’t tell you someone hasn’t replied, or that you’re “losing matches.” Notifications here are
        only ever about something good that already happened.
      </p>
    </RailCard>,
    []
  )

  const notifications = [...state.notifications].sort((a, b) => b.at - a.at)

  return (
    <>
      <PageHeader title="Notifications" subtitle="Only the things worth telling you about." />

      {notifications.length === 0 ? (
        <EmptyState art="plane" title="All caught up." body="Nothing new since you last looked." />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const Icon = ICONS[n.kind] ?? HandHeart
            const person = n.personId ? personById(n.personId) : null
            return (
              <li key={n.id}>
                <Link
                  to={linkFor(n, state)}
                  className={`flex items-center gap-3.5 rounded-card border px-4 py-3.5 transition-colors ${
                    n.read ? 'border-rule bg-white hover:bg-cream/50' : 'border-coral/25 bg-coral-wash/60'
                  }`}
                >
                  {person ? (
                    <PersonAvatar id={`${person.id}-0`} size={44} />
                  ) : (
                    <span className={`flex h-11 w-11 items-center justify-center rounded-full ${TONES[n.kind]}`}>
                      <Icon size={19} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] leading-snug text-navy">{n.text}</span>
                    <span className="mt-0.5 block text-[12.5px] text-mist">{ago(n.at)}</span>
                  </span>
                  {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-coral" aria-hidden="true" />}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
