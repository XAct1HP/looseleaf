import { supabase } from '../../lib/supabase'

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
