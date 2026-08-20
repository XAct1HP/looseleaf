import { isDemo, isSupabaseConfigured } from '../lib/supabase'
import * as live from './live/partners'
import { PLAN_MIRROR } from '../lib/partnerPlans'
import { DEMO_TAXONOMY } from '../data/partnerCatalog'

/**
 * ── Loose Leaf for Partners, one façade ─────────────────────────────────────
 *
 * The business side is live-only, on purpose. Everything else in Looseleaf has
 * a demo twin so the app is explorable with no backend — but this half takes
 * card details, issues redeemable tickets, and makes claims about a real
 * business's prices. A convincing fake of that is worse than an honest gap.
 *
 * So: the marketing pages at /partners work everywhere (they read the plan
 * mirror when there's no database), and everything past "Become a Partner"
 * asks for a configured Looseleaf rather than pretending.
 */

export const partnersEnabled = !isDemo && isSupabaseConfigured

const OFFLINE =
  'The Partner platform needs a live Looseleaf. Set VITE_DATA_MODE=supabase and the Supabase keys, then try again.'

function requireLive() {
  if (!partnersEnabled) throw new Error(OFFLINE)
}

/* ── reference data, safe without a backend ─────────────────────────────── */

export async function plans() {
  if (!partnersEnabled) return PLAN_MIRROR
  try {
    const rows = await live.plans()
    return rows.length ? rows : PLAN_MIRROR
  } catch {
    // A public pricing page should never be a blank rectangle because the
    // database is having a moment.
    return PLAN_MIRROR
  }
}

export async function taxonomy() {
  if (!partnersEnabled) return DEMO_TAXONOMY
  return live.taxonomy()
}

/* ── everything else needs the real thing ───────────────────────────────── */

const gated = (fn) => (...args) => {
  requireLive()
  return fn(...args)
}

export const sendCode = gated(live.sendCode)
export const isPartnerUser = gated(live.isPartnerUser)
export const register = gated(live.register)
export const mine = gated(live.mine)
export const update = gated(live.update)

export const locations = gated(live.locations)
export const addLocation = gated(live.addLocation)
export const updateLocation = gated(live.updateLocation)
export const spotForLocation = gated(live.spotForLocation)
export const saveSpot = gated(live.saveSpot)

export const offers = gated(live.offers)
export const saveOffer = gated(live.saveOffer)
export const setOfferStatus = gated(live.setOfferStatus)
export const offerUsage = gated(live.offerUsage)

export const lookupPass = gated(live.lookupPass)
export const redeemPass = gated(live.redeemPass)
export const redemptions = gated(live.redemptions)

export const overview = gated(live.overview)
export const funnel = gated(live.funnel)

export const targeting = gated(live.targeting)
export const saveTargeting = gated(live.saveTargeting)

export const subscription = gated(live.subscription)
export const checkoutUrl = gated(live.checkoutUrl)
export const billingPortalUrl = gated(live.billingPortalUrl)

export const staffQueue = gated(live.staffQueue)
export const staffSetStatus = gated(live.staffSetStatus)
export const staffSetOfferStatus = gated(live.staffSetOfferStatus)
export const staffRevenue = gated(live.staffRevenue)
