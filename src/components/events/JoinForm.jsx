import { useState } from 'react'
import Button from '../ui/Button'
import { SelectChip } from '../ui/Chip'
import * as events from '../../services/liveEvents'
import { useStore } from '../../state/store'
import { themeOf } from '../../lib/liveEvent'
import { arm } from '../../lib/roundAlert'

/**
 * ── A name, and whatever the host asked ─────────────────────────────────────
 *
 * The shortest form in Looseleaf, and now genuinely short: **there is no
 * account**. No email, no code, no waiting on a university mail server while
 * forty people queue behind you. A name, the host's questions if they asked
 * any, and in.
 *
 * The earlier version made everybody verify an email first. The reasoning was
 * that a verified campus address proves a real student — but the QR is printed
 * on paper and taped to a door inside a building on campus, so the room was
 * already proving it. We were charging every attendee a minute for a guarantee
 * we already had.
 *
 * What comes back is a token, which the page stores and which *is* the
 * identity for the rest of the night.
 */
export default function JoinForm({ event, code, token, onJoined }) {
  const { state } = useStore()
  const accent = themeOf(event)
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
    //  The one gesture every attendee is guaranteed to make, and therefore
    //  the only reliable moment to unlock Web Audio. Without this the chime
    //  that stands in for vibration on an iPhone never plays.
    arm()

    setBusy(true)
    setError('')
    try {
      const res = await events.join(code, name.trim(), answers, token)
      await onJoined(res?.token)
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
        {event?.format === 'stations'
          ? 'Just so whoever’s running your table knows who they’re talking to.'
          : 'This is what the person across the table sees. Nothing else is.'}
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

      <p className="mt-4 text-center text-[13px] leading-relaxed text-mist">
        No account, no email, no app. Free.
      </p>
    </form>
  )
}
