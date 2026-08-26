/**
 * Date-shaped categories, mirrored from the `partner_categories`,
 * `date_types`, and `date_vibes` tables.
 *
 * These are rows in the database because the recommender scores against them
 * and adding "Bookstore date" later should be an INSERT. This file is what the
 * public sign-up form and the demo campus fall back to before the database has
 * answered — the same relationship `PLAN_MIRROR` has to `partner_plans`.
 */

export const PARTNER_CATEGORIES = [
  { id: 'restaurant', label: 'Restaurant', emoji: '🍽' },
  { id: 'coffee', label: 'Coffee shop', emoji: '☕' },
  { id: 'cafe', label: 'Cafe', emoji: '🥐' },
  { id: 'dessert', label: 'Dessert shop', emoji: '🍨' },
  { id: 'brewery', label: 'Brewery', emoji: '🍺' },
  { id: 'bar', label: 'Bar', emoji: '🍸' },
  { id: 'bowling', label: 'Bowling alley', emoji: '🎳' },
  { id: 'arcade', label: 'Arcade', emoji: '🕹' },
  { id: 'mini-golf', label: 'Mini golf', emoji: '⛳' },
  { id: 'museum', label: 'Museum', emoji: '🏛' },
  { id: 'art-studio', label: 'Art studio', emoji: '🎨' },
  { id: 'pottery', label: 'Pottery studio', emoji: '🏺' },
  { id: 'cooking', label: 'Cooking class', emoji: '👩‍🍳' },
  { id: 'comedy', label: 'Comedy club', emoji: '🎤' },
  { id: 'venue', label: 'Live music venue', emoji: '🎶' },
  { id: 'bookstore', label: 'Bookstore', emoji: '📚' },
  { id: 'climbing', label: 'Climbing gym', emoji: '🧗' },
  { id: 'other', label: 'Somewhere else', emoji: '📍' },
]

/**
 * The vocabulary a business describes itself in — and the same vocabulary a
 * student's "what's a good date?" answers resolve into, through
 * `IDEAL_DATES[].spot` in data/catalog.js. A tag added here with no route from
 * a student answer is one no couple can ever ask for; a student answer with no
 * tag here is one no business can ever satisfy. Keep the two ends together.
 */
export const DATE_TYPE_TAGS = [
  { id: 'first-date', label: 'First date', emoji: '👋' },
  { id: 'coffee', label: 'Coffee', emoji: '☕' },
  { id: 'brunch', label: 'Brunch', emoji: '🥞' },
  { id: 'dinner', label: 'Dinner', emoji: '🍽' },
  { id: 'drinks', label: 'Drinks', emoji: '🍻' },
  { id: 'dessert', label: 'Dessert', emoji: '🍨' },
  { id: 'fun', label: 'Something fun', emoji: '🎳' },
  { id: 'activity', label: 'Activity', emoji: '🎯' },
  { id: 'games', label: 'Games', emoji: '🎲' },
  { id: 'movie', label: 'A movie', emoji: '🎬' },
  { id: 'live-music', label: 'Live music or a show', emoji: '🎶' },
  { id: 'outdoors', label: 'Outdoors', emoji: '🌳' },
  { id: 'late-night', label: 'Late night', emoji: '🌙' },
  { id: 'casual', label: 'Casual', emoji: '🧦' },
  { id: 'romantic', label: 'Romantic', emoji: '🌹' },
  { id: 'group', label: 'Group date', emoji: '👯' },
  { id: 'study', label: 'Study date', emoji: '📚' },
]

export const VIBE_TAGS = [
  { id: 'cozy', label: 'Cozy' },
  { id: 'playful', label: 'Playful' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'adventurous', label: 'Adventurous' },
  { id: 'artsy', label: 'Artsy' },
  { id: 'foodie', label: 'Foodie' },
  { id: 'competitive', label: 'Competitive' },
  { id: 'quiet', label: 'Quiet' },
  { id: 'social', label: 'Social' },
  { id: 'upscale', label: 'Upscale' },
  { id: 'low-key', label: 'Low-key' },
]

export const DEMO_TAXONOMY = {
  categories: PARTNER_CATEGORIES,
  dateTypes: DATE_TYPE_TAGS,
  vibes: VIBE_TAGS,
}

export const dateTypeById = (id) => DATE_TYPE_TAGS.find((d) => d.id === id)
export const vibeById = (id) => VIBE_TAGS.find((v) => v.id === id)
export const categoryById = (id) => PARTNER_CATEGORIES.find((c) => c.id === id)

export const dateTypeLabel = (id) => dateTypeById(id)?.label ?? id
export const vibeLabel = (id) => vibeById(id)?.label ?? id

/** What someone picks in Plan a Date. A shortlist, not the whole taxonomy. */
export const PLAN_CHOICES = [
  { id: 'coffee', emoji: '☕', label: 'Coffee' },
  { id: 'dinner', emoji: '🍽', label: 'Dinner' },
  { id: 'dessert', emoji: '🍨', label: 'Dessert' },
  { id: 'fun', emoji: '🎳', label: 'Something fun' },
  { id: 'outdoors', emoji: '🌳', label: 'Outdoors' },
  { id: null, emoji: '✨', label: 'Surprise us' },
]

/** $ / $$ / $$$ / $$$$, or an em dash when a place hasn't said. */
export const priceLabel = (level) => (level ? '$'.repeat(Math.min(4, level)) : '—')

/** Distance is from campus, never from a person — Looseleaf stores no location. */
export function distanceLabel(spot) {
  if (spot.distanceMiles != null) return `${Number(spot.distanceMiles).toFixed(1)} mi from campus`
  if (spot.walkMinutes != null) return `${spot.walkMinutes} min walk`
  return null
}

export function walkLabel(spot) {
  if (spot.walkMinutes != null) return `${spot.walkMinutes} min walk`
  if (spot.distanceMiles != null) return `${Number(spot.distanceMiles).toFixed(1)} mi`
  return null
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * "Sunday–Thursday" rather than "{0,1,2,3,4}". Mirrors `days_label()` in SQL,
 * so an offer reads the same on a card, on a pass, and in the dashboard.
 */
export function daysText(days) {
  if (!days?.length || days.length === 7) return 'Any day'
  const sorted = [...days].sort((a, b) => a - b)
  const runs = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] !== prev + 1) {
      runs.push(start === prev ? DAY_NAMES[start] : `${DAY_NAMES[start]}\u2013${DAY_NAMES[prev]}`)
      start = sorted[i]
    }
    prev = sorted[i]
  }
  runs.push(start === prev ? DAY_NAMES[start] : `${DAY_NAMES[start]}\u2013${DAY_NAMES[prev]}`)
  return runs.join(', ')
}
