/**
 * ── What Loose Leaf costs a business, and what it will extend on credit ─────
 *
 * Replaces `partnerPlans.js`. There are no plans any more: joining is free,
 * every feature is on for everybody, and the only thing a partner is ever
 * charged for is a Date Pass that somebody actually redeemed.
 *
 * The entitlement readers below survive the change unaltered, and that is on
 * purpose. Nothing in the app is allowed to branch on a plan id — it asks
 * `can(entitlements, 'date_passes')` and lets the `partner_plans` row decide.
 * Today that row has everything switched on. If a feature ever needs turning
 * off for a class of business, that is still an UPDATE and a page refresh
 * rather than a search through the components.
 *
 * `FREE_TIER` and `PRICING` are mirrors, not sources of truth. They exist so
 * the public pricing section renders instantly on a cold page and so the copy
 * has something to show with no database; the moment Loose Leaf answers, its
 * rows win.
 */

export const FREE_TIER = {
  id: 'free',
  name: 'Loose Leaf Partner',
  blurb: 'Free to join. You pay only when a Date Pass is redeemed.',
  monthly_cents: 0,
  redemption_fee_cents: 150,
  entitlements: {
    discovery: true,
    partner_badge: true,
    photos: true,
    date_categories: true,
    analytics: 'advanced',
    featured_placement: true,
    recommendations: true,
    offers: true,
    chat_recommendations: true,
    date_passes: true,
    redemption: true,
    targeting: true,
    verified_date_reporting: true,
    max_locations: 10,
    max_active_offers: 6,
    gallery_photos: 12,
  },
}

/** Kept under the old export name so the plans() façade needs no special case. */
export const PLAN_MIRROR = [FREE_TIER]

/**
 * What the pricing section says. Written as prose rather than derived from
 * the entitlement keys, because "Recommendations inside conversations" reads
 * better to a restaurant owner than `chat_recommendations: true` ever will.
 */
export const PRICING = {
  headline: 'Free until somebody walks in.',
  free: [
    'Your Date Spot profile, photos and hours',
    'Appear in Date Spots discovery',
    'Eligible for personalised recommendations',
    'Recommendations inside conversations',
    'Create Loose Leaf offers and Date Passes',
    'The QR scanner for your counter',
    'Analytics and verified-date reporting',
    'As many people on the team as you like',
  ],
  paid: {
    label: 'per Date Pass redeemed',
    caption:
      'Charged only when a couple hands over a pass and one of your staff scans it. ' +
      'No monthly fee, no minimum, no contract.',
  },
}

/** Reads an entitlement. Anything absent is false. */
export function can(entitlements, key) {
  return Boolean(entitlements && entitlements[key])
}

/** Reads a levelled entitlement, e.g. analytics: 'basic' | 'enhanced' | 'advanced'. */
export function level(entitlements, key, fallback = null) {
  return (entitlements && entitlements[key]) || fallback
}

export function limit(entitlements, key, fallback = 0) {
  const v = entitlements && entitlements[key]
  return Number.isFinite(v) ? v : fallback
}

/** $49 rather than $49.00, because whole-dollar prices shouldn't wear decimals. */
export function money(cents) {
  if (cents === null || cents === undefined) return '—'
  const dollars = cents / 100
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`
}

/** $1.50 always wears its decimals — it is a price, not a round number. */
export function fee(cents) {
  if (cents === null || cents === undefined) return '—'
  return `$${(cents / 100).toFixed(2)}`
}

export function planById(plans, id) {
  return (plans || []).find((p) => p.id === id) || FREE_TIER
}

/* ── credit ───────────────────────────────────────────────────────────────
 *
 * A free tier still needs a limit: an invoice is a bill, not a collection, so
 * without one a business could take a month of foot traffic and let the card
 * fail. The limit is a ladder that climbs by itself as invoices get paid, and
 * these helpers are what put that in words a restaurant owner can act on.
 *
 * Everything here is presentation. The numbers, and every decision made from
 * them, come from `partner_credit_state()` in the database — the client is
 * never trusted with whether a redemption may go ahead.
 */

/** Roughly how many more redemptions fit in the headroom. */
export function redemptionsLeft(summary) {
  if (!summary?.fee_cents) return 0
  return Math.max(0, Math.floor((summary.remaining_cents ?? 0) / summary.fee_cents))
}

/**
 * The one sentence at the top of the Billing page. Ordered by what the reader
 * has to do about it, not by severity — "add a card" and "pay the invoice"
 * are different jobs and must never be collapsed into one message.
 */
export function billingNotice(summary) {
  if (!summary) return null

  if (summary.suspended) {
    return {
      tone: 'bad',
      title: 'Date Passes are paused on this account.',
      body:
        'Your Date Spot is still live and students can still find you — this only affects ' +
        'passes and the scanner. Settle the outstanding invoice and it lifts by itself.',
      cta: 'Open billing',
    }
  }

  if (!summary.has_card) {
    return {
      tone: 'ask',
      title: 'Add a card to turn on Date Passes.',
      body:
        `Nothing is charged today. You are billed ${fee(summary.fee_cents)} at the end of the ` +
        'month for each pass your staff actually scanned, and nothing at all in a month ' +
        'where none were.',
      cta: 'Add a card',
    }
  }

  if (!summary.can_redeem) {
    return {
      tone: 'bad',
      title: 'Date Passes are paused until your invoice clears.',
      body:
        `You have ${money(summary.unbilled_cents)} of redemptions outstanding, past the ` +
        `${money(summary.limit_cents)} we extend at your current standing.`,
      cta: 'Open billing',
    }
  }

  if (!summary.can_issue) {
    return {
      tone: 'warn',
      title: 'New Date Passes are paused for now.',
      body:
        `You are at your ${money(summary.limit_cents)} limit with ` +
        `${money(summary.unbilled_cents)} outstanding. Passes already in people's hands are ` +
        'still being honoured, and everything resumes the moment your invoice is paid.',
      cta: 'Open billing',
    }
  }

  const left = redemptionsLeft(summary)
  if (left > 0 && left <= 5) {
    return {
      tone: 'warn',
      title: `About ${left} ${left === 1 ? 'redemption' : 'redemptions'} of headroom left.`,
      body:
        'Nothing is wrong — this is just how far ahead we bill. Your limit goes up on its ' +
        'own once this month’s invoice is paid.',
      cta: 'See details',
    }
  }

  return null
}

/** Plain-English "why is my limit what it is", for the credit panel. */
export function tierExplainer(summary) {
  if (!summary) return null
  const next = summary.next_tier
  if (!next) {
    return 'You are on the highest standing we offer. Thanks for being reliable about it.'
  }
  const needInvoices = Math.max(0, (next.min_paid_invoices ?? 0) - (summary.paid_invoices ?? 0))
  const needCents = Math.max(0, (next.min_paid_cents ?? 0) - (summary.lifetime_paid_cents ?? 0))

  if (!needInvoices && !needCents) {
    return `Next: ${next.name}, worth ${money(next.limit_cents)} — it applies once your record stays clean.`
  }
  const parts = []
  if (needInvoices) parts.push(`${needInvoices} more paid ${needInvoices === 1 ? 'invoice' : 'invoices'}`)
  if (needCents) parts.push(`${money(needCents)} more billed`)
  return `${parts.join(' and ')} moves you to ${next.name}, worth ${money(next.limit_cents)}.`
}
