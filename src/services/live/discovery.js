import { supabase } from '../../lib/supabase'

/**
 * ── Discover, live ──────────────────────────────────────────────────────────
 *
 * The read half of live discovery. Likes, matches and messaging are still
 * demo-only (see docs/GOING-LIVE.md) — this is here because the deck itself is
 * finished in the database and a finished RPC with no client is how a rewrite
 * silently rots.
 *
 * Three things about `get_deck()` that this file cannot paper over, and
 * shouldn't:
 *
 *  · **Reading the deck assigns it.** The RPC writes a `deck_views` row for
 *    everybody it hands back, and those people are then never offered again.
 *    So this is not a query to call speculatively, on a prefetch, or twice on
 *    mount in StrictMode — call it when somebody has actually opened Discover.
 *    (Calling it twice on the same day is harmless: the second call returns
 *    the same people. Calling it on two different days is not.)
 *
 *  · **The fit and the reasons come back with the person.** Scoring is a pair
 *    function, so asking separately would be one round trip per card.
 *
 *  · **How many is not ours to decide.** `deck_size_for()` is ten percent of
 *    the campus capped at ten, in the database, where the tests can see it.
 *    Passing a limit from the client would make that a suggestion.
 */

function bail(error) {
  if (error) throw new Error(error.message)
}

export async function deck() {
  const { data, error } = await supabase.rpc('get_deck')
  bail(error)
  return (data ?? []).map((r) => ({
    id: r.id,
    firstName: r.first_name,
    age: r.age,
    gender: r.gender,
    pronouns: r.pronouns,
    gradYear: r.grad_year,
    major: r.major,
    minor: r.minor,
    area: r.area,
    orgs: r.orgs ?? [],
    intention: r.intention,
    fit: r.fit,
    reasons: r.reasons ?? [],
  }))
}

/** Enough to tell "that's everyone for today" from "the campus is out". */
export async function deckStatus() {
  const { data, error } = await supabase.rpc('deck_status')
  bail(error)
  return {
    campusOpen: Boolean(data?.campus_open),
    dailySize: data?.daily_size ?? 0,
    shownToday: data?.shown_today ?? 0,
    poolLeft: data?.pool_left ?? 0,
    members: data?.members ?? 0,
  }
}

/**
 * Liking or passing is deciding, and deciding retires somebody from the deck
 * for good. Fire-and-forget on purpose: the card has already animated away and
 * a failed write here must not take the like with it — the next `get_deck()`
 * would simply offer that person once more, which is the safe direction to
 * fail in.
 */
export function markActed(personId) {
  supabase.rpc('mark_deck_acted', { p_person: personId }).then(
    () => {},
    () => {}
  )
}
