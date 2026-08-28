import { supabase } from '../../lib/supabase'
import * as media from './partnerMedia'

/**
 * Backstage: everything staff do, and nothing a member does.
 *
 * Every function here is gated twice — `is_admin()` inside the database, and
 * the route guard in the client. The database check is the one that matters;
 * the client one just avoids showing a door that won't open.
 */

export async function overview(days = 14) {
  const { data, error } = await supabase.rpc('staff_overview', { p_days: days })
  if (error) throw new Error(error.message)
  return data
}

/* ── reports ───────────────────────────────────────────────────────────── */

const REPORT_SELECT = `
  id, reason, status, staff_note, created_at, reviewed_at,
  reporter:profiles!reports_reporter_id_fkey ( id, first_name, major, grad_year ),
  reported:profiles!reports_reported_id_fkey ( id, first_name, major, grad_year, is_paused )
`

function shapeReport(row) {
  return {
    id: row.id,
    reason: row.reason,
    status: row.status,
    note: row.staff_note,
    at: row.created_at,
    reviewedAt: row.reviewed_at,
    reporter: row.reporter,
    reported: row.reported,
  }
}

export async function listReports(status = 'open') {
  let query = supabase.from('reports').select(REPORT_SELECT).order('created_at', { ascending: false })
  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(shapeReport)
}

/**
 * @param decision 'actioned' | 'dismissed'
 */
export async function resolveReport(id, reviewerId, decision, note) {
  const { error } = await supabase
    .from('reports')
    .update({
      status: decision,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      staff_note: note?.trim() || null,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/** Suspension goes through an RPC — staff can pause an account, not edit it. */
export async function setPaused(profileId, paused) {
  const { error } = await supabase.rpc('staff_set_paused', { target: profileId, paused })
  if (error) throw new Error(error.message)
}

/* ── Date Spots ────────────────────────────────────────────────────────── */
//
//  Backstage sees every spot on the page, and can do two different things to
//  them depending on where they came from:
//
//   · **Ones we added** (`origin = 'backstage'`) are ordinary `date_spots`
//     rows with no business behind them, written straight to the table under
//     the `is_admin() and origin = 'backstage'` policy. No RPC needed — the
//     database already refuses everything else.
//   · **A partner's own card** can be taken off the page or removed, and not
//     edited. Row-level security cannot restrict columns, so those two powers
//     are functions that take one argument rather than a policy that would
//     have handed over the whole row.
//
//  The list comes from `staff_spots()` so the join to the business — its
//  name, its status, and how many people are on the account — happens once,
//  in one place, behind `is_admin()`.

const SPOT_COLUMNS = `
  id, name, kind, note, tags, date_types, vibes, price_level, walk_minutes,
  distance_miles, latitude, longitude, address_line, website, phone, hours,
  cover_path, gallery_paths, indoor_outdoor, reservations, min_age,
  is_published, suggestable, origin, partner_id, added_by, created_at
`

/** Every Date Spot, with just enough about the business behind each one. */
export async function spots() {
  const { data, error } = await supabase.rpc('staff_spots')
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * One spot, every column, for the editor. Deliberately a second read rather
 * than fattening `staff_spots()`: a list of forty cards does not need forty
 * sets of opening hours.
 */
export async function spotById(id) {
  const { data, error } = await supabase
    .from('date_spots')
    .select(SPOT_COLUMNS)
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  return data
}

/**
 * Create or update one of ours. `id` null means create.
 *
 * `origin` is written explicitly on insert and the policy's `with check`
 * requires it, so a caller that forgets is refused rather than quietly
 * creating a row nobody can edit again.
 *
 * `is_sponsored` is never written here and cannot be: a check constraint
 * refuses a sponsored row with no partner, so the promise that a "Sponsored"
 * label means a real agreement survives this form existing.
 */
export async function saveHouseSpot(id, row) {
  if (id) {
    const { error } = await supabase.from('date_spots').update(row).eq('id', id)
    if (error) throw new Error(error.message)
    return id
  }

  const { data: me } = await supabase.auth.getUser()
  const uid = me?.user?.id ?? null
  const { data, error } = await supabase
    .from('date_spots')
    .insert({ ...row, university_id: await myCampusId(), added_by: uid, origin: 'backstage' })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

/**
 * On or off the Date Spots page. Reversible, and for a live partner only
 * half a lever — publishing their own card is theirs, so they can put it
 * back. Suspending the business is what holds.
 */
export async function setSpotPublished(id, published) {
  const { error } = await supabase.rpc('staff_set_spot_published', {
    p_spot: id,
    p_published: published,
  })
  if (error) throw new Error(error.message)
}

/**
 * Gone, not hidden. A date plan that pointed at it keeps the plan and loses
 * the spot. The cover photo goes too when it was ours — a partner's photo
 * belongs to their account and is left alone.
 */
export async function removeSpot(id, { coverPath = null, origin = null } = {}) {
  const { error } = await supabase.rpc('staff_remove_spot', { p_spot: id })
  if (error) throw new Error(error.message)
  if (coverPath && origin === 'backstage') await media.remove(coverPath).catch(() => {})
}

/** The campus the signed-in staff member belongs to. */
async function myCampusId() {
  const { data: me } = await supabase.auth.getUser()
  const uid = me?.user?.id
  if (!uid) throw new Error('Not signed in.')
  const { data, error } = await supabase
    .from('profiles')
    .select('university_id')
    .eq('id', uid)
    .single()
  if (error) throw new Error(error.message)
  return data.university_id
}
