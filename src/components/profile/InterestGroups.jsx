import { InterestChip } from '../ui/Chip'
import { INTEREST_CATEGORIES, interestById } from '../../data/catalog'

/**
 * ── Interests, as themes rather than as a wall ──────────────────────────────
 *
 * Somebody who picks fifteen interests used to get fifteen chips in one
 * undifferentiated block, and a reader's eye slid straight off it. The picker
 * in onboarding already knows better — it groups, for exactly the reason in
 * `data/catalog.js`: "a flat wall of a hundred chips is a worse question than
 * thirty". The same is true when you are reading someone else's.
 *
 * So the chips come out in the catalogue's own category order, under a quiet
 * label each, and the shape of what somebody is into is legible at a glance:
 * three rows about music and going out reads very differently from one chip
 * under each of eight headings, and both of those are facts about a person
 * that the single block threw away.
 *
 * The shared ones are lifted out into their own block at the top instead of
 * being marked in place. That is why `InterestChip` no longer carries the word
 * "both" — a heading that says it once is quieter than a badge that says it
 * nine times, and it stops the highlight from being the only thing the eye
 * lands on in a list that is mostly not shared.
 */
export default function InterestGroups({ interests = [], shared = [] }) {
  if (!interests.length) return null

  const sharedSet = new Set(shared.filter((id) => interests.includes(id)))
  const rest = interests.filter((id) => !sharedSet.has(id))

  // Catalogue order, not the order they happen to sit in the row.
  const byCategory = INTEREST_CATEGORIES.map((c) => ({
    ...c,
    ids: rest.filter((id) => interestById(id)?.category === c.id),
  })).filter((g) => g.ids.length)

  // A heading over a single chip is worse than no heading at all: six
  // interests spread across six categories turns into six one-item rows, which
  // is a longer, thinner wall than the one this was meant to replace. So a
  // category earns its heading by having something to put under it, and
  // everything else — including anything whose id has left the catalogue,
  // which still has to be shown because it is on a real person's profile —
  // gathers at the bottom.
  const groups = byCategory.filter((g) => g.ids.length > 1)
  const grouped = new Set(groups.flatMap((g) => g.ids))
  const loose = rest.filter((id) => !grouped.has(id))
  if (loose.length) {
    groups.push({ id: 'assorted', label: groups.length ? 'And' : 'Into', ids: loose })
  }

  // And if nothing clustered at all, this is just a list, so say it once.
  const bare = groups.length === 1 && groups[0].id === 'assorted'

  return (
    <div className="space-y-4">
      {sharedSet.size > 0 && (
        <div className="rounded-2xl border border-coral/20 bg-coral-wash px-4 py-3.5">
          <p className="text-[12px] font-medium uppercase tracking-[0.07em] text-coral-deep/75">
            You both picked
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {[...sharedSet].map((id) => (
              <InterestChip key={id} id={id} shared />
            ))}
          </div>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.id}>
          {!bare && (
            <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.07em] text-mist">
              {g.label}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {g.ids.map((id) => (
              <InterestChip key={id} id={id} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
