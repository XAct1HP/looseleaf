import { supabase } from '../../lib/supabase'
import { derive, extFor, isHeic } from '../../lib/imagePipeline'

/**
 * ── Live events, against the real backend ───────────────────────────────────
 *
 * Almost everything here is one RPC call. That is deliberate: the database
 * decides who may see what, and a client that assembled a view out of three
 * table reads would be a client that could be talked into assembling a
 * roster. See the header of 20260902120000_live_events.sql.
 */

function bail(error) {
  if (!error) return
  const raw = error.message ?? 'Something went wrong.'
  if (/rate limit|too many/i.test(raw)) {
    return void (() => {
      throw new Error('Too many codes requested just now. Give it a minute.')
    })()
  }
  throw new Error(raw)
}

/* ── the host ───────────────────────────────────────────────────────────── */

export async function registerHost({ fullName, orgName }) {
  const { error } = await supabase.rpc('register_event_host', {
    p_full_name: fullName,
    p_org_name: orgName,
  })
  bail(error)
}

export async function myHost() {
  const { data, error } = await supabase.rpc('my_host')
  bail(error)
  if (!data) return null
  return {
    fullName: data.full_name,
    orgName: data.org_name,
    status: data.status,
    reviewNote: data.review_note,
  }
}

export async function myEvents() {
  const { data, error } = await supabase.rpc('my_live_events')
  bail(error)
  return (data ?? []).map(shapeSummary)
}

function shapeSummary(r) {
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    status: r.status,
    startsAt: r.starts_at,
    venue: r.venue_label,
    createdAt: r.created_at,
    reviewNote: r.review_note,
    accent: r.accent,
    logoPath: r.logo_path,
    registered: Number(r.registered ?? 0),
    checkedIn: Number(r.checked_in ?? 0),
  }
}

export async function createEvent({ title, blurb, venue, startsAt }) {
  const { data, error } = await supabase.rpc('create_live_event', {
    p_title: title,
    p_blurb: blurb ?? null,
    p_venue: venue ?? null,
    p_starts_at: startsAt ?? null,
  })
  bail(error)
  return data
}

export async function getEvent(id) {
  const { data, error } = await supabase.rpc('host_event', { p_event: id })
  bail(error)
  if (!data) return null
  return {
    event: data.event,
    fields: data.fields ?? [],
    stations: data.stations ?? [],
    host: data.host,
  }
}

export async function updateEvent(id, patch) {
  const { error } = await supabase.rpc('update_live_event', {
    p_event: id,
    p_patch: patch,
  })
  bail(error)
}

export async function setStations(id, stations) {
  const { error } = await supabase.rpc('set_event_stations', {
    p_event: id,
    p_stations: stations,
  })
  bail(error)
}

export async function setFields(id, fields) {
  const { error } = await supabase.rpc('set_event_fields', {
    p_event: id,
    p_fields: fields,
  })
  bail(error)
}

export async function submitEvent(id) {
  const { error } = await supabase.rpc('submit_live_event', { p_event: id })
  bail(error)
}

/* ── running it ─────────────────────────────────────────────────────────── */

export async function start(id) {
  const { error } = await supabase.rpc('start_live_event', { p_event: id })
  bail(error)
}

export async function nextRound(id) {
  const { error } = await supabase.rpc('next_event_round', { p_event: id })
  bail(error)
}

export async function setPaused(id, paused) {
  const { error } = await supabase.rpc('pause_live_event', { p_event: id, p_paused: paused })
  bail(error)
}

export async function endEvent(id) {
  const { error } = await supabase.rpc('end_live_event', { p_event: id })
  bail(error)
}

export async function revealMatches(id) {
  const { error } = await supabase.rpc('reveal_event_matches', { p_event: id })
  bail(error)
}

export async function broadcast(id, text) {
  const { error } = await supabase.rpc('host_broadcast', { p_event: id, p_text: text })
  bail(error)
}

export async function roster(id) {
  const { data, error } = await supabase.rpc('host_roster', { p_event: id })
  bail(error)
  return data ?? []
}

export async function summary(id) {
  const { data, error } = await supabase.rpc('host_event_summary', { p_event: id })
  bail(error)
  return data ?? {}
}

