import { isDemo, isSupabaseConfigured } from '../lib/supabase'
import * as live from './live/partners'
import { PLAN_MIRROR, FREE_TIER } from '../lib/partnerBilling'
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

/**
 * The fee and the credit ladder. Safe with no backend for the same reason
 * `plans()` is: the marketing page has to be able to state the price on a
 * cold load, and a pricing section that renders a blank rectangle because the
 * database is having a moment is worse than one showing the number we set.
 */
export async function pricing() {
  const fallback = { feeCents: FREE_TIER.redemption_fee_cents, currency: 'usd', tiers: [] }
  if (!partnersEnabled) return fallback
  try {
    return await live.pricing()
  } catch {
    return fallback
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

export const team = gated(live.team)
export const pendingInvites = gated(live.pendingInvites)
export const invite = gated(live.invite)
export const setRolePages = gated(live.setRolePages)
export const revokeInvite = gated(live.revokeInvite)
export const setMemberRole = gated(live.setMemberRole)
export const removeMember = gated(live.removeMember)
export const myInvites = gated(live.myInvites)
export const acceptInvite = gated(live.acceptInvite)

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
export const billingSetupUrl = gated(live.billingSetupUrl)
export const billingPortalUrl = gated(live.billingPortalUrl)
export const syncBilling = gated(live.syncBilling)
export const billingSummary = gated(live.billingSummary)
export const billableRedemptions = gated(live.billableRedemptions)

export const staffQueue = gated(live.staffQueue)
export const staffSetStatus = gated(live.staffSetStatus)
export const staffOffers = gated(live.staffOffers)
export const staffSetOfferStatus = gated(live.staffSetOfferStatus)
export const staffRevenue = gated(live.staffRevenue)
export const staffCredit = gated(live.staffCredit)
export const staffSetCredit = gated(live.staffSetCredit)
