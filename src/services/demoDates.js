/**
 * ── Somewhere to go, on the demo campus ─────────────────────────────────────
 *
 * A fictional Ann Arbor: eight Date Spots, one of which is a Loose Leaf
 * Partner with a real-looking offer. Everything here is invented, including
 * the business — the rule about only ever labelling a *real* agreement as an
 * offer applies to real businesses, and the way to respect it in a demo is to
 * use a place that doesn't exist rather than to put words in a real
 * restaurant's mouth about its own prices.
 *
 * Loaded dynamically and only in demo mode, so none of it reaches the live
 * bundle. The ranking below is a small, honest imitation of
 * `recommend_date_spots`: same weights, same rule that a paid placement can
 * add at most 10 and a date type that doesn't match is excluded outright.
 */

const PARTNER_ID = 'demo-partner-lantern'

export const DEMO_SPOTS = [
  {
    id: 'vertex',
    name: 'Vertex Coffee',
    kind: 'Coffee',
    note: 'Good for a first date — small tables, no music to shout over.',
    tags: ['Quiet', '$'],
    dateTypes: ['coffee', 'first-date', 'study'],
    vibes: ['quiet', 'cozy', 'low-key'],
    priceLevel: 1,
    walkMinutes: 8,
    distanceMiles: 0.4,
    isPartner: false,
  },
  {
    id: 'lantern',
    name: 'The Lantern Room',
    kind: 'Food & Drinks',
    note: 'Booths, long menu, nobody rushes you out.',
    tags: ['Lively', '$$'],
    dateTypes: ['dinner', 'drinks', 'first-date'],
    vibes: ['social', 'foodie', 'cozy'],
    priceLevel: 2,
    walkMinutes: 9,
    distanceMiles: 0.8,
    isPartner: true,
    partnerId: PARTNER_ID,
    featured: true,
  },
  {
    id: 'roos',
    name: 'Roos Roast',
    kind: 'Coffee',
    note: 'Big tables, easy to talk.',
    tags: ['Bright', '$'],
    dateTypes: ['coffee', 'casual', 'study'],
    vibes: ['social', 'playful'],
    priceLevel: 1,
    walkMinutes: 11,
    distanceMiles: 0.6,
    isPartner: false,
  },
  {
    id: 'blank',
    name: 'Blank Slate Creamery',
    kind: 'Dessert',
    note: 'Low stakes, high reward.',
    tags: ['Casual', '$'],
    dateTypes: ['dessert', 'casual', 'first-date'],
    vibes: ['playful', 'low-key'],
    priceLevel: 1,
    walkMinutes: 14,
    distanceMiles: 0.7,
    isPartner: false,
  },
  {
    id: 'arb',
    name: 'Nichols Arboretum',
    kind: 'Outdoors',
    note: 'Best in the fall. Free, and it gives you somewhere to walk.',
    tags: ['Outdoors', 'Free'],
    dateTypes: ['outdoors', 'activity', 'first-date', 'casual'],
    vibes: ['adventurous', 'quiet', 'romantic'],
    priceLevel: 1,
    walkMinutes: 15,
    distanceMiles: 0.9,
    isPartner: false,
  },
  {
    id: 'pinball',
    name: "Pinball Pete's",
    kind: 'Arcade',
    note: 'Nothing kills a silence like air hockey.',
    tags: ['Loud', '$'],
    dateTypes: ['fun', 'activity', 'group', 'late-night'],
    vibes: ['playful', 'competitive', 'social'],
    priceLevel: 1,
    walkMinutes: 5,
    distanceMiles: 0.3,
    isPartner: false,
  },
  {
    id: 'ashley',
    name: "Ashley's",
    kind: 'Drinks',
    note: 'Two hundred beers, one decision.',
    tags: ['Classic', '$$'],
    dateTypes: ['drinks', 'late-night', 'casual'],
    vibes: ['social', 'low-key'],
    priceLevel: 2,
    walkMinutes: 7,
    distanceMiles: 0.4,
    minAge: 21,
    isPartner: false,
  },
  {
    id: 'kiln',
    name: 'Kiln & Co. Pottery',
    kind: 'Art studio',
    note: 'Two hours, one wobbly bowl each. Book ahead.',
    tags: ['Hands-on', '$$'],
    dateTypes: ['activity', 'fun', 'romantic'],
    vibes: ['artsy', 'playful', 'quiet'],
    priceLevel: 2,
    walkMinutes: 18,
    distanceMiles: 1.1,
    reservations: 'Recommended',
    isPartner: false,
  },
]

