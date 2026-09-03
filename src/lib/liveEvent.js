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
export function schedulePlan({ people, roundSeconds, breakSeconds, plannedRounds, format, stations }) {
  if (format === 'stations') {
    const s = Math.max(0, stations || 0)
    const rounds = plannedRounds || s
    const total = rounds * (roundSeconds + breakSeconds)
    const per = s > 0 ? Math.ceil((people || 0) / s) : 0
    return {
      rounds,
      maxUseful: s,
      minutes: Math.round(total / 60),
      stations: s,
      perTable: per,
      everyone: s > 0 && rounds >= s,
    }
  }
  return pairsPlan({ people, roundSeconds, breakSeconds, plannedRounds })
}

function pairsPlan({ people, roundSeconds, breakSeconds, plannedRounds }) {
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
export function planSentence(plan, people, format) {
  if (format === 'stations') {
    if (!plan.stations) return 'Add a table or two and this will tell you how long it runs.'
    const each = plan.everyone ? 'everyone gets to every table' : `everyone sees ${plan.rounds} of ${plan.stations}`
    const size = people ? ` · about ${plan.perTable} per table` : ''
    return `${plan.rounds} rounds · about ${plan.minutes} minutes · ${each}${size}.`
  }
  if (!people || people < 2) return 'Add a couple of people and this will tell you how long it runs.'
  const meet = plan.everyone
    ? 'everyone meets everyone'
    : `everyone meets ${plan.meets} of the other ${plan.others}`
  return `${plan.rounds} rounds · about ${plan.minutes} minutes · ${meet}.`
}

/* ── the token ───────────────────────────────────────────────────────────
 *
 * A participant has no account. Their identity for the night is a uuid the
 * server minted when they typed their name, and it lives here — in one
 * browser's localStorage, per event.
 *
 * Everything is wrapped in try/catch because a private window, a locked-down
 * browser, or a phone with site data disabled will throw on the *accessor*
 * rather than return null. Losing the token means being asked for a name
 * again, which is a small annoyance; an uncaught exception at a door means a
 * white screen, which is not.
 */
const TOKEN_KEY = (code) => `looseleaf.event.${String(code || '').toUpperCase()}`
const WALLET_KEY = 'looseleaf.event.tokens'

export function readToken(code) {
  try {
    return localStorage.getItem(TOKEN_KEY(code)) || null
  } catch {
    return null
  }
}

export function saveToken(code, token) {
  if (!token) return
  try {
    localStorage.setItem(TOKEN_KEY(code), token)
    //  Also kept as a flat list, so that somebody who builds a profile weeks
    //  later can hand over every night they ever went to in one call.
    const all = new Set(readWallet())
    all.add(token)
    localStorage.setItem(WALLET_KEY, JSON.stringify([...all].slice(-40)))
  } catch {
    /* a browser that won't remember is a browser that asks for a name again */
  }
}

export function readWallet() {
  try {
    const raw = JSON.parse(localStorage.getItem(WALLET_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter(Boolean) : []
  } catch {
    return []
  }
}

export function forgetToken(code) {
  try {
    localStorage.removeItem(TOKEN_KEY(code))
  } catch {
    /* nothing to do */
  }
}

/* ── presets ─────────────────────────────────────────────────────────────
 *
 * A first-time host should not have to have an opinion about `pairing_mode`,
 * or even know that two completely different formats exist. These three cover
 * what people actually run, and each one is a complete set of answers rather
 * than a starting point they have to finish.
 */
export const PRESETS = [
  {
    id: 'speed_dating',
    label: 'Speed dating',
    blurb: 'Timed rounds, one person each. A yes-or-no card after every round, matches at the end.',
    patch: {
      format: 'pairs',
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
    stations: [],
  },
  {
    //  The one that was wrong. "Meet the members" was built as speed dating
    //  with different words on it — pairs, one-to-one, everybody meeting
    //  everybody. That is not how a club runs a rush night. There are tables,
    //  a member sits at each one, and everybody else goes round them. So this
    //  preset is a different *format*, not different settings.
    id: 'meet_members',
    label: 'Meet the members',
    blurb: 'Tables with one of your members at each. Everyone else rotates around them.',
    patch: {
      format: 'stations',
      round_seconds: 300,
      break_seconds: 30,
      likes_enabled: false,
      reveal: 'never',
      notes_enabled: true,
    },
    fields: [],
    stations: [
      { label: 'Table 1', host_name: '' },
      { label: 'Table 2', host_name: '' },
      { label: 'Table 3', host_name: '' },
      { label: 'Table 4', host_name: '' },
    ],
  },
  {
    id: 'mixer',
    label: 'Mixer',
    blurb: 'Everyone meets everyone, one to one. Matches show up as they happen.',
    patch: {
      format: 'pairs',
      round_seconds: 180,
      break_seconds: 20,
      likes_enabled: true,
      reveal: 'live',
      notes_enabled: true,
      pairing_mode: 'mixer',
    },
    fields: [],
    stations: [],
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
