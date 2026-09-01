import { isDemo } from '../lib/supabase'
import { loadDemo } from './backend'
import * as live from './live/mutuals'

/**
 * One façade for mutual connections, so no screen branches on mode.
 *
 * The invariant both implementations hold: you can only surface someone by
 * giving their first name AND their major, both exactly, and what comes back
 * is a reference card — first name, photo, major, year. There is no listing
 * call in here, in either mode, because there is no list to give.
 */

const demo = () => loadDemo()

export async function search(firstName, major) {
  if (isDemo) return (await demo()).mutualsSearch(firstName, major)
  return live.search(firstName, major)
}

export async function list() {
  if (isDemo) return (await demo()).mutualsList()
  return live.list()
}

export async function request(personId) {
  if (isDemo) return (await demo()).mutualsRequest(personId)
  return live.request(personId)
}

export async function respond(connectionId, accept) {
  if (isDemo) return (await demo()).mutualsRespond(connectionId, accept)
  return live.respond(connectionId, accept)
}

export async function remove(connectionId) {
  if (isDemo) return (await demo()).mutualsRemove(connectionId)
  return live.remove(connectionId)
}

export async function sharedWith(personId) {
  if (isDemo) return (await demo()).mutualsSharedWith(personId)
  return live.sharedWith(personId)
}

export async function setFindable(userId, findable) {
  if (isDemo) return
  return live.setFindable(userId, findable)
}

/* ── threads ─────────────────────────────────────────────────────────────── */

/**
 * In live mode a thread is a conversation id; in demo mode the connection id
 * doubles as one. Callers pass whatever they got back and never inspect it.
 */
export async function openThread(person) {
  // Demo mutuals reached through a profile's overlap card carry no connection
  // id, so fall back to the stable one seedMutuals() uses.
  if (isDemo) return person.connectionId ?? `conn-${person.id}`
  return live.openThread(person.id)
}

export async function readThread(threadId) {
  if (isDemo) return (await demo()).mutualsThread(threadId)
  return live.readThread(threadId)
}

export async function send(threadId, senderId, body, personRef = null) {
  if (isDemo) return (await demo()).mutualsSend(threadId, body, personRef)
  return live.send(threadId, senderId, body, personRef)
}

/**
 * Listen for messages someone else sends into this thread. Returns the
 * unsubscribe.
 *
 * Demo threads have nobody to hear from — the other side is a scripted reply
 * produced by this same browser a moment after you send — so demo mode gets a
 * no-op rather than a branch inside the screen. Note this one is synchronous
 * where everything else here is a promise: a React cleanup function has to be
 * returned, not awaited.
 */
export function subscribeToThread(threadId, onMessage) {
  if (isDemo) return () => {}
  return live.subscribeToThread(threadId, onMessage)
}

/** Demo only — gives the other side of the conversation something to say. */
export async function demoReply(threadId, seed) {
  if (!isDemo) return null
  return (await demo()).mutualsReply(threadId, seed)
}
