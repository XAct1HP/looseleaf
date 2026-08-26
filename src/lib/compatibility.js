import { idealDateSpotTypes, INTERESTS, interestLabel, intentionById } from '../data/catalog'

/**
 * ── How well two people fit ─────────────────────────────────────────────────
 *
 * A mirror of `compatibility()` and `compatibility_reasons()` in
 * 20260828120000_compatibility.sql. The database is the authority — in live
 * mode `get_deck()` returns the score with the person, and nothing here runs.
 * This exists so the demo campus orders itself the same way the real one does,
 * because a demo that sorts people differently is a demo of a different
 * product.
 *
 * Keep the two in step. The weights below are the same table, in the same
 * order, with the same names.
 *
 * ── The one idea worth understanding ────────────────────────────────────────
 *
 * The score is a percentage of **what was achievable for this pair**, not of a
 * fixed 100. If either person skipped the survey, its thirty points leave the
 * denominator as well as the numerator. Score against a fixed ceiling instead
 * and everybody who skipped a question sits permanently below everybody who
 * didn't — which punishes the person who has told you least, exactly when you
 * most want to give them a good first impression.
 *
 * (The date-spot recommender learned the same lesson the hard way: dividing by
 * points nobody could earn stamped every "surprise us" with 49% fit.)
 */

const WEIGHTS = {
  interests: 24,
  interestAreas: 8,
  intention: 16,
  idealDates: 12,
  budget: 6,
  trait: 2, // × 6 questions
  gradYear: 6,
  area: 4,
  orgs: 6,
  mutuals: 6,
}

const TRAIT_KEYS = ['going_out', 'chronotype', 'planning', 'group_size', 'texting', 'conversation']

/** 1 · 2 · 3 for the two ends and the middle of any either/or. */
const POS = {
  homebody: 1, 'out-out': 3,
  early: 1, night: 3,
  planner: 1, spontaneous: 3,
  'one-on-one': 1, 'big-group': 3,
  texter: 1, 'in-person': 3,
  deep: 1, light: 3,
  either: 2,
}

const INTENTION_POS = { relationship: 1, dating: 2, seeing: 3, events: 3, casual: 4 }

const CATEGORY_OF = Object.fromEntries(INTERESTS.map((i) => [i.id, i.category]))

/** 2 · 1 · 0, or null when either of them left the question alone. */
export function traitAgreement(a, b) {
  if (!a || !b) return null
  const pa = POS[a]
  const pb = POS[b]
  if (!pa || !pb) return null
  return Math.max(0, 2 - Math.abs(pa - pb))
}

const shared = (a = [], b = []) => a.filter((x) => b.includes(x))
const unique = (xs) => Array.from(new Set(xs))

/**
 * @returns {{ fit: number, reasons: string[], sharedInterests: string[] }}
 */
