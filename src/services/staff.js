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
