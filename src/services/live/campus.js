import { supabase, isDemo } from '../../lib/supabase'

/**
 * ── How many people are actually on this campus ─────────────────────────────
 *
 * Two aggregates, straight from `campus_stats()`. Never a list and never an
 * identity — the function it calls structurally cannot return one.
 *
 * `null` is a real answer here and callers must handle it. It means "we don't
 * know", and the Campus page renders that as a sentence with no number in it
 * rather than as a zero, because "0 people are open to plans tonight" and "we
 * couldn't reach the server" look identical to a reader and only one of them
 * is true.
 */
export async function stats() {
  if (isDemo || !supabase) return null
  const { data, error } = await supabase.rpc('campus_stats')
  if (error) {
    console.warn('[looseleaf] campus_stats:', error.message)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return { members: row.members ?? null, tonight: row.tonight ?? null }
}
