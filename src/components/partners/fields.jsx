import { useEffect, useRef, useState } from 'react'
import { SelectChip } from '../ui/Chip'
import { IconPlus, IconX } from '../ui/Icons'
import { displayableUrl } from '../../lib/imagePipeline'

/** A labelled input, with room for the hint that stops a support email. */
export function Field({ label, hint, error, children, required, htmlFor }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-1 text-coral">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[12.5px] text-coral-deep">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextInput({ id, value, onChange, ...props }) {
  return (
    <input
      id={id}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="field"
      {...props}
    />
  )
}

export function TextArea({ id, value, onChange, rows = 4, maxLength, ...props }) {
  return (
    <>
      <textarea
        id={id}
        value={value ?? ''}
        rows={rows}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="field resize-y"
        {...props}
      />
      {maxLength && (
        <p className="mt-1 text-right text-[11.5px] tabular-nums text-mist">
          {(value ?? '').length}/{maxLength}
        </p>
      )}
    </>
  )
}

export function Select({ id, value, onChange, options, placeholder = 'Choose one', ...props }) {
  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="field appearance-none bg-[length:16px] bg-[right_1rem_center] bg-no-repeat pr-10"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238B93A3' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.emoji ? `${o.emoji}  ${o.label}` : o.label}
        </option>
      ))}
    </select>
  )
}

/** Multi-select chips. `max` caps how many can be on at once. */
export function TagPicker({ options, value = [], onChange, max = null }) {
  const toggle = (id) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id))
    else if (!max || value.length < max) onChange([...value, id])
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <SelectChip key={o.id} selected={value.includes(o.id)} onClick={() => toggle(o.id)}>
          {o.emoji && <span aria-hidden="true">{o.emoji}</span>}
          {o.label}
        </SelectChip>
      ))}
    </div>
  )
}

const PRICE_LEVELS = [
  { id: 1, label: '$', hint: 'Under $15 a head' },
  { id: 2, label: '$$', hint: '$15–30' },
  { id: 3, label: '$$$', hint: '$30–60' },
  { id: 4, label: '$$$$', hint: '$60+' },
]

export function PricePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {PRICE_LEVELS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          aria-pressed={value === p.id}
          className={`press focus-ring rounded-2xl border px-2 py-3 text-center transition ${
            value === p.id
              ? 'border-navy bg-navy text-paper'
              : 'border-rule bg-white text-graphite hover:border-navy/25'
          }`}
        >
          <span className="block text-[16px] font-semibold">{p.label}</span>
          <span
            className={`mt-0.5 block text-[10.5px] leading-tight ${
              value === p.id ? 'text-paper/65' : 'text-mist'
            }`}
          >
            {p.hint}
          </span>
        </button>
      ))}
    </div>
  )
}

/* ── photos ─────────────────────────────────────────────────────────────── */

/**
 * One image slot.
 *
 * The upload starts the moment a file is picked, but the preview does not wait
 * for it: the browser already has the bytes, so it shows them straight away
 * from an object URL and swaps to the uploaded copy when that arrives. Without
 * this, the review step of onboarding showed an empty rectangle where somebody
 * had just put their best photo of the room — the file existed, it simply
 * hadn't finished its round trip.
 */