export function compatibility(me, them) {
  if (!me || !them) return { fit: 0, reasons: [], sharedInterests: [] }

  let earned = 0
  let available = 0
  const reasons = []

  const mySurvey = me.survey ?? {}
  const theirSurvey = them.survey ?? {}

  // ── interests, exactly ────────────────────────────────────────────────
  const sharedInterests = shared(me.interests, them.interests)
  if (me.interests?.length && them.interests?.length) {
    available += WEIGHTS.interests
    earned += Math.min(WEIGHTS.interests, 8 * sharedInterests.length)
  }
  if (sharedInterests.length === 1) {
    reasons.push(`You both put ${interestLabel(sharedInterests[0]).toLowerCase()}`)
  } else if (sharedInterests.length > 1) {
    reasons.push(`${sharedInterests.length} interests in common`)
  }

  // ── interests, roughly ────────────────────────────────────────────────
  if (me.interests?.length && them.interests?.length) {
    const mineAreas = unique(me.interests.map((i) => CATEGORY_OF[i]).filter(Boolean))
    const theirAreas = unique(them.interests.map((i) => CATEGORY_OF[i]).filter(Boolean))
    available += WEIGHTS.interestAreas
    earned += Math.min(WEIGHTS.interestAreas, 2 * shared(mineAreas, theirAreas).length)
  }

  // ── here for the same thing ───────────────────────────────────────────
  available += WEIGHTS.intention
  const gap = Math.abs((INTENTION_POS[me.intention] ?? 3) - (INTENTION_POS[them.intention] ?? 3))
  earned += gap === 0 ? 16 : gap === 1 ? 10 : gap === 2 ? 4 : 0

  // ── the same idea of a date ───────────────────────────────────────────
  const sharedDates = shared(mySurvey.idealDates, theirSurvey.idealDates)
  if (mySurvey.idealDates?.length && theirSurvey.idealDates?.length) {
    available += WEIGHTS.idealDates
    earned += Math.min(WEIGHTS.idealDates, 6 * sharedDates.length)
    if (sharedDates.length) reasons.push('You want the same kind of date')
  }

  // ── the same idea of money ────────────────────────────────────────────
  if (mySurvey.budgetLevel && theirSurvey.budgetLevel) {
    available += WEIGHTS.budget
    const d = Math.abs(mySurvey.budgetLevel - theirSurvey.budgetLevel)
    earned += d === 0 ? 6 : d === 1 ? 4 : d === 2 ? 1 : 0
  }

  // ── the six either/ors ────────────────────────────────────────────────
  for (const key of TRAIT_KEYS) {
    const agree = traitAgreement(mySurvey[key], theirSurvey[key])
    if (agree === null) continue
    available += WEIGHTS.trait
    earned += agree
  }

  // ── the same year ─────────────────────────────────────────────────────
  available += WEIGHTS.gradYear
  const yearOf = (y) => Number(String(y ?? '').replace(/\D/g, '')) || 0
  if (me.gradYear && me.gradYear === them.gradYear) earned += 6
  else if (Math.abs(yearOf(me.gradYear) - yearOf(them.gradYear)) === 1) earned += 3

  // ── the same corner of campus ─────────────────────────────────────────
  if (me.area && them.area) {
    available += WEIGHTS.area
    if (me.area === them.area) earned += 4
  }

  // ── an org in common ──────────────────────────────────────────────────
  const sharedOrgs = shared(me.orgs, them.orgs)
  if (me.orgs?.length && them.orgs?.length) {
    available += WEIGHTS.orgs
    if (sharedOrgs.length) earned += 6
  }

  // ── somebody you both know ────────────────────────────────────────────
  const sharedMutuals = shared(me.mutuals, them.mutuals)
  available += WEIGHTS.mutuals
  if (sharedMutuals.length) earned += 6

  // Reasons, in the order the SQL builds them, capped at three.
  if (sharedMutuals.length) {
    reasons.push(
      `${sharedMutuals.length} mutual connection${sharedMutuals.length > 1 ? 's' : ''}`
    )
  }
  if (me.intention && me.intention === them.intention) {
    reasons.push('You’re both here for the same thing')
  }
  if (sharedOrgs.length) reasons.push(`You’re both in ${sharedOrgs[0]}`)
  if (traitAgreement(mySurvey.chronotype, theirSurvey.chronotype) === 2) {
    if (mySurvey.chronotype === 'night') reasons.push('You’re both night owls')
    else if (mySurvey.chronotype === 'early') reasons.push('You’re both up early')
  }
  if (
    traitAgreement(mySurvey.going_out, theirSurvey.going_out) === 2 &&
    mySurvey.going_out === 'homebody'
  ) {
    reasons.push('Neither of you needs a big night out')
  }
  if (me.gradYear && me.gradYear === them.gradYear) {
    reasons.push(`Both graduating in ’${them.gradYear}`)
  }
  if (me.area && me.area === them.area) reasons.push(`Both around ${them.area}`)

  const fit =
    available <= 0 ? 50 : Math.max(1, Math.min(99, Math.round((100 * earned) / available)))

  return { fit, reasons: reasons.slice(0, 3), sharedInterests }
}

/**
 * How complete somebody's own answers are, 0–1. Drives the nudge that asks
 * people to finish the survey — and it is about *their* profile, never about
 * anybody else's, so it can be shown without comparing two people.
 */
export function surveyCompleteness(me) {
  const s = me?.survey ?? {}
  const answered = [
    s.idealDates?.length > 0,
    Boolean(s.budgetLevel),
    Boolean(s.drinks),
    ...TRAIT_KEYS.map((k) => Boolean(s[k])),
  ]
  return answered.filter(Boolean).length / answered.length
}

/** A one-line description of what the app will do with this, for the nudge. */
export function intentionLabel(id) {
  return intentionById(id)?.label ?? id
}

/**
 * ── The two of you, as the date-spot recommender sees you ───────────────────
 *
 * Mirrors what `recommend_date_spots` works out for itself from the
 * conversation: what you both call a good date, the lower of two budgets, the
 * shorter of two walks, and whether either of you said no to drinks. In live
 * mode the database does this — it has both profiles and the client only has
 * one. In demo mode it happens here and is passed in.
 *
 * The intersection where one exists, the union where it doesn't: two people
 * who agree get exactly what they agree on, and two people who agree on
 * nothing get both their lists rather than an empty one.
 */
export function coupleContext(me, them) {
  const a = me?.survey ?? {}
  const b = them?.survey ?? {}
  const mineDates = a.idealDates ?? []
  const theirDates = b.idealDates ?? []

  let wantedIds = shared(mineDates, theirDates)
  if (!wantedIds.length) wantedIds = unique([...mineDates, ...theirDates])

  const budgets = [a.budgetLevel, b.budgetLevel].filter(Boolean)
  const walks = [a.maxWalkMinutes, b.maxWalkMinutes].filter(Boolean)
  const ages = [me?.age, them?.age].filter(Boolean)

  return {
    wanted: idealDateSpotTypes(wantedIds),
    interests: unique([...(me?.interests ?? []), ...(them?.interests ?? [])]),
    maxPrice: budgets.length ? Math.min(...budgets) : null,
    maxWalk: walks.length ? Math.min(...walks) : null,
    noDrinks: a.drinks === 'never' || b.drinks === 'never',
    minAge: ages.length ? Math.min(...ages) : null,
  }
}
