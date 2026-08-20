/**
 * ── When Loose Leaf is allowed to suggest a date ────────────────────────────
 *
 * One function, deliberately, so "don't spam conversations" is a rule with an
 * address rather than a good intention spread across components.
 *
 * It reads only what the conversation already contains — how many messages,
 * whether both people are actually talking, how long it has been going, and
 * whether anybody has said anything about meeting. There is no model here and
 * no analysis of what was said beyond a short list of phrases people use when
 * they are already trying to make a plan, which is the moment help is welcome
 * rather than intrusive.
 *
 * The signals are separated from the thresholds on purpose: tuning when this
 * fires should be editing numbers in one object, and adding a new signal —
 * "they both marked themselves free tonight", say — should be adding a field
 * to `read()` rather than touching every caller.
 */

/** Everything the decision is allowed to look at. */
export const THRESHOLDS = {
  /** Nothing before this, however keen everyone seems. */
  minMessages: 6,
  /** Both people have to be in it. A monologue is not a conversation. */
  minFromEachSide: 2,
  /** Somebody mentioned meeting: we can help sooner. */
  minMessagesWhenAsked: 3,
  /** Not twice in the same day, even across different conversations. */
  cooldownHours: 20,
  /** After this many ignored suggestions in one thread, stop offering. */
  maxOffersPerConversation: 2,
}

/**
 * Phrases that mean "we are already trying to work out where to go". Kept
 * short and literal — this is a nudge trigger, not comprehension, and a long
 * clever list would start firing on conversations that weren't about that.
 */
const MEETING_PHRASES = [
  'where should we',
  'where do you want',
  'wanna grab',
  'want to grab',
  'we should go',
  'we should get',
  'let’s go',
  "let's go",
  'free this',
  'free tonight',
  'are you around',
  'meet up',
  'coffee sometime',
  'dinner sometime',
  'what are you doing',
  'you free',
]

/**
 * Reduces a conversation to the handful of numbers the decision needs.
 * Takes the shape the store already holds so callers pass what they have.
 */
export function read(conversation, { now = Date.now() } = {}) {
  const messages = conversation?.messages ?? []
  const mine = messages.filter((m) => m.from === 'me').length
  const theirs = messages.length - mine

  const recentText = messages
    .slice(-8)
    .map((m) => (m.text ?? '').toLowerCase())
    .join(' ')

  return {
    total: messages.length,
    fromEachSide: Math.min(mine, theirs),
    askedAboutMeeting: MEETING_PHRASES.some((p) => recentText.includes(p)),
    hasPlan: Boolean(conversation?.datePlan),
    dismissed: Boolean(conversation?.nudgeDismissed),
    offersShown: conversation?.nudgesShown ?? 0,
    hoursSinceLastOffer:
      conversation?.lastNudgeAt != null ? (now - conversation.lastNudgeAt) / 3_600_000 : Infinity,
  }
}

/**
 * Should a suggestion appear right now?
 *
 * Returns `{ show, reason }` rather than a bare boolean so the reason can be
 * logged, tested, and — when it says no — read by a person wondering why.
 */
export function shouldSuggest(conversation, options = {}) {
  const s = read(conversation, options)

  if (s.hasPlan) return { show: false, reason: 'they already have a plan' }
  if (s.dismissed) return { show: false, reason: 'waved away' }
  if (s.offersShown >= THRESHOLDS.maxOffersPerConversation) {
    return { show: false, reason: 'offered enough times already' }
  }
  if (s.hoursSinceLastOffer < THRESHOLDS.cooldownHours) {
    return { show: false, reason: 'too soon after the last one' }
  }
  if (s.fromEachSide < THRESHOLDS.minFromEachSide) {
    return { show: false, reason: 'only one of them is talking' }
  }

  const needed = s.askedAboutMeeting ? THRESHOLDS.minMessagesWhenAsked : THRESHOLDS.minMessages
  if (s.total < needed) return { show: false, reason: 'too early' }

  return {
    show: true,
    reason: s.askedAboutMeeting ? 'they’re already trying to make a plan' : 'this has legs',
  }
}
