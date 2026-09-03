import { isDemo, isSupabaseConfigured } from '../lib/supabase'
import * as live from './live/liveEvents'

/**
 * ── Live events, one façade ─────────────────────────────────────────────────
 *
 * Live-only, for the same reason the partner platform is: an event puts real
 * strangers at a table together and produces real matches between real
 * accounts. A convincing fake of that would be worse than an honest gap —
 * somebody would print a poster off the demo and forty people would scan it.
 *
 * What *does* work with no backend is the marketing: the landing section and
 * the "join a live event" screen render everywhere, and say plainly that the
 * event platform needs a configured Looseleaf rather than pretending to be
 * one.
 */

export const eventsEnabled = !isDemo && isSupabaseConfigured

const OFFLINE =
  'Live events need a configured Looseleaf. Set VITE_DATA_MODE=supabase and the Supabase keys, then try again.'

const gated = (fn) => (...args) => {
  if (!eventsEnabled) throw new Error(OFFLINE)
  return fn(...args)
}

/**
 * Not gated, and answers null rather than throwing. The join screen calls this
 * to decide what to render, and a code box that explodes on a cold page load
 * in demo mode is worse than one that says "no event with that code".
 */
export async function preview(code) {
  if (!eventsEnabled) return null
  try {
    return await live.preview(code)
  } catch {
    return null
  }
}

export const registerHost = gated(live.registerHost)
export const myHost = gated(live.myHost)
export const myEvents = gated(live.myEvents)
export const createEvent = gated(live.createEvent)
export const getEvent = gated(live.getEvent)
export const updateEvent = gated(live.updateEvent)
export const setFields = gated(live.setFields)
export const setStations = gated(live.setStations)
export const submitEvent = gated(live.submitEvent)

export const start = gated(live.start)
export const nextRound = gated(live.nextRound)
export const setPaused = gated(live.setPaused)
export const endEvent = gated(live.endEvent)
export const revealMatches = gated(live.revealMatches)
export const broadcast = gated(live.broadcast)
export const roster = gated(live.roster)
export const summary = gated(live.summary)
export const removeParticipant = gated(live.removeParticipant)

export const join = gated(live.join)
export const state = gated(live.state)
export const vote = gated(live.vote)
export const myNotes = gated(live.myNotes)
export const leave = gated(live.leave)
export const claim = gated(live.claim)

export const staffEvents = gated(live.staffEvents)
export const staffSetStatus = gated(live.staffSetStatus)
export const staffSetHostStatus = gated(live.staffSetHostStatus)

export const uploadLogo = gated(live.uploadLogo)

/** Safe everywhere: returns null with no backend rather than throwing. */
export function logoUrl(path) {
  if (!eventsEnabled) return null
  return live.logoUrl(path)
}

/** A no-op unsubscribe when there's no backend, so callers need no branch. */
export function subscribe(eventId, onChange) {
  if (!eventsEnabled) return () => {}
  return live.subscribe(eventId, onChange)
}