export async function removeParticipant(eventId, participantId) {
  const { error } = await supabase.rpc('host_remove_participant', {
    p_event: eventId,
    p_participant: participantId,
  })
  bail(error)
}

/* ── the participant ────────────────────────────────────────────────────── */

export async function preview(code) {
  const { data, error } = await supabase.rpc('event_preview', { p_code: code })
  bail(error)
  return data ?? null
}

/**
 * Every participant call carries the token instead of a session, because
 * there is no session — a person at a door typed a name and nothing else.
 * The token is minted server-side on the first join and kept in localStorage
 * by `lib/liveEvent`; see the header of 20260903120000_event_stations.sql for
 * why the door works this way.
 */
export async function join(code, name, answers, token) {
  const { data, error } = await supabase.rpc('join_live_event', {
    p_code: code,
    p_name: name,
    p_answers: answers ?? {},
    p_token: token ?? null,
  })
  bail(error)
  return data ?? null
}

export async function state(code, token) {
  const { data, error } = await supabase.rpc('event_state', {
    p_code: code,
    p_token: token ?? null,
  })
  bail(error)
  return data ?? null
}

export async function vote(pairingId, yes, note, token) {
  const { error } = await supabase.rpc('cast_event_vote', {
    p_pairing: pairingId,
    p_yes: yes,
    p_note: note ?? null,
    p_token: token ?? null,
  })
  bail(error)
}

export async function myNotes(eventId, token) {
  const { data, error } = await supabase.rpc('my_event_notes', {
    p_event: eventId,
    p_token: token ?? null,
  })
  bail(error)
  return data ?? []
}

export async function leave(eventId, token) {
  const { error } = await supabase.rpc('leave_live_event', {
    p_event: eventId,
    p_token: token ?? null,
  })
  bail(error)
}

/**
 * Hands this browser's event tokens to a freshly-made account, and opens any
 * match that was only ever waiting on both sides having a profile. Called once,
 * right after somebody finishes onboarding.
 */
export async function claim(tokens) {
  if (!tokens?.length) return 0
  const { data, error } = await supabase.rpc('claim_event_participation', {
    p_tokens: tokens,
  })
  bail(error)
  return data ?? 0
}

/**
 * Realtime is an accelerator, never the mechanism. `event_state` polling is
 * the floor and it is correct on its own; this just removes the up-to-three
 * seconds between a round starting and a phone noticing. If the socket never
 * connects — a basement, a captive portal, a locked-down campus network —
 * nothing about the event breaks.
 */
export function subscribe(eventId, onChange) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`live_event:${eventId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_events', filter: `id=eq.${eventId}` },
      onChange
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'live_event_rounds',
        filter: `event_id=eq.${eventId}`,
      },
      onChange
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/* ── staff ──────────────────────────────────────────────────────────────── */

export async function staffEvents() {
  const { data, error } = await supabase.rpc('staff_live_events')
  bail(error)
  return data ?? []
}

export async function staffSetStatus(id, status, note) {
  const { error } = await supabase.rpc('staff_set_live_event_status', {
    p_event: id,
    p_status: status,
    p_note: note ?? null,
  })
  bail(error)
}

export async function staffSetHostStatus(hostId, status, note) {
  const { error } = await supabase.rpc('staff_set_host_status', {
    p_host: hostId,
    p_status: status,
    p_note: note ?? null,
  })
  bail(error)
}

/* ── the logo ───────────────────────────────────────────────────────────── */

const BUCKET = 'event-media'

export function logoUrl(path) {
  if (!path) return null
  if (/^(https?:|blob:|data:)/.test(path)) return path
  if (!supabase) return null
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * One size, not two. A club logo appears on a poster and in a header, and the
 * `@sm` variant trick that student photos use buys nothing here — but the
 * HEIC conversion very much does, because a club's logo often arrives as a
 * screenshot taken on somebody's iPhone.
 */
export async function uploadLogo(eventId, file) {
  if (!file) throw new Error('No file chosen.')
  if (!/^image\//.test(file.type) && !isHeic(file)) {
    throw new Error('That needs to be an image.')
  }

  const { full, type } = await derive(file, 'logo')
  const path = `${eventId}/logo-${Date.now()}.${extFor(type)}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, full, { contentType: type, cacheControl: '31536000', upsert: false })
  if (error) throw new Error(error.message)

  return path
}
