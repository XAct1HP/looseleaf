/**
 * ── Shared bits of a live event ─────────────────────────────────────────────
 *
 * The clock arithmetic lives here rather than in a component because both the
 * participant screen and the host console have to agree about what round it
 * is, to the second, on two different devices.
 */

/* ── accents ─────────────────────────────────────────────────────────────
 *
 * A host picks from these, not from a colour wheel. Every one is checked
 * against the paper background: `ink` clears 4.5:1 for text, and the plate
 * colours are used behind white text only. A free hex field means a club
 * eventually ships an event whose round timer is illegible in a dim room, and
 * the person who suffers for it is a stranger holding a phone.
 */
export const ACCENTS = {
  coral:    { label: 'Coral',    ink: '#E9484D', plate: '#E9484D', wash: '#FFF1EF' },
  navy:     { label: 'Navy',     ink: '#111C38', plate: '#111C38', wash: '#EEF2FA' },
  moss:     { label: 'Moss',     ink: '#417A55', plate: '#417A55', wash: '#E6F2EA' },
  margin:   { label: 'Pink',     ink: '#C43F8E', plate: '#C43F8E', wash: '#FCE9F4' },
  notebook: { label: 'Blue',     ink: '#3D6FB4', plate: '#3D6FB4', wash: '#EAF3FF' },
  amber:    { label: 'Amber',    ink: '#9A6212', plate: '#9A6212', wash: '#FCF1DF' },
}

export const accentOf = (key) => ACCENTS[key] ?? ACCENTS.coral

/* ── the clock ───────────────────────────────────────────────────────────
 *
 * Every phone works out the round from the server's timestamps and the offset
 * between its own clock and the server's, taken from the same response that
 * carried the schedule. Never from a countdown started when the page loaded:
 * a phone that was asleep for two minutes would otherwise be two minutes
 * behind the room, and would say so confidently.
 */
export function clockOffset(serverNowIso) {
  if (!serverNowIso) return 0
  return new Date(serverNowIso).getTime() - Date.now()
}

/** Milliseconds until `iso`, corrected for that offset. Never negative. */
export function msUntil(iso, offset = 0) {
  if (!iso) return 0
  return Math.max(0, new Date(iso).getTime() - (Date.now() + offset))
}

export function secondsUntil(iso, offset = 0) {
  return Math.ceil(msUntil(iso, offset) / 1000)
}

/** 245 → "4:05". The colon form, because that is how a countdown reads. */
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Which of the three things is happening right now.
 *
 * `break` is a real phase, not the absence of one: it is where the vote card
 * lives and where people are walking, and it needs its own screen or the
 * round transition looks like a bug.
 */
export function phaseOf(round, offset = 0, breakSeconds = 0) {
  if (!round) return 'lobby'
  const now = Date.now() + offset
  const start = new Date(round.starts_at).getTime()
  const end = new Date(round.ends_at).getTime()
  if (now < start) return 'starting'
  if (now < end) return 'round'
  if (now < end + breakSeconds * 1000) return 'break'
  return 'between'
}

/* ── the arithmetic a host is shown before they commit ────────────────────
 *
 * A first-time host has no intuition for how long twelve rounds takes, and
 * finding out in the room is the wrong moment. So the editor says it out
 * loud: how long the night runs, and how much of the room each person
 * actually meets.
 */
export function schedulePlan({ people, roundSeconds, breakSeconds, plannedRounds }) {
  const n = Math.max(0, people || 0)
  const maxUseful = n < 2 ? 0 : n % 2 === 0 ? n - 1 : n
  const rounds = plannedRounds || maxUseful
  const total = rounds * (roundSeconds + breakSeconds)
  return {
    rounds,
    maxUseful,
    minutes: Math.round(total / 60),
    meets: Math.min(rounds, Math.max(0, n - 1)),
    others: Math.max(0, n - 1),
    everyone: rounds >= maxUseful && maxUseful > 0,
    stations: Math.floor(n / 2),
  }
}

/** "12 rounds × 4 min · about 54 minutes · everyone meets 12 of 19." */
export function planSentence(plan, people) {
  if (!people || people < 2) return 'Add a couple of people and this will tell you how long it runs.'
  const meet = plan.everyone
    ? 'everyone meets everyone'
    : `everyone meets ${plan.meets} of the other ${plan.others}`
  return `${plan.rounds} rounds · about ${plan.minutes} minutes · ${meet}.`
}

/* ── presets ─────────────────────────────────────────────────────────────
 *
 * A first-time host should not have to have an opinion about `pairing_mode`.
 * These three cover what people actually run, and each one is a complete set
 * of answers rather than a starting point they have to finish.
 */
export const PRESETS = [
  {
    id: 'speed_dating',
    label: 'Speed dating',
    blurb: 'Timed rounds, a yes-or-no card after each one, matches at the end.',
    patch: {
      round_seconds: 240,
      break_seconds: 30,
      likes_enabled: true,
      reveal: 'end',
      notes_enabled: true,
      pairing_mode: 'across',
    },
    fields: [
      {
        label: 'I’d like to meet',
        kind: 'choice',
        options: ['Women', 'Men', 'Everyone'],
        required: true,
        use_for_pairing: true,
        show_to_partner: false,
      },
    ],
  },
  {
    id: 'meet_members',
    label: 'Meet the members',
    blurb: 'Newcomers rotate through current members. No matching, private notes on.',
    patch: {
      round_seconds: 300,
      break_seconds: 30,
      likes_enabled: false,
      reveal: 'never',
      notes_enabled: true,
      pairing_mode: 'across',
    },
    fields: [
      {
        label: 'I’m a',
        kind: 'choice',
        options: ['Newcomer', 'Member'],
        required: true,
        use_for_pairing: true,
        show_to_partner: true,
      },
    ],
  },
  {
    id: 'mixer',
    label: 'Mixer',
    blurb: 'Everyone meets everyone. Matches show up as they happen.',
    patch: {
      round_seconds: 180,
      break_seconds: 20,
      likes_enabled: true,
      reveal: 'live',
      notes_enabled: true,
      pairing_mode: 'mixer',
    },
    fields: [],
  },
]

export const FIELD_KINDS = [
  { id: 'short_text', label: 'Short answer' },
  { id: 'choice', label: 'Pick one' },
  { id: 'multi_choice', label: 'Pick any' },
  { id: 'number', label: 'A number' },
  { id: 'yes_no', label: 'Yes or no' },
]

/** Codes are typed by people, so read them generously. */
export function normaliseCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V')
    .slice(0, 6)
}

/**
 * A scanned QR is a whole URL. Pull the code out of whatever shape it is —
 * a link, a link with a query string, or somebody who pasted the six
 * characters on their own.
 */
export function codeFromScan(raw) {
  const text = String(raw || '').trim()
  const m = text.match(/\/e\/([0-9A-Za-z]{6})/)
  if (m) return normaliseCode(m[1])
  return normaliseCode(text)
}