export function PhotoSlot({ label, url, onPick, onClear, aspect = 'aspect-[3/2]', busy }) {
  const input = useRef(null)
  const [local, setLocal] = useState(null)

  // Revoke on unmount and whenever it's replaced, or every pick leaks a blob.
  useEffect(() => () => local && URL.revokeObjectURL(local), [local])

  // Once the real URL lands, let go of the local copy.
  useEffect(() => {
    if (url && local) {
      URL.revokeObjectURL(local)
      setLocal(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const shown = url || local

  return (
    <div>
      {label && <p className="label">{label}</p>}
      <div
        className={`relative overflow-hidden rounded-2xl border border-dashed border-navy/20 bg-cream/60 ${aspect}`}
      >
        {shown ? (
          <>
            <img
              src={shown}
              alt=""
              decoding="async"
              className={`h-full w-full object-cover transition-opacity ${
                local && !url ? 'opacity-70' : 'opacity-100'
              }`}
            />
            {busy && (
              <span className="absolute inset-x-0 bottom-0 bg-navy/70 py-1 text-center text-[11px] font-medium text-paper">
                Uploading…
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                if (local) {
                  URL.revokeObjectURL(local)
                  setLocal(null)
                }
                onClear()
              }}
              aria-label={`Remove ${label || 'photo'}`}
              className="press absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-graphite shadow-paper hover:text-navy"
            >
              <IconX size={15} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="focus-ring flex h-full w-full flex-col items-center justify-center gap-1.5 text-mist transition hover:text-graphite"
          >
            <IconPlus size={20} />
            <span className="text-[12.5px]">{busy ? 'Uploading…' : 'Add a photo'}</span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        /* HEIC spelled out as well as image/*: iOS reports an original photo
           from Files as image/heic, and some Android pickers send an empty
           type for it, which a bare image/* filter then hides. */
        accept="image/*,.heic,.heif,image/heic,image/heif"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          if (local) URL.revokeObjectURL(local)
          setLocal(null)
          // Upload first, so a slow HEIC conversion for the *preview* never
          // delays the thing that actually matters.
          onPick(file)
          // …and a HEIC has to be converted before it can be previewed at all;
          // a raw one in an <img> is a broken icon everywhere but Safari.
          try {
            setLocal(await displayableUrl(file))
          } catch {
            /* the uploaded copy will arrive and stand in for it */
          }
        }}
      />
    </div>
  )
}

/* ── hours ──────────────────────────────────────────────────────────────── */

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Hours as `{ mon: [["11:00","22:00"]] }`. An empty array means closed; a
 * missing key means "we haven't said", which the recommender treats as open
 * rather than burying a partner who skipped this screen.
 */
export function HoursEditor({ value = {}, onChange }) {
  const set = (key, next) => onChange({ ...value, [key]: next })

  return (
    <div className="divide-y divide-rule rounded-2xl border border-rule bg-white">
      {DAY_KEYS.map((key, i) => {
        const windows = value[key]
        const closed = Array.isArray(windows) && windows.length === 0
        const w = windows?.[0] ?? ['', '']

        return (
          <div key={key} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="w-[86px] shrink-0 text-[14px] font-medium text-navy">{DAY_LABELS[i]}</span>

            {closed ? (
              <span className="flex-1 text-[13.5px] text-mist">Closed</span>
            ) : (
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="time"
                  value={w[0]}
                  onChange={(e) => set(key, [[e.target.value, w[1] || '']])}
                  aria-label={`${DAY_LABELS[i]} opens`}
                  className="w-[118px] rounded-xl border border-rule bg-white px-2.5 py-2 text-[13.5px] text-navy focus:border-notebook-deep/50 focus:outline-none"
                />
                <span className="text-[13px] text-mist">to</span>
                <input
                  type="time"
                  value={w[1]}
                  onChange={(e) => set(key, [[w[0] || '', e.target.value]])}
                  aria-label={`${DAY_LABELS[i]} closes`}
                  className="w-[118px] rounded-xl border border-rule bg-white px-2.5 py-2 text-[13.5px] text-navy focus:border-notebook-deep/50 focus:outline-none"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => set(key, closed ? [['11:00', '22:00']] : [])}
              className="focus-ring shrink-0 rounded-lg px-2 py-1 text-[12.5px] font-medium text-graphite hover:text-navy"
            >
              {closed ? 'Set hours' : 'Closed'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Sunday-first day toggles, matching Postgres `extract(dow)`. */
export function DayPicker({ value = [], onChange }) {
  const short = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  return (
    <div className="flex gap-1.5">
      {short.map((s, i) => {
        const on = value.includes(i)
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(on ? value.filter((d) => d !== i) : [...value, i].sort())}
            aria-label={DAY_LABELS[i]}
            aria-pressed={on}
            className={`press focus-ring h-10 w-10 rounded-full border text-[13.5px] font-semibold transition ${
              on
                ? 'border-navy bg-navy text-paper'
                : 'border-rule bg-white text-graphite hover:border-navy/25'
            }`}
          >
            {s}
          </button>
        )
      })}
    </div>
  )
}

/* ── money ──────────────────────────────────────────────────────────────── */

export function MoneyInput({ id, cents, onChange, placeholder = '0.00' }) {
  const [text, setText] = useState(cents != null ? (cents / 100).toFixed(2) : '')

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-mist">
        $
      </span>
      <input
        id={id}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, '')
          setText(raw)
          const n = Number.parseFloat(raw)
          onChange(Number.isFinite(n) ? Math.round(n * 100) : null)
        }}
        className="field !pl-8"
      />
    </div>
  )
}