export const DEMO_OFFER = {
  id: 'demo-offer-lantern',
  partnerId: PARTNER_ID,
  title: 'Weeknight Date',
  summary: '15% off your date',
  terms: 'Dine-in only. One pass per couple. Not valid with other offers.',
  daysOfWeek: [0, 1, 2, 3, 4],
  daysText: 'Sunday–Thursday',
  startTime: '16:00',
}

export function offersByPartner() {
  return { [PARTNER_ID]: DEMO_OFFER }
}

export function spots() {
  return DEMO_SPOTS.map((s) => ({ ...s }))
}

/* ── ranking ────────────────────────────────────────────────────────────── */
//  Deliberately the same shape as the SQL. If you change one, change both.

const K = { type: 34, vibeEach: 6, vibeCap: 18, price: 14, walk: 16, open: 8, interest: 10, partnerCap: 10 }

/**
 * The fit percentage is scored against what could actually have been earned
 * for this request — asking "surprise us" makes the date-type and vibe points
 * unreachable, and dividing by a ceiling nobody could hit would stamp a
 * confident suggestion with "49% fit".
 */
function ceilingFor({ dateType, vibes, maxPrice }) {
  return (
    (dateType ? K.type : K.type / 2) +
    (vibes.length ? K.vibeCap : 0) +
    (maxPrice == null ? K.price / 2 : K.price) +
    K.walk +
    K.open +
    K.interest / 2 +
    K.partnerCap
  )
}

function score(spot, { dateType, vibes, maxPrice, interests }) {
  let n = 0

  n += dateType ? K.type : K.type / 2

  const sharedVibes = spot.vibes.filter((v) => vibes.includes(v)).length
  n += Math.min(K.vibeCap, K.vibeEach * sharedVibes)

  if (maxPrice == null || spot.priceLevel == null) n += K.price / 2
  else if (spot.priceLevel <= maxPrice) n += K.price
  else if (spot.priceLevel === maxPrice + 1) n += K.price / 2

  const w = spot.walkMinutes
  if (w == null) n += K.walk / 2
  else if (w <= 5) n += K.walk
  else if (w <= 10) n += K.walk - 4
  else if (w <= 15) n += K.walk - 8
  else if (w <= 25) n += K.walk - 12

  n += K.open

  const shared = [...spot.dateTypes, ...spot.vibes].filter((t) => interests.includes(t)).length
  n += Math.min(K.interest, 2 * shared)

  return n
}

/** The most a plan can move a place. Six for featured, four for a live offer. */
function boost(spot, offers) {
  return Math.min(K.partnerCap, (spot.featured ? 6 : 0) + (offers[spot.partnerId] ? 4 : 0))
}

export function recommend({
  dateType = null,
  vibes = [],
  maxPrice = null,
  interests = [],
  dismissed = [],
  limit = 6,
} = {}) {
  const offers = offersByPartner()
  const ceiling = ceilingFor({ dateType, vibes, maxPrice })

  return DEMO_SPOTS.filter((s) => !dismissed.includes(s.id))
    .filter((s) => !dateType || s.dateTypes.includes(dateType))
    .map((s) => {
      const relevance = score(s, { dateType, vibes, maxPrice, interests })
      const total = relevance + boost(s, offers)
      return {
        ...s,
        offer: s.isPartner ? offers[s.partnerId] ?? null : null,
        _total: total,
        fit: Math.max(1, Math.min(99, Math.round((total * 100) / ceiling))),
      }
    })
    .filter((s) => s._total - boost(s, offers) >= 24)
    .sort((a, b) => b._total - a._total || (a.walkMinutes ?? 99) - (b.walkMinutes ?? 99))
    .slice(0, limit)
    .map(({ _total, ...rest }) => rest)
}

/* ── passes ─────────────────────────────────────────────────────────────── */
//  Held in memory for the session. A demo pass is clearly marked as one on the
//  ticket itself, so nobody carries it into a real restaurant.

let passes = []
let seq = 0

export function unlockOffer(offerId) {
  const existing = passes.find((p) => p.offerId === offerId && p.status === 'issued')
  if (existing) return { ...existing }

  seq += 1
  const pass = {
    id: `demo-pass-${seq}`,
    offerId,
    code: `LL-DEMO-${String(1000 + seq)}`,
    status: 'issued',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    offerTitle: DEMO_OFFER.title,
    offerSummary: DEMO_OFFER.summary,
    terms: DEMO_OFFER.terms,
    daysText: DEMO_OFFER.daysText,
    partnerName: 'The Lantern Room',
    addressLine: '118 Liberty St',
    spotId: 'lantern',
    isDemo: true,
  }
  passes = [pass, ...passes]
  return { ...pass }
}

export function myPasses() {
  return passes.map((p) => ({ ...p }))
}
