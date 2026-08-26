import { useState } from 'react'
import { SelectChip } from '../ui/Chip'
import {
  DATE_BUDGETS,
  DRINKS_ON_DATES,
  IDEAL_DATES,
  INTERESTS_BY_CATEGORY,
  SURVEY,
} from '../../data/catalog'

/**
 * ── The two fields the matching engine actually runs on ─────────────────────
 *
 * They live here, in one file, rather than inside the onboarding page, because
 * they are asked in two places — during signup and again from Edit profile —
 * and a question asked two slightly different ways gets two different answers.
 * Whatever is true of these controls has to be true in both.
 */

/**
 * A hundred and twenty interests is a much better question than thirty — but
 * only if it stays answerable. So: grouped by category, with a search box that
 * cuts straight to what somebody already had in mind, and the ones they have
 * chosen pinned at the top so the list never loses them.
 */
export function InterestPicker({ value = [], onChange, className = '' }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  const groups = INTERESTS_BY_CATEGORY.map((c) => ({
    ...c,
    items: q ? c.items.filter((i) => i.label.toLowerCase().includes(q)) : c.items,
  })).filter((c) => c.items.length > 0)

  const chosen = INTERESTS_BY_CATEGORY.flatMap((c) => c.items).filter((i) => value.includes(i.id))

  return (
    <div className={className}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search interests…"
        aria-label="Search interests"
        className="field mb-5"
      />

      {chosen.length > 0 && (
        <div className="mb-5 rounded-card border border-coral/25 bg-coral-wash/50 px-4 py-4">
          <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-coral-deep">
            Picked
          </p>
          <div className="flex flex-wrap gap-2">
            {chosen.map((i) => (
              <SelectChip key={i.id} selected onClick={() => toggle(i.id)}>
                <span aria-hidden="true">{i.emoji}</span>
                {i.label}
              </SelectChip>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-5">
        {groups.map((c) => (
          <div key={c.id}>
            <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-mist">
              {c.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {c.items.map((i) => (
                <SelectChip key={i.id} selected={value.includes(i.id)} onClick={() => toggle(i.id)}>
                  <span aria-hidden="true">{i.emoji}</span>
                  {i.label}
                </SelectChip>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="py-6 text-center text-[14px] text-mist">
            Nothing matching “{query}”. Try a broader word.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * ── What's a good date, and what are you like ───────────────────────────────
 *
 * One step rather than two, because signup is already the biggest drop-off
 * point in the product and a tenth screen costs more than these questions are
 * worth on their own. Skippable, for the same reason — and the answers are
 * scored as *a percentage of what was achievable for the pair*, so skipping
 * costs somebody nothing except precision.
 *
 * The ideal-date question earns its place twice: it says something real about
 * a person, and it is the only thing that lets Loose Leaf suggest a place two
 * specific people would both actually enjoy.
 */
export function SurveyStep({ survey, set }) {
  const s = survey ?? {}
  const patch = (p) => set({ ...s, ...p })

  const toggleDate = (id) => {
    const current = s.idealDates ?? []
    if (current.includes(id)) return patch({ idealDates: current.filter((x) => x !== id) })
    if (current.length >= 3) return
    patch({ idealDates: [...current, id] })
  }

  const chosen = s.idealDates ?? []

  return (
    <div className="space-y-9">
      <div>
        <span className="label">A good first date is…</span>
        <p className="-mt-1 mb-3 text-[13px] text-mist">Pick up to three.</p>
        <div className="flex flex-wrap gap-2">
          {IDEAL_DATES.map((d) => (
            <SelectChip
              key={d.id}
              selected={chosen.includes(d.id)}
              onClick={() => toggleDate(d.id)}
            >
              <span aria-hidden="true">{d.emoji}</span>
              {d.label}
            </SelectChip>
          ))}
        </div>
      </div>

      <div>
        <span className="label">And it should cost…</span>
        <div className="space-y-2">
          {DATE_BUDGETS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => patch({ budgetLevel: b.id })}
              aria-pressed={s.budgetLevel === b.id}
              className={`focus-ring flex w-full items-baseline justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                s.budgetLevel === b.id
                  ? 'border-coral bg-coral-wash'
                  : 'border-rule bg-white hover:border-coral/40'
              }`}
            >
              <span className="text-[14.5px] font-medium text-navy">{b.label}</span>
              <span className="shrink-0 text-[12.5px] text-mist">{b.detail}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="label">Drinks, on a first date?</span>
        <div className="flex flex-wrap gap-2">
          {DRINKS_ON_DATES.map((d) => (
            <SelectChip
              key={d.id}
              selected={s.drinks === d.id}
              onClick={() => patch({ drinks: d.id })}
            >
              {d.label}
            </SelectChip>
          ))}
        </div>
        <p className="mt-2 px-1 text-[12.5px] leading-relaxed text-mist">
          If either of you says no, we stop suggesting bars. Nobody is told which of you it was.
        </p>
      </div>

      <div className="space-y-5 border-t border-rule pt-7">
        <p className="text-[13px] font-semibold uppercase tracking-[0.07em] text-mist">
          And you, roughly
        </p>
        {SURVEY.map((question) => (
          <div key={question.id}>
            <span className="label !mb-2">{question.question}</span>
            <div className="grid grid-cols-3 gap-2">
              {question.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => patch({ [question.id]: o.id })}
                  aria-pressed={s[question.id] === o.id}
                  className={`focus-ring rounded-2xl border px-3 py-2.5 text-center text-[13px] leading-snug transition ${
                    s[question.id] === o.id
                      ? 'border-coral bg-coral-wash font-medium text-coral-deep'
                      : 'border-rule bg-white text-graphite hover:border-coral/40'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
