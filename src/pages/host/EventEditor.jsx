import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import HostShell, { StatusPill } from './HostShell'
import Button from '../../components/ui/Button'
import { SelectChip } from '../../components/ui/Chip'
import * as events from '../../services/liveEvents'
import {
  ACCENTS,
  FIELD_KINDS,
  PRESETS,
  accentOf,
  planSentence,
  schedulePlan,
} from '../../lib/liveEvent'

/**
 * ── Setting one up ──────────────────────────────────────────────────────────
 *
 * A first-time host should not have to have an opinion about `pairing_mode`.
 * So the page leads with three presets that are each a complete set of answers
 * — not a starting point somebody has to finish — and everything below them is
 * for the second event, once they know what they'd change.
 *
 * The other job here is arithmetic. "Twelve rounds of four minutes" means
 * nothing until you're told it's fifty-four minutes and that everyone meets
 * twelve of the other nineteen. Finding that out in the room is the wrong
 * moment, so the plan sentence updates as they type.
 */
export default function EventEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [ev, setEv] = useState(null)
  const [fields, setFields] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // new-event form
  const [title, setTitle] = useState('')
  const [venue, setVenue] = useState('')
  const [startsAt, setStartsAt] = useState('')

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await events.getEvent(id)
        if (cancelled || !data) return
        setEv(data.event)
        setFields(data.fields)
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, isNew])

  const create = async (e) => {
    e.preventDefault()
    if (busy || !title.trim()) return
    setBusy(true)
    setError('')
    try {
      const newId = await events.createEvent({
        title: title.trim(),
        venue: venue.trim() || null,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      })
      navigate(`/host/${newId}`, { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (isNew) {
    return (
      <HostShell title="A new event" subtitle="Three things now; the rest on the next screen." back="/host">
        <form onSubmit={create} className="max-w-[460px]">
          <label htmlFor="ev-title" className="label">
            What’s it called?
          </label>
          <input
            id="ev-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={90}
            autoFocus
            placeholder="Sigma Speed Dating"
            className="field"
          />

          <label htmlFor="ev-venue" className="label mt-6">
            Where <span className="font-normal text-mist">optional</span>
          </label>
          <input
            id="ev-venue"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            maxLength={120}
            placeholder="Michigan Union, Room 3"
            className="field"
          />
          <p className="mt-2 text-[12.5px] text-mist">
            Just a label for the poster. We don’t store a location.
          </p>

          <label htmlFor="ev-when" className="label mt-6">
            When <span className="font-normal text-mist">optional</span>
          </label>
          <input
            id="ev-when"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="field"
          />

          {error && (
            <p className="mt-5 rounded-xl bg-coral-wash px-3.5 py-2.5 text-[13.5px] text-coral-deep">
              {error}
            </p>
          )}

          <Button type="submit" variant="coral" size="lg" full className="mt-7" disabled={busy || !title.trim()}>
            {busy ? 'Creating…' : 'Create it'}
          </Button>
        </form>
      </HostShell>
    )
  }

  if (!ev) return <HostShell title="One moment…" back="/host" />

  return (
    <Editor
      ev={ev}
      fields={fields}
      setEv={setEv}
      setFields={setFields}
      error={error}
      setError={setError}
      saved={saved}
      setSaved={setSaved}
    />
  )
}

function Editor({ ev, fields, setEv, setFields, error, setError, saved, setSaved }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const locked = Boolean(ev.started_at)
  const accent = accentOf(ev.accent)

  const patch = (p) => setEv((e) => ({ ...e, ...p }))

  const plan = useMemo(
    () =>
      schedulePlan({
        people: 20,
        roundSeconds: ev.round_seconds,
        breakSeconds: ev.break_seconds,
        plannedRounds: ev.planned_rounds,
      }),
    [ev.round_seconds, ev.break_seconds, ev.planned_rounds]
  )

  const applyPreset = (preset) => {
    patch(preset.patch)
    if (!locked) setFields(preset.fields.map((f, i) => ({ ...f, id: `new-${i}`, position: i })))
  }

  const save = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await events.updateEvent(ev.id, {
        title: ev.title,
        blurb: ev.blurb ?? '',
        venue_label: ev.venue_label ?? '',
        round_seconds: ev.round_seconds,
        break_seconds: ev.break_seconds,
        planned_rounds: ev.planned_rounds,
        advance: ev.advance,
        pairing_mode: ev.pairing_mode,
        likes_enabled: ev.likes_enabled,
        reveal: ev.reveal,
        notes_enabled: ev.notes_enabled,
        join_opens: ev.join_opens,
        accent: ev.accent,
        welcome_line: ev.welcome_line ?? '',
      })
      if (!locked) {
        await events.setFields(
          ev.id,
          fields.map((f) => ({
            label: f.label,
            kind: f.kind,
            options: f.options ?? [],
            required: !!f.required,
            use_for_pairing: !!f.use_for_pairing,
            show_to_partner: !!f.show_to_partner,
          }))
        )
        const fresh = await events.getEvent(ev.id)
        setFields(fresh.fields)
        setEv(fresh.event)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    await save()
    try {
      await events.submitEvent(ev.id)
      patch({ status: 'pending' })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <HostShell
      title={ev.title}
      back="/host"
      action={
        <div className="flex items-center gap-3">
          <StatusPill status={ev.status} />
          <code className="font-display text-[19px] font-semibold tracking-[0.16em] text-mist">
            {ev.code}
          </code>
        </div>
      }
    >
      {locked && (
        <p className="mb-6 rounded-card border border-[#F2E6D6] bg-cream/70 px-4 py-3.5 text-[14px] leading-relaxed text-graphite">
          This event has started, so the door questions are fixed. Everything else can still change.
        </p>
      )}

      {/* ── presets ── */}
      <Section title="What kind of night is it?" hint="Pick one and the settings below are done.">
        <div className="grid gap-3 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              className="press focus-ring rounded-card border border-rule bg-white p-4 text-left transition-colors hover:border-navy/25"
            >
              <p className="font-display text-[17px] font-semibold">{p.label}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-graphite">{p.blurb}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* ── format ── */}
      <Section title="The rotation">
        <div className="grid gap-4 sm:grid-cols-3">
          <Number
            label="Round length"
            suffix="min"
            value={Math.round(ev.round_seconds / 60)}
            min={1}
            max={30}
            onChange={(n) => patch({ round_seconds: n * 60 })}
          />
          <Number
            label="Break between"
            suffix="sec"
            value={ev.break_seconds}
            min={0}
            max={300}
            step={10}
            onChange={(n) => patch({ break_seconds: n })}
          />
          <Number
            label="How many rounds"
            value={ev.planned_rounds ?? ''}
            min={1}
            max={40}
            placeholder="auto"
            onChange={(n) => patch({ planned_rounds: n || null })}
          />
        </div>

        {/*  The arithmetic said out loud. Assumes twenty people because that is
             what a first event tends to be; the run screen shows the real
             version once there are real people in the room. */}
        <p className="mt-4 rounded-card border border-rule bg-white px-4 py-3 text-[14px] leading-relaxed text-graphite">
          <span className="font-medium text-navy">With 20 people:</span>{' '}
          {planSentence(plan, 20)}
        </p>

        <Field label="Who meets whom" className="mt-6">
          <div className="flex flex-wrap gap-2">
            {[
              ['mixer', 'Everyone meets everyone'],
              ['across', 'Pair across the groups below'],
              ['avoid_same', 'Prefer different answers'],
            ].map(([id, label]) => (
              <SelectChip
                key={id}
                selected={ev.pairing_mode === id}
                onClick={() => patch({ pairing_mode: id })}
              >
                {label}
              </SelectChip>
            ))}
          </div>
          {ev.pairing_mode !== 'mixer' && !fields.some((f) => f.use_for_pairing) && (
            <p className="mt-2.5 text-[13px] text-coral-deep">
              Add a question below and mark it “use this to pair people”, or this behaves like
              everyone-meets-everyone.
            </p>
          )}
        </Field>

        <Field label="Moving between rounds" className="mt-6">
          <div className="flex flex-wrap gap-2">
            <SelectChip selected={ev.advance === 'auto'} onClick={() => patch({ advance: 'auto' })}>
              On the clock
            </SelectChip>
            <SelectChip
              selected={ev.advance === 'manual'}
              onClick={() => patch({ advance: 'manual' })}
            >
              When I say so
            </SelectChip>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
            On the clock is better than it sounds — it keeps running even if your phone locks.
          </p>
        </Field>
      </Section>

      {/* ── door questions ── */}
      <Section
        title="At the door"
        hint="Up to six. Every one of these is a person deciding whether to bother, so ask less than you want to."
      >
        <FieldsEditor fields={fields} setFields={setFields} disabled={locked} />
      </Section>

      {/* ── modules ── */}
      <Section title="Matching">
        <Toggle
          label="People can say yes to each other"
          hint="Turn this off for a club night where the point is meeting members, not dating."
          value={ev.likes_enabled}
          onChange={(v) => patch({ likes_enabled: v })}
        />
        {ev.likes_enabled && (
          <Field label="When do matches show up?" className="mt-6">
            <div className="flex flex-wrap gap-2">
              {[
                ['end', 'At the end, when I say'],
                ['live', 'As they happen'],
                ['never', 'Never show them'],
              ].map(([id, label]) => (
                <SelectChip key={id} selected={ev.reveal === id} onClick={() => patch({ reveal: id })}>
                  {label}
                </SelectChip>
              ))}
            </div>
          </Field>
        )}
        <Toggle
          className="mt-6"
          label="Private notes"
          hint="A box after each conversation that only that person ever reads."
          value={ev.notes_enabled}
          onChange={(v) => patch({ notes_enabled: v })}
        />
      </Section>

      {/* ── the door ── */}
      <Section title="Getting in">
        <Field label="Who can join">
          <div className="flex flex-wrap gap-2">
            {[
              ['anytime', 'Any time, even late'],
              ['until_start', 'Until I start it'],
            ].map(([id, label]) => (
              <SelectChip
                key={id}
                selected={ev.join_opens === id}
                onClick={() => patch({ join_opens: id })}
              >
                {label}
              </SelectChip>
            ))}
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
            Late arrivals are fine either way — anyone who joins mid-event is seated from the next
            round.
          </p>
        </Field>
      </Section>

      {/* ── brand ── */}
      <Section title="How it looks" hint="On everyone’s phone, and on the poster.">
        <Field label="Colour">
          <div className="flex flex-wrap gap-2.5">
            {Object.entries(ACCENTS).map(([key, a]) => (
              <button
                key={key}
                type="button"
                onClick={() => patch({ accent: key })}
                aria-label={a.label}
                aria-pressed={ev.accent === key}
                className={`press focus-ring h-11 w-11 rounded-full border-2 transition-transform ${
                  ev.accent === key ? 'border-navy scale-105' : 'border-transparent'
                }`}
                style={{ background: a.plate }}
              />
            ))}
          </div>
        </Field>

        <Field label="A line to welcome people" className="mt-6">
          <input
            value={ev.welcome_line ?? ''}
            onChange={(e) => patch({ welcome_line: e.target.value })}
            maxLength={160}
            placeholder="Glad you came. Put your phone on vibrate."
            className="field"
          />
        </Field>

        <Field label="What is this event?" className="mt-6">
          <textarea
            value={ev.blurb ?? ''}
            onChange={(e) => patch({ blurb: e.target.value })}
            maxLength={400}
            rows={3}
            placeholder="Four minutes each, ten rounds, free pizza after."
            className="field resize-none"
          />
        </Field>
      </Section>

      {error && (
        <p className="mt-6 rounded-xl bg-coral-wash px-3.5 py-2.5 text-[13.5px] text-coral-deep">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 mt-10 flex flex-wrap gap-3 border-t border-rule bg-paper/95 py-4 backdrop-blur">
        <Button type="button" variant="primary" size="lg" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </Button>

        {ev.status === 'draft' && (
          <Button type="button" variant="coral" size="lg" onClick={submit} disabled={busy}>
            Send it to us to approve
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => navigate(`/host/${ev.id}/print`)}
        >
          Print kit
        </Button>

        {['approved', 'running', 'paused'].includes(ev.status) && (
          <Button
            type="button"
            variant="coral"
            size="lg"
            onClick={() => navigate(`/host/${ev.id}/run`)}
            style={{ background: accent.plate }}
          >
            {ev.status === 'approved' ? 'Run it' : 'Back to the console'}
          </Button>
        )}
      </div>
    </HostShell>
  )
}

/* ── the field builder ─────────────────────────────────────────────────────
 *
 * Deliberately mean. Five kinds, six questions, and two switches — no
 * conditional logic, no validation rules, no sections. This is the seam where
 * a rotation timer quietly becomes a general-purpose form builder, and the
 * database enforces the limit too so a future screen can't drift past it.
 */
function FieldsEditor({ fields, setFields, disabled }) {
  const update = (i, p) => setFields(fields.map((f, k) => (k === i ? { ...f, ...p } : f)))
  const remove = (i) => setFields(fields.filter((_, k) => k !== i))
  const add = () =>
    setFields([
      ...fields,
      { id: `new-${Date.now()}`, label: '', kind: 'short_text', options: [], required: false },
    ])

  return (
    <div className="space-y-4">
      {fields.map((f, i) => (
        <div key={f.id ?? i} className="rounded-card border border-rule bg-white p-4">
          <div className="flex items-start gap-3">
            <input
              value={f.label}
              onChange={(e) => update(i, { label: e.target.value })}
              maxLength={60}
              disabled={disabled}
              placeholder="I’d like to meet"
              className="field flex-1"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="press focus-ring shrink-0 rounded-full px-3 py-2.5 text-[13.5px] font-medium text-mist hover:text-coral-deep"
              >
                Remove
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {FIELD_KINDS.map((k) => (
              <SelectChip
                key={k.id}
                selected={f.kind === k.id}
                disabled={disabled}
                onClick={() => update(i, { kind: k.id })}
              >
                {k.label}
              </SelectChip>
            ))}
          </div>

          {(f.kind === 'choice' || f.kind === 'multi_choice') && (
            <input
              value={(f.options ?? []).join(', ')}
              onChange={(e) =>
                update(i, {
                  options: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              disabled={disabled}
              placeholder="Women, Men, Everyone"
              className="field mt-3"
            />
          )}

          <div className="mt-4 space-y-3 border-t border-rule pt-4">
            <Check
              label="Required"
              checked={!!f.required}
              disabled={disabled}
              onChange={(v) => update(i, { required: v })}
            />
            {(f.kind === 'choice' || f.kind === 'yes_no') && (
              <Check
                label="Use this to pair people"
                hint="The answer decides who sits with whom."
                checked={!!f.use_for_pairing}
                disabled={disabled}
                onChange={(v) =>
                  setFields(
                    fields.map((x, k) => ({ ...x, use_for_pairing: k === i ? v : false }))
                  )
                }
              />
            )}
            <Check
              label="Show the answer to the person across the table"
              hint="Off by default. Ask yourself whether a stranger needs it."
              checked={!!f.show_to_partner}
              disabled={disabled}
              onChange={(v) => update(i, { show_to_partner: v })}
            />
          </div>
        </div>
      ))}

      {!disabled && fields.length < 6 && (
        <Button type="button" variant="outline" size="md" onClick={add}>
          Add a question
        </Button>
      )}
    </div>
  )
}

/* ── small pieces ───────────────────────────────────────────────────────── */

function Section({ title, hint, children }) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-[21px] font-semibold leading-tight">{title}</h2>
      {hint && <p className="mt-1.5 max-w-[56ch] text-[13.5px] leading-relaxed text-mist">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <p className="label">{label}</p>
      {children}
    </div>
  )
}

function Number({ label, value, onChange, suffix, placeholder, ...rest }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="relative">
        <input
          type="number"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
          className="field pr-14"
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-mist">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function Toggle({ label, hint, value, onChange, className = '' }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 ${className}`}>
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-coral"
      />
      <span>
        <span className="block text-[15px] font-medium text-navy">{label}</span>
        {hint && <span className="mt-1 block text-[13px] leading-relaxed text-mist">{hint}</span>}
      </span>
    </label>
  )
}

function Check({ label, hint, checked, onChange, disabled }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-coral"
      />
      <span>
        <span className="block text-[14px] text-navy">{label}</span>
        {hint && <span className="mt-0.5 block text-[12.5px] leading-relaxed text-mist">{hint}</span>}
      </span>
    </label>
  )
}
