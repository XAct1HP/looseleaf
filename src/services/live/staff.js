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

/* ── Date Spots we add ourselves ───────────────────────────────────────── */
//
//  A hand-added spot is an ordinary `date_spots` row with no partner behind
//  it, so there is no new table and nothing new for the Date Spots page to
//  learn — it already renders every row it can read. What is new is who may
//  write one: the policy is `is_admin() and partner_id is null`, which is
//  also why none of this needs an RPC. The database refuses a Backstage edit
//  to a business's own card by itself.
//
//  Columns are returned raw, the same way `partners.spotForLocation` does, so
//  the editor form and the SQL row read alike and there is one less mapping
//  to keep honest.

const HOUSE_SPOT_COLUMNS = `
  id, name, kind, note, tags, date_types, vibes, price_level, walk_minutes,
  distance_miles, latitude, longitude, address_line, website, phone, hours,
  cover_path, gallery_paths, indoor_outdoor, reservations, min_age,
  is_published, suggestable, added_by, created_at
`

/** Everything on this campus that no business is behind. Newest first. */
export async function houseSpots() {
  const { data, error } = await supabase
    .from('date_spots')
    .select(HOUSE_SPOT_COLUMNS)
    .is('partner_id', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Create or update one. `id` null means create.
 *
 * `is_sponsored` is never written here and cannot be: a check constraint on
 * the table refuses a sponsored row with no partner, so the promise that a
 * "Sponsored" label means a real agreement survives this form existing.
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
    .insert({ ...row, university_id: await myCampusId(), added_by: uid })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

/**
 * Gone, not hidden. A date plan that pointed at it keeps the plan and loses
 * the spot — the migration changed that foreign key to `on delete set null`
 * for exactly this. The photo goes too; leaving it behind would cost storage
 * forever for a row nobody can reach.
 */
export async function removeHouseSpot(id, coverPath = null) {
  const { error } = await supabase.from('date_spots').delete().eq('id', id)
  if (error) throw new Error(error.message)
  if (coverPath) await media.remove(coverPath).catch(() => {})
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
