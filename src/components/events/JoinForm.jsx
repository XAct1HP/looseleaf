import { useState } from 'react'
import Button from '../ui/Button'
import { SelectChip } from '../ui/Chip'
import * as events from '../../services/liveEvents'
import { useStore } from '../../state/store'
import { accentOf } from '../../lib/liveEvent'

/**
 * ── A name, and whatever the host asked ─────────────────────────────────────
 *
 * The shortest form in Looseleaf, on purpose. Somebody has ninety seconds
 * between the poster and the first bell, and every field between them and the
 * room is a person who doesn't join.
 *
 * A member who is already signed in gets their first name filled in and, if
 * the host asked nothing, a single button.
 */
export default function JoinForm({ event, code, onJoined }) {
  const { state } = useStore()
  const accent = accentOf(event?.accent)
  const fields = event?.fields ?? []

  const [name, setName] = useState(state.me?.firstName ?? '')
  const [answers, setAnswers] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (id, value) => setAnswers((a) => ({ ...a, [id]: value }))

  const toggle = (id, option) => {
    const current = Array.isArray(answers[id]) ? answers[id] : []
    set(id, current.includes(option) ? current.filter((v) => v !== option) : [...current, option])
  }

  const missing = fields.some((f) => {
    if (!f.required) return false
    const v = answers[f.id]
    return Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim()
  })

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim() || missing || busy) return
    setBusy(true)
    setError('')
    try {
      await events.join(code, name.trim(), answers)
      await onJoined()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (event && !event.join_open) {
    return (
      <div className="mt-8 rounded-card border border-rule bg-white p-6">
        <h2 className="font-display text-[22px] font-semibold leading-tight">Joining is closed.</h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-graphite">
          Find whoever is running it — they can still let you in.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-8">
      {event?.blurb && (
        <p className="mb-7 text-[15.5px] leading-relaxed text-graphite">{event.blurb}</p>
      )}

      <label htmlFor="join-name" className="label">
        What should we call you?
      </label>
      <input
        id="join-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        autoFocus={!name}
        autoComplete="given-name"
        placeholder="First name"
        className="field"
      />
      <p className="mt-2 text-[12.5px] text-mist">
        This is what the person across the table sees. Nothing else is.
      </p>

      {fields.map((f) => (
        <div key={f.id} className="mt-7">
          <label className="label" htmlFor={`f-${f.id}`}>
            {f.label}
            {!f.required && <span className="ml-1.5 font-normal text-mist">optional</span>}
          </label>

          {f.kind === 'choice' && (
            <div className="flex flex-wrap gap-2">
              {f.options.map((o) => (
                <SelectChip
                  key={o}
                  selected={answers[f.id] === o}
                  onClick={() => set(f.id, o)}
                >
                  {o}
                </SelectChip>
              ))}
            </div>
          )}

          {f.kind === 'multi_choice' && (
            <div className="flex flex-wrap gap-2">
              {f.options.map((o) => (
                <SelectChip
                  key={o}
                  selected={(answers[f.id] ?? []).includes(o)}
                  onClick={() => toggle(f.id, o)}
                >
                  {o}
                </SelectChip>
              ))}
            </div>
          )}

          {f.kind === 'yes_no' && (
            <div className="flex gap-2">
              {['Yes', 'No'].map((o) => (
                <SelectChip
                  key={o}
                  selected={answers[f.id] === o}
                  onClick={() => set(f.id, o)}
                >
                  {o}
                </SelectChip>
              ))}
            </div>
          )}

          {(f.kind === 'short_text' || f.kind === 'number') && (
            <input
              id={`f-${f.id}`}
              value={answers[f.id] ?? ''}
              onChange={(e) => set(f.id, e.target.value)}
              inputMode={f.kind === 'number' ? 'numeric' : 'text'}
              maxLength={80}
              className="field"
            />
          )}
        </div>
      ))}

      {error && (
        <p className="mt-5 rounded-xl bg-coral-wash px-3.5 py-2.5 text-[13.5px] leading-relaxed text-coral-deep">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="coral"
        size="lg"
        full
        className="mt-7"
        disabled={busy || !name.trim() || missing}
        style={{ background: accent.plate }}
      >
        {busy ? 'Joining…' : 'I’m here'}
      </Button>

      {event?.status === 'approved' && (
        <p className="mt-4 text-center text-[13px] text-mist">
          Joined early? Good — you’ll walk straight in.
        </p>
      )}
    </form>
  )
}
