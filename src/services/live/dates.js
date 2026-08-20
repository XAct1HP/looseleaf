import { supabase } from '../../lib/supabase'
import { daysText } from '../../data/partnerCatalog'

/**
 * ── Somewhere to go, live ───────────────────────────────────────────────────
 *
 * The consumer half of the partner platform: browsing Date Spots, asking Loose
 * Leaf where to go, unlocking an offer, and carrying the Date Pass.
 *
 * Ranking happens in `recommend_date_spots`, in the database, where the weights
 * are visible and testable. This file does not sort, filter, or reorder what
 * comes back — if it did, the promise that a business can't buy its way up the
 * list would depend on a component nobody re-reads.
 */

function bail(error) {
  if (error) throw new Error(error.message)
}

const SPOT_COLUMNS = `
  id, name, kind, note, tags, date_types, vibes, price_level, walk_minutes,
  distance_miles, address_line, website, phone, hours, cover_path, logo_path,
  gallery_paths, indoor_outdoor, reservations, min_age, partner_id
`

function shapeSpot(row) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    note: row.note,
    tags: row.tags ?? [],
    dateTypes: row.date_types ?? [],
    vibes: row.vibes ?? [],
    priceLevel: row.price_level,
    walkMinutes: row.walk_minutes,
    distanceMiles: row.distance_miles,
    addressLine: row.address_line,
    website: row.website,
    phone: row.phone,
    hours: row.hours ?? {},
    coverPath: row.cover_path,
    logoPath: row.logo_path,
    galleryPaths: row.gallery_paths ?? [],
    indoorOutdoor: row.indoor_outdoor,
    reservations: row.reservations,
    minAge: row.min_age,
    isPartner: Boolean(row.partner_id),
    partnerId: row.partner_id,
  }
}

/** Everything publishable on this campus. RLS decides what "publishable" means. */
export async function spots() {
  const { data, error } = await supabase
    .from('date_spots')
    .select(SPOT_COLUMNS)
    .order('walk_minutes', { nullsFirst: false })
  bail(error)
  return (data ?? []).map(shapeSpot)
}

/**
 * The live offers attached to the spots on this campus, keyed by partner. Read
 * straight from `partner_offers`, whose select policy only exposes an offer
 * that is active, from a live partner, on a plan that includes offers.
 */
export async function offersByPartner() {
  const { data, error } = await supabase
    .from('partner_offers')
    .select('id, partner_id, title, offer_type, percent_off, amount_off_cents, min_spend_cents, free_item, description, terms, days_of_week, start_time, end_time')
    .eq('status', 'active')
  bail(error)

  const map = {}
  for (const o of data ?? []) {
    if (!map[o.partner_id]) map[o.partner_id] = shapeOffer(o)
  }
  return map
}

export function shapeOffer(o) {
  return {
    id: o.id,
    partnerId: o.partner_id,
    title: o.title,
    terms: o.terms,
    daysOfWeek: o.days_of_week ?? [],
    daysText: daysText(o.days_of_week),
    startTime: o.start_time,
    endTime: o.end_time,
    summary: offerSummary(o),
  }
}

/** The one-line version a card shows. Mirrors the SQL so both read the same. */
export function offerSummary(o) {
  const dollars = (c) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`
  switch (o.offer_type) {
    case 'percent_off':
      return `${o.percent_off}% off your date`
    case 'amount_off':
      return `${dollars(o.amount_off_cents)} off`
    case 'free_item':
      return `Free ${o.free_item || 'treat'}`
    case 'bogo':
      return 'Buy one, get one'
    case 'spend_threshold':
      return `${dollars(o.amount_off_cents)} off ${dollars(o.min_spend_cents)}+`
    default:
      return o.description || o.title
  }
}

/**
 * "Where should we go?" — answered by the database.
 *
 * `dateType` is a filter and not a preference: ask for coffee and you get
 * places that do coffee. Pass null for "surprise us".
 */
export async function recommend({
  dateType = null,
  vibes = [],
  maxPrice = null,
  maxWalk = null,
  at = null,
  conversationId = null,
  surface = 'planner',
  limit = 6,
} = {}) {
  const { data, error } = await supabase.rpc('recommend_date_spots', {
    p_date_type: dateType,
    p_vibes: vibes,
    p_max_price: maxPrice,
    p_max_walk: maxWalk,
    p_at: at ?? new Date().toISOString(),
    p_conversation: conversationId,
    p_surface: surface,
    p_limit: limit,
  })
  bail(error)

  return (data ?? []).map((r) => ({
    id: r.spot_id,
    name: r.name,
    kind: r.kind,
    note: r.note,
    tags: r.tags ?? [],
    dateTypes: r.date_types ?? [],
    vibes: r.vibes ?? [],
    priceLevel: r.price_level,
    walkMinutes: r.walk_minutes,
    distanceMiles: r.distance_miles,
    coverPath: r.cover_path,
    logoPath: r.logo_path,
    addressLine: r.address_line,
    isPartner: r.is_partner,
    partnerId: r.partner_id,
    offer: r.offer_id
      ? { id: r.offer_id, title: r.offer_title, summary: r.offer_summary }
      : null,
    fit: r.fit,
  }))
}

/* ── measurement ────────────────────────────────────────────────────────── */
//  Fire-and-forget: a failed analytics write must never break a page. These
//  are the only writes a student's client makes into partner data, and both
//  look the partner up server-side so a client can't attribute an event
//  anywhere it likes.

export function logSpotView(spotId) {
  supabase.rpc('log_spot_view', { p_spot: spotId }).then(
    () => {},
    () => {}
  )
}

export function logRecommendation(spotId, { surface, conversationId = null, rank = null, fit = null, outcome = 'shown' }) {
  supabase
    .rpc('log_recommendation', {
      p_spot: spotId,
      p_surface: surface,
      p_conversation: conversationId,
      p_rank: rank,
      p_fit: fit,
      p_outcome: outcome,
    })
    .then(
      () => {},
      () => {}
    )
}

/* ── Date Passes ────────────────────────────────────────────────────────── */

export async function unlockOffer(offerId, { conversationId = null, surface = 'planner' } = {}) {
  const { data, error } = await supabase.rpc('issue_date_pass', {
    p_offer: offerId,
    p_conversation: conversationId,
    p_surface: surface,
  })
  bail(error)
  const r = data?.[0]
  if (!r) throw new Error('That offer isn’t available right now.')
  return {
    id: r.pass_id,
    code: r.pass_code,
    expiresAt: r.pass_expires_at,
    offerTitle: r.offer_title,
    partnerName: r.partner_name,
  }
}

export async function myPasses({ includeUsed = false } = {}) {
  const { data, error } = await supabase.rpc('my_date_passes', { p_include_used: includeUsed })
  bail(error)
  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    status: r.status,
    issuedAt: r.issued_at,
    expiresAt: r.expires_at,
    redeemedAt: r.redeemed_at,
    offerTitle: r.offer_title,
    offerSummary: r.offer_summary,
    terms: r.offer_terms,
    daysText: r.days_text,
    partnerName: r.partner_name,
    partnerLogo: r.partner_logo,
    addressLine: r.address_line,
    spotId: r.spot_id,
  }))
}
