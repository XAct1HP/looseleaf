import { supabase } from '../../lib/supabase'
import { signUrls } from './photos'

/**
 * Mutual connections.
 *
 * Every read in here goes through an RPC rather than a table select, and that
 * is the point: `find_mutual_candidates` and `person_reference` return four
 * display fields and structurally cannot return a fifth, so nothing in this
 * file could turn into a people directory even if a future screen asked it to.
 */

const fail = (error) => {
  if (error) throw new Error(error.message)
}

/** Rows from the RPCs share a shape; give them photo URLs and camelCase. */
async function decorate(rows = []) {
  const urls = await signUrls(rows.map((r) => r.storage_path))
  return rows.map((r) => ({
    id: r.id,
    connectionId: r.connection_id,
    firstName: r.first_name,
    major: r.major,
    gradYear: r.grad_year,
    scene: r.scene ?? 'portrait',
    photoUrl: r.storage_path ? urls[r.storage_path] ?? null : null,
    state: r.state,
    createdAt: r.created_at,
  }))
}

/**
 * Look someone up. Both halves are required and both are exact — the database
 * refuses anything shorter, so a typo returns nothing rather than a list of
 * near misses to scroll.
 */
export async function search(firstName, major) {
  const { data, error } = await supabase.rpc('find_mutual_candidates', {
    p_first_name: firstName,
    p_major: major,
  })
  fail(error)
  return decorate(data ?? [])
}

/** Your accepted mutuals plus the requests waiting on either side. */
export async function list() {
  const { data, error } = await supabase.rpc('my_connections')
  fail(error)
  const all = await decorate(data ?? [])
  return {
    mutuals: all.filter((p) => p.state === 'connected'),
    incoming: all.filter((p) => p.state === 'incoming'),
    sent: all.filter((p) => p.state === 'sent'),
  }
}

/** Ask someone to be a mutual. Does nothing visible to anyone else until they accept. */
export async function request(profileId) {
  const { data, error } = await supabase.rpc('request_connection', { target: profileId })
  fail(error)
  return data
}

export async function respond(connectionId, accept) {
  const { error } = await supabase.rpc('respond_to_connection', {
    conn: connectionId,
    accept,
  })
  fail(error)
}

/** Removing a mutual takes the thread with it — the connection owns it. */
export async function remove(connectionId) {
  const { error } = await supabase.from('connections').delete().eq('id', connectionId)
  fail(error)
}

/** The people you and one other person both know. An intersection, not their list. */
export async function sharedWith(profileId) {
  const { data, error } = await supabase.rpc('mutuals_with', { other: profileId })
  fail(error)
  return decorate(data ?? [])
}

export async function setFindable(userId, findable) {
  const { error } = await supabase.from('profiles').update({ is_findable: findable }).eq('id', userId)
  fail(error)
}

/* ── talking to a mutual ─────────────────────────────────────────────────── */

export async function openThread(profileId) {
  const { data, error } = await supabase.rpc('open_mutual_thread', { other: profileId })
  fail(error)
  return data
}

export async function readThread(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, body, person_ref, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at')
  fail(error)

  const rows = data ?? []
  const refIds = [...new Set(rows.map((m) => m.person_ref).filter(Boolean))]
  const cards = refIds.length ? await references(refIds) : []
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]))

  return rows.map((m) => ({
    id: m.id,
    from: m.sender_id,
    text: m.body,
    card: m.person_ref ? byId[m.person_ref] ?? null : null,
    at: m.created_at,
  }))
}

export async function send(conversationId, senderId, body, personRef = null) {
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    body,
    person_ref: personRef,
  })
  fail(error)
}

/** Resolve shared-card pointers into the four fields a card is allowed to show. */
export async function references(ids) {
  const { data, error } = await supabase.rpc('person_reference', { p_ids: ids })
  fail(error)
  return decorate(data ?? [])
}
