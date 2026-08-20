/**
 * ── Plans, prices, and what each one unlocks ────────────────────────────────
 *
 * Nothing in the app is allowed to branch on a plan id. Ask
 * `can(entitlements, 'date_passes')` instead, and let the `partner_plans` row
 * decide. Moving Date Passes down to the middle tier, or changing $199 to
 * $179, should be an UPDATE against that table and a page refresh — not a
 * deploy, and certainly not a search through the components.
 *
 * The list below is a mirror, not a source of truth. It exists so the pricing
 * section renders instantly on a cold public page and so the demo campus has
 * something to show; the moment the database answers, its rows win.
 */

export const PLAN_MIRROR = [
  {
    id: 'date-spot',
    name: 'Date Spot',
    blurb: 'Be somewhere couples can find.',
    monthly_cents: 4900,
    sort: 10,
    entitlements: {
      discovery: true,
      partner_badge: true,
      photos: true,
      date_categories: true,
      analytics: 'basic',
    },
  },
  {
    id: 'featured',
    name: 'Featured Partner',
    blurb: 'Show up when Loose Leaf is helping someone choose.',
    monthly_cents: 9900,
    sort: 20,
    entitlements: {
      discovery: true,
      partner_badge: true,
      photos: true,
      date_categories: true,
      analytics: 'enhanced',
      featured_placement: true,
      recommendations: true,
      offers: true,
    },
  },
  {
    id: 'date-partner',
    name: 'Date Partner',
    blurb: 'Turn conversations into tables.',
    monthly_cents: 19900,
    sort: 30,
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
    },
  },
]

/**
 * What each tier says on the pricing card. Written per plan rather than
 * derived from the entitlement keys, because "Eligibility for personalised
 * recommendations" reads better to a restaurant owner than
 * `recommendations: true` ever will.
 */
export const PLAN_COPY = {
  'date-spot': {
    tagline: 'For a place that just wants to be found.',
    includes: [
      'Your Date Spot profile',
      'Photos, hours, and the details people ask for',
      'Date categories and vibes',
      'The Loose Leaf Partner badge',
      'Appear in Date Spots discovery',
      'Basic analytics',
    ],
  },
  featured: {
    tagline: 'For a place that wants to be suggested.',
    inherits: 'Everything in Date Spot, plus',
    includes: [
      'Enhanced placement in discovery',
      'Eligible for personalised recommendations',
      'Create Loose Leaf offers',
      'Enhanced analytics',
      'Featured treatment where it fits',
    ],
  },
  'date-partner': {
    tagline: 'For a place that wants the table filled.',
    inherits: 'Everything in Featured Partner, plus',
    includes: [
      'Recommendations inside conversations',
      'Date Passes and QR redemption',
      'Verified-date reporting',
      'Targeting controls',
      'Advanced offer limits and scheduling',
      'Priority recommendation eligibility',
    ],
    highlight: true,
  },
}

/** Reads an entitlement. Anything absent is false — a lapsed plan grants nothing. */
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

export function planById(plans, id) {
  return (plans || []).find((p) => p.id === id) || null
}

/**
 * The one place that phrases the performance fee. It stays invisible until an
 * operator sets `per_verified_date_cents` above zero on the plan *and* the
 * partner's subscription has actually been switched onto metering — so this
 * cannot start quietly appearing on invoices because someone edited a row.
 */
export function performanceFeeLine(plan, subscription) {
  const cents = plan?.per_verified_date_cents ?? 0
  if (!cents || !subscription?.metered_started_at) return null
  return `${money(cents)} per verified date`
}
