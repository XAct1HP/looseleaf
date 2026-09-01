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

/**
 * `surface: 'test'` is the staff test thread in `data/testThread.js`. It gets
 * real recommendations — that is what it is for — but it is not a student, so
 * it must not turn into a real business's numbers or a real business's money.
 * Both refusals live here rather than in the components, because a choke point
 * one function wide is a rule and a check in three components is a hope.
 */
const isTestSurface = (opts) => opts?.surface === 'test'

export async function unlockOffer(offerId, opts = {}) {
  if (isTestSurface(opts)) {
    throw new Error('This is a test conversation — it can’t unlock a real Date Pass.')
  }
  if (isDemo) return (await demo()).unlockOffer(offerId, opts)
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
  if (isTestSurface(opts)) return
  if (isDemo) {
    if (opts?.outcome === 'dismissed') demoDismissed = [...demoDismissed, spotId]
    return
  }
  live.logRecommendation(spotId, opts)
}
