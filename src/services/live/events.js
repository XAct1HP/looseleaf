import { supabase } from '../../lib/supabase'

/**
 * Campus events: proposed by students, published by staff.
 *
 * The row-level policies do the real enforcing — a student can insert only
 * `status = 'pending'` and can only see their own until it's approved. These
 * functions are the shape of that, not the enforcement of it.
 */

const SELECT = `
  id, title, when_text, starts_at, venue, kind, emoji, status,
  created_by, submitted_at, reviewed_at, reject_note,
  profiles!campus_events_created_by_fkey ( first_name )
`

function shape(row) {
  return {
    id: row.id,
    title: row.title,
    when: row.when_text,
    startsAt: row.starts_at,
    venue: row.venue,
    kind: row.kind,
    emoji: row.emoji || '📌',
    status: row.status,
    createdBy: row.created_by,
    submittedAt: row.submitted_at,
    rejectNote: row.reject_note,
    authorName: row.profiles?.first_name ?? null,
  }
}

/** What a student sees: everything approved, plus their own pending ones. */
export async function listEvents() {
  const { data, error } = await supabase
    .from('campus_events')
    .select(SELECT)
    .order('submitted_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map(shape)
}

export async function submitEvent(userId, universityId, form) {
  const { data, error } = await supabase
    .from('campus_events')
    .insert({
      university_id: universityId,
      title: form.title.trim(),
      when_text: form.when.trim(),
      venue: form.venue?.trim() || null,
      kind: form.kind || 'Around town',
      emoji: form.emoji || '📌',
      created_by: userId,
      status: 'pending',
    })
    .select(SELECT)
    .single()

  if (error) throw new Error(error.message)
  return shape(data)
}

export async function withdrawEvent(id) {
  const { error } = await supabase.from('campus_events').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/* ── staff ─────────────────────────────────────────────────────────────── */

export async function pendingEvents() {
  const { data, error } = await supabase
    .from('campus_events')
    .select(SELECT)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map(shape)
}

/**
 * What is on Campus right now, newest first — the other half of the same page.
 * Publishing needs to look reversible: a screen that only ever shows what
 * hasn't been decided yet quietly implies a decision can't be undone.
 */
export async function publishedEvents() {
  const { data, error } = await supabase
    .from('campus_events')
    .select(SELECT)
    .eq('status', 'approved')
    .order('submitted_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map(shape)
}

/**
 * Take one off Campus. No new privilege is being handed out here — the delete
 * policy already read `is_admin() or (created_by = auth.uid() and status =
 * 'pending')`. The button simply didn't exist.
 */
export async function removeEvent(id) {
  const { error } = await supabase.from('campus_events').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function reviewEvent(id, reviewerId, decision, note) {
  const { error } = await supabase
    .from('campus_events')
    .update({
      status: decision,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      reject_note: decision === 'rejected' ? note?.trim() || null : null,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/** Marking yourself interested. Only works for events you can already see. */
export async function setInterested(userId, eventId, interested) {
  if (interested) {
    const { error } = await supabase
      .from('event_interest')
      .upsert({ profile_id: userId, event_id: eventId })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('event_interest')
      .delete()
      .eq('profile_id', userId)
      .eq('event_id', eventId)
    if (error) throw new Error(error.message)
  }
}

export async function myInterests(userId) {
  const { data, error } = await supabase
    .from('event_interest')
    .select('event_id')
    .eq('profile_id', userId)

  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.event_id)
}
