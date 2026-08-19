import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Portrait from '../brand/Portrait'
import Button from '../ui/Button'
import { Star } from '../brand/Doodles'
import { useStore } from '../../state/store'

/** Warm, not a slot machine. */
export default function MatchModal({ person, onClose }) {
  const navigate = useNavigate()
  const { state } = useStore()

  useEffect(() => {
    if (!person) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [person, onClose])

  if (!person) return null

  const match = state.matches.find((m) => m.personId === person.id)

  const openChat = () => {
    onClose()
    if (match) navigate(`/app/chat/${match.conversationId}`)
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-navy/45 backdrop-blur-[3px]" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="You found each other"
        className="relative w-full max-w-[400px] animate-pop-in rounded-sheet bg-paper px-7 py-9 text-center shadow-lift"
      >
        {/* two sheets, casually overlapping */}
        <div className="relative mx-auto mb-7 h-[150px] w-[220px]">
          <Star className="absolute -left-2 top-2 z-20 animate-twinkle text-coral" size={18} />
          <Star className="absolute right-0 -top-2 z-20 animate-twinkle text-margin [animation-delay:300ms]" size={22} />
          <Star className="absolute -right-3 bottom-6 z-20 animate-twinkle text-notebook-deep [animation-delay:650ms]" size={14} />
          <Star className="absolute left-6 -bottom-3 z-20 animate-twinkle text-coral [animation-delay:900ms]" size={13} />

          <div className="absolute left-2 top-3 h-[128px] w-[104px] -rotate-[7deg] rounded-2xl border border-rule bg-white p-2 shadow-lift">
            <div className="h-full w-full overflow-hidden rounded-xl">
              <Portrait id={state.me.id} rounded="rounded-xl" crop="close" />
            </div>
          </div>
          <div className="absolute right-2 top-0 h-[136px] w-[110px] rotate-[6deg] rounded-2xl border border-rule bg-white p-2 shadow-lift">
            <div className="h-full w-full overflow-hidden rounded-xl">
              <Portrait id={`${person.id}-0`} rounded="rounded-xl" crop="close" />
            </div>
          </div>
        </div>

        <h2 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.02em]">
          You found each other.
        </h2>
        <p className="mx-auto mt-3 max-w-[28ch] text-[15px] leading-relaxed text-graphite">
          You and {person.firstName} liked each other. No rush — say something whenever you want.
        </p>

        <div className="mt-7 flex flex-col gap-2.5">
          <Button variant="coral" size="lg" full onClick={openChat}>
            Say something
          </Button>
          <Button variant="ghost" size="lg" full onClick={onClose}>
            Keep exploring
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
