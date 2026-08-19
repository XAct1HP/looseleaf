import { useCallback, useEffect, useState } from 'react'
import BackstageHeader from './BackstageHeader'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import EmptyState from '../../components/common/EmptyState'
import { Chip } from '../../components/ui/Chip'
import { IconCheck, IconX } from '../../components/ui/Icons'
import { useStore } from '../../state/store'
import * as staff from '../../services/staff'

const ago = (at) => {
  const ms = Date.now() - new Date(at).getTime()
  const h = Math.round(ms / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export default function EventQueue() {
  const { state, actions } = useStore()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [declining, setDeclining] = useState(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEvents(await staff.pendingEvents())
    } catch (e) {
      actions.showToast(e.message)
    } finally {
      setLoading(false)
    }
  }, [actions])

  useEffect(() => {
    load()
  }, [load])

  const publish = async (event) => {
    try {
      await staff.reviewEvent(event.id, state.session.userId, 'approved', '')
      actions.showToast('Published to campus.')
      load()
    } catch (e) {
      actions.showToast(e.message)
    }
  }

  const decline = async () => {
    try {
      await staff.reviewEvent(declining.id, state.session.userId, 'rejected', note)
      actions.showToast('Declined.')
      setDeclining(null)
      setNote('')
      load()
    } catch (e) {
      actions.showToast(e.message)
    }
  }

  return (
    <>
      <BackstageHeader
        title="Event queue"
        subtitle="Students suggest events; nothing appears on Campus until you publish it."
      />

      {loading ? (
        <p className="py-10 text-center text-[14px] text-mist">Loading…</p>
      ) : events.length === 0 ? (
        <EmptyState
          art="plane"
          title="Queue is empty."
          body="Nothing waiting to be reviewed. Suggestions show up here the moment a student sends one."
        />
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="rounded-card border border-rule bg-white px-5 py-5">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cream text-[22px]">
                  <span aria-hidden="true">{e.emoji}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[19px] font-semibold leading-tight">{e.title}</p>
                  <p className="mt-1 text-[13.5px] text-graphite">
                    {e.when}
                    {e.venue ? ` · ${e.venue}` : ''}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {e.kind && <Chip tone="cream">{e.kind}</Chip>}
                    <span className="text-[12.5px] text-mist">
                      {e.authorName ? `from ${e.authorName}` : 'from a student'} · {ago(e.submittedAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="md"
                  className="flex-1"
                  onClick={() => {
                    setDeclining(e)
                    setNote('')
                  }}
                >
                  <IconX size={16} />
                  Decline
                </Button>
                <Button variant="coral" size="md" className="flex-1" onClick={() => publish(e)}>
                  <IconCheck size={16} />
                  Publish
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={!!declining}
        onClose={() => setDeclining(null)}
        title="Decline this suggestion"
        subtitle="Whoever suggested it sees your note. Being told why is the difference between moderation and a black hole."
      >
        <label htmlFor="decline-note" className="label">
          Why not? <span className="font-normal text-mist">· optional but kind</span>
        </label>
        <textarea
          id="decline-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="field resize-none"
          placeholder="Couldn't confirm this one was happening — resend if you have a link?"
        />
        <Button variant="primary" size="lg" full className="mt-5" onClick={decline}>
          Decline
        </Button>
      </Sheet>
    </>
  )
}
