import { isDemo } from '../lib/supabase'
import { loadDemo } from './backend'
import * as live from './live/staff'
import * as liveEvents from './live/events'

/**
 * One façade so Backstage pages don't branch on mode. In demo mode the
 * fixtures come from services/demo.js, which is dynamically imported and
 * therefore absent from the live bundle.
 */

const demo = () => loadDemo()

export async function overview(days = 14) {
  if (isDemo) return (await demo()).staffOverview(days)
  return live.overview(days)
}

export async function listReports(status = 'open') {
  if (isDemo) return (await demo()).staffReports(status)
  return live.listReports(status)
}

export async function resolveReport(id, reviewerId, decision, note) {
  if (isDemo) return (await demo()).staffResolveReport(id, decision, note)
  return live.resolveReport(id, reviewerId, decision, note)
}

export async function setPaused(profileId, paused) {
  if (isDemo) return (await demo()).staffSetPaused(profileId, paused)
  return live.setPaused(profileId, paused)
}

export async function pendingEvents() {
  if (isDemo) return (await demo()).staffPendingEvents()
  return liveEvents.pendingEvents()
}

export async function reviewEvent(id, reviewerId, decision, note) {
  if (isDemo) return (await demo()).staffReviewEvent(id, decision, note)
  return liveEvents.reviewEvent(id, reviewerId, decision, note)
}

/** Everything currently on Campus, so it can be taken back off. */
export async function publishedEvents() {
  if (isDemo) return (await demo()).staffPublishedEvents()
  return liveEvents.publishedEvents()
}

export async function removeEvent(id) {
  if (isDemo) return (await demo()).staffRemoveEvent(id)
  return liveEvents.removeEvent(id)
}

/* ── Date Spots we add ourselves ───────────────────────────────────────── */
//
//  Live only, and it says so rather than pretending. The demo campus is a
//  fixed cast of invented places in `demoDates.js` — there is nothing there
//  to write to, and a form that silently discarded what you typed would be
//  worse than one that tells you which mode you're in.

const LIVE_ONLY = 'Date Spots are managed in live mode. This is the demo campus.'

export async function houseSpots() {
  if (isDemo) return []
  return live.houseSpots()
}

export async function saveHouseSpot(id, row) {
  if (isDemo) throw new Error(LIVE_ONLY)
  return live.saveHouseSpot(id, row)
}

export async function removeHouseSpot(id, coverPath) {
  if (isDemo) throw new Error(LIVE_ONLY)
  return live.removeHouseSpot(id, coverPath)
}
