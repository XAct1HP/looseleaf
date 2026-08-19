import { useCallback, useEffect, useState } from 'react'
import SubPageHeader from '../../components/common/SubPageHeader'
import RailCard from '../../components/common/RailCard'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import { Chip } from '../../components/ui/Chip'
import EmptyState from '../../components/common/EmptyState'
import { PersonAvatar } from '../../components/brand/Portrait'
import { useRail } from '../../components/nav/AppLayout'
import { CAMPUS_EVENTS } from '../../data/catalog'
import { PEOPLE } from '../../data/people'
import { IconCheck, IconPlus, IconX } from '../../components/ui/Icons'
import { useStore } from '../../state/store'
import { isDemo, events as eventApi } from '../../services/backend'

const KINDS = ['Sports', 'Music', 'Arts', 'Around town', 'Campus', 'Free food']
const EMOJI = ['📌', '🏈', '🏀', '🏒', '🎶', '🎬', '🎭', '🎉', '🍕', '🏮']

/* ── submission ─────────────────────────────────────────────────────────── */

function SubmitSheet({ open, onClose, onSubmit }) {
  const [form, setForm] = useState({ title: '', when: '', venue: '', kind: 'Around town', emoji: '📌' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    setBusy(true)
    setError('')
    try {
      await onSubmit(form)
      setForm({ title: '', when: '', venue: '', kind: 'Around town', emoji: '📌' })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Suggest an event"
      subtitle="We read every one. If it's real and it's on campus, it goes up."
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="ev-title" className="label">
            What is it?
          </label>
          <input
            id="ev-title"
            className="field"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Kerrytown night market"
          />
        </div>
        <div>
          <label htmlFor="ev-when" className="label">
            When
          </label>
          <input
            id="ev-when"
            className="field"
            value={form.when}
            onChange={(e) => setForm({ ...form, when: e.target.value })}
            placeholder="Thursday · 6 PM"
          />
        </div>
        <div>
          <label htmlFor="ev-venue" className="label">
            Where <span className="font-normal text-mist">· optional</span>
          </label>
          <input
            id="ev-venue"
            className="field"
            value={form.venue}
            onChange={(e) => setForm({ ...form, venue: e.target.value })}
            placeholder="Kerrytown"
          />
        </div>
        <div>
          <span className="label">Kind</span>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setForm({ ...form, kind: k })}
                className={`press focus-ring rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition ${
                  form.kind === k ? 'border-navy bg-navy text-paper' : 'border-rule bg-white text-graphite'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Icon</span>
          <div className="flex flex-wrap gap-2">
            {EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setForm({ ...form, emoji: e })}
                aria-label={`Icon ${e}`}
                className={`press focus-ring flex h-10 w-10 items-center justify-center rounded-xl border text-[18px] transition ${
                  form.emoji === e ? 'border-coral bg-coral-wash' : 'border-rule bg-white'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-coral-wash px-4 py-3 text-[13.5px] text-coral-deep">{error}</p>
      )}

      <Button
        variant="coral"
        size="lg"
        full
        className="mt-6"
        disabled={busy || !form.title.trim() || !form.when.trim()}
        onClick={send}
      >
        {busy ? 'Sending…' : 'Send for review'}
      </Button>
      <p className="mt-3 text-center text-[12px] leading-relaxed text-mist">
        You'll see it here marked “waiting” until it's approved.
      </p>
    </Sheet>
  )
}

/* ── one row ────────────────────────────────────────────────────────────── */

function EventRow({ event, interested, faces, onToggle, admin, onReview, onWithdraw }) {
  const pending = event.status === 'pending'
  const rejected = event.status === 'rejected'

  return (
    <li
      className={`lift-corner rounded-card border px-5 py-5 ${
        pending ? 'border-dashed border-navy/20 bg-cream/50' : rejected ? 'border-rule bg-white opacity-70' : 'border-rule bg-white'
      }`}
    >
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cream text-[22px]">
          <span aria-hidden="true">{event.emoji}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-[19px] font-semibold leading-tight">{event.title}</p>
            {pending && <Chip tone="cream">Waiting for review</Chip>}
            {rejected && <Chip tone="coral">Not published</Chip>}
          </div>
          <p className="mt-1 text-[13.5px] text-graphite">
            {event.when}
            {event.venue ? ` · ${event.venue}` : ''}
          </p>
          {event.authorName && (
            <p className="mt-1 text-[12.5px] text-mist">Suggested by {event.authorName}</p>
          )}
          {rejected && event.rejectNote && (
            <p className="mt-2 text-[13px] text-graphite">{event.rejectNote}</p>
          )}

          {faces?.length > 0 && (
            <div className="mt-3 flex items-center gap-2.5">
              <span className="flex -space-x-2">
                {faces.map((p) => (
                  <PersonAvatar key={p.id} id={`${p.id}-0`} size={26} ring />
                ))}
              </span>
              <span className="text-[12.5px] text-mist">interested</span>
            </div>
          )}
        </div>
      </div>

      {admin && pending ? (
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="md" className="flex-1" onClick={() => onReview(event, 'rejected')}>
            <IconX size={16} />
            Decline
          </Button>
          <Button variant="coral" size="md" className="flex-1" onClick={() => onReview(event, 'approved')}>
            <IconCheck size={16} />
            Publish
          </Button>
        </div>
      ) : pending ? (
        <Button variant="ghost" size="md" full className="mt-4" onClick={() => onWithdraw(event)}>
          Withdraw
        </Button>
      ) : (
        !rejected && (
          <Button
            variant={interested ? 'soft' : 'outline'}
            size="md"
            full
            className="mt-4"
            onClick={() => onToggle(event)}
          >
            {interested ? (
              <>
                <IconCheck size={16} />
                You’re interested
              </>
            ) : (
              'I’m interested'
            )}
          </Button>
        )
      )}
    </li>
  )
}

/* ── page ───────────────────────────────────────────────────────────────── */

export default function Events() {
  const { state, actions } = useStore()
  const [events, setEvents] = useState([])
  const [interested, setInterested] = useState([])
  const [loading, setLoading] = useState(!isDemo)
  const [submitting, setSubmitting] = useState(false)

  const admin = Boolean(state.me?.isAdmin)

  const load = useCallback(async () => {
    if (isDemo) {
      setEvents(CAMPUS_EVENTS.map((e) => ({ ...e, status: 'approved' })))
      return
    }
    setLoading(true)
    try {
      const [list, mine] = await Promise.all([
        eventApi.listEvents(),
        eventApi.myInterests(state.session.userId),
      ])
      setEvents(list)
      setInterested(mine)
    } catch (err) {
      actions.showToast(err.message)
    } finally {
      setLoading(false)
    }
  }, [state.session.userId, actions])

  useEffect(() => {
    load()
  }, [load])

  useRail(
    <>
      <RailCard title="How events work">
        <p className="text-[13.5px] leading-relaxed text-graphite">
          Anyone on campus can suggest one. A human reads it before it goes up, so the list stays real.
        </p>
      </RailCard>
      {admin && (
        <RailCard title="You're staff" tone="coral">
          <p className="text-[13.5px] leading-relaxed text-[#8A3A3E]">
            Pending suggestions appear at the top of this page with Publish and Decline on them.
          </p>
        </RailCard>
      )}
    </>,
    [admin]
  )

  const toggleInterest = async (event) => {
    const on = interested.includes(event.id)
    setInterested((list) => (on ? list.filter((id) => id !== event.id) : [...list, event.id]))
    if (isDemo) return
    try {
      await eventApi.setInterested(state.session.userId, event.id, !on)
    } catch (err) {
      actions.showToast(err.message)
      load()
    }
  }

  const review = async (event, decision) => {
    const note =
      decision === 'rejected'
        ? window.prompt('Optional: why not? The person who suggested it will see this.') ?? ''
        : ''
    try {
      await eventApi.reviewEvent(event.id, state.session.userId, decision, note)
      actions.showToast(decision === 'approved' ? 'Published to campus.' : 'Declined.')
      load()
    } catch (err) {
      actions.showToast(err.message)
    }
  }

  const withdraw = async (event) => {
    try {
      await eventApi.withdrawEvent(event.id)
      load()
    } catch (err) {
      actions.showToast(err.message)
    }
  }

  const submit = async (form) => {
    await eventApi.submitEvent(state.session.userId, state.me.universityId, form)
    actions.showToast('Sent for review. Thanks — that helps everyone.')
    load()
  }

  const pending = events.filter((e) => e.status === 'pending')
  const published = events.filter((e) => e.status === 'approved')
  const declined = events.filter((e) => e.status === 'rejected')

  return (
    <>
      <SubPageHeader
        title="Events"
        subtitle="Find people who are going to the same thing as you."
        action={
          !isDemo && (
            <Button variant="coral" size="md" className="shrink-0" onClick={() => setSubmitting(true)}>
              <IconPlus size={17} />
              Suggest one
            </Button>
          )
        }
      />

      {loading ? (
        <p className="py-10 text-center text-[14px] text-mist">Loading…</p>
      ) : events.length === 0 ? (
        <EmptyState
          art="plane"
          title="Nothing on the calendar yet."
          body="Events come from students. If you know something happening on campus, put it up — it's the fastest way to make this page worth opening."
          action={
            <Button variant="coral" size="lg" onClick={() => setSubmitting(true)}>
              Suggest the first one
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
                {admin ? `Waiting for review · ${pending.length}` : 'Yours, waiting for review'}
              </h2>
              <ul className="space-y-4">
                {pending.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    admin={admin}
                    onReview={review}
                    onWithdraw={withdraw}
                    onToggle={toggleInterest}
                  />
                ))}
              </ul>
            </section>
          )}

          {published.length > 0 && (
            <section>
              {pending.length > 0 && (
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
                  On campus
                </h2>
              )}
              <ul className="space-y-4">
                {published.map((e, idx) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    interested={interested.includes(e.id)}
                    faces={isDemo ? PEOPLE.slice(idx * 3, idx * 3 + 4) : []}
                    onToggle={toggleInterest}
                  />
                ))}
              </ul>
            </section>
          )}

          {declined.length > 0 && (
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-mist">
                Not published
              </h2>
              <ul className="space-y-4">
                {declined.map((e) => (
                  <EventRow key={e.id} event={e} onWithdraw={withdraw} onToggle={toggleInterest} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <SubmitSheet open={submitting} onClose={() => setSubmitting(false)} onSubmit={submit} />
    </>
  )
}
