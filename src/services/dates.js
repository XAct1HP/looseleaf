import { isDemo } from '../lib/supabase'
import * as live from './live/dates'

/**
 * ── One façade for "where should we go?" ────────────────────────────────────
 *
 * Pages import this and never branch on the data mode, the same way
 * services/backend.js works for member data. In demo mode the answers come
 * from the invented campus in demoDates.js, which is dynamically imported so
 * it stays out of the live bundle.
 */

const demo = () => import('./demoDates')

/** Dismissals live here in demo mode; live mode remembers them in the database. */
let demoDismissed = []

export async function spots() {
  if (isDemo) return (await demo()).spots()
  return live.spots()
}

export async function offersByPartner() {
  if (isDemo) return (await demo()).offersByPartner()
  return live.offersByPartner()
}

export async function recommend(opts = {}) {
  if (isDemo) {
    const d = await demo()
    return d.recommend({ ...opts, dismissed: demoDismissed })
  }
  return live.recommend(opts)
}

export async function unlockOffer(offerId, opts = {}) {
  if (isDemo) return (await demo()).unlockOffer(offerId)
  return live.unlockOffer(offerId, opts)
}

export async function myPasses(opts = {}) {
  if (isDemo) return (await demo()).myPasses()
  return live.myPasses(opts)
}

export function logSpotView(spotId) {
  if (isDemo) return
  live.logSpotView(spotId)
}

export function logRecommendation(spotId, opts) {
  if (isDemo) {
    if (opts?.outcome === 'dismissed') demoDismissed = [...demoDismissed, spotId]
    return
  }
  live.logRecommendation(spotId, opts)
}
