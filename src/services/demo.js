/**
 * ── Demo campus ─────────────────────────────────────────────────────────────
 *
 * The bundled, fictional University of Michigan: 18 students, some incoming
 * likes, two conversations. Used when VITE_DATA_MODE=demo so the app is fully
 * explorable with no backend, no account, and no network.
 *
 * This module is loaded dynamically and only in demo mode — none of these
 * invented people end up in the production bundle.
 *
 * The live implementation lives in services/live/. Both are reached through
 * services/backend.js.
 */

import { CURRENT_USER, PEOPLE, CONNECTIONS, personById, connectionById } from '../data/people'
const STORAGE_KEY = 'looseleaf.demo.v1'
const wait = (ms = 90) => new Promise((r) => setTimeout(r, ms))

/* ----------------------------------------------------------- persistence -- */

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* first run, or storage unavailable */
  }
  return null
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* non-fatal */
  }
}

export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* non-fatal */
  }
}

/* --------------------------------------------------------------- seeding -- */

const minutesAgo = (m) => Date.now() - m * 60_000
const hoursAgo = (h) => Date.now() - h * 3_600_000

let noteSeq = 0
const nid = (prefix) => `${prefix}-${Date.now().toString(36)}-${(noteSeq++).toString(36)}`

/** Likes that were waiting for you when you signed in. All visible. Always. */
function seedIncoming() {
  return [
    {
      id: 'in-1',
      personId: 'p-maya',
      target: { type: 'photo', index: 1 },
      targetLabel: 'your photo',
      note: null,
      at: minutesAgo(24),
      status: 'pending',
    },
    {
      id: 'in-2',
      personId: 'p-lauren',
      target: { type: 'prompt', index: 1 },
      targetLabel: 'your answer',
      note: "Wait, you've actually driven the Tail of the Dragon?",
      at: hoursAgo(3),
      status: 'pending',
    },
    {
      id: 'in-3',
      personId: 'p-sana',
      target: { type: 'prompt', index: 0 },
      targetLabel: 'your answer',
      note: 'Coffee that turns into food is the only correct first date.',
      at: hoursAgo(9),
      status: 'pending',
    },
    {
      id: 'in-4',
      personId: 'p-chloe',
      target: { type: 'photo', index: 3 },
      targetLabel: 'your photo',
      note: null,
      at: hoursAgo(20),
      status: 'pending',
    },
    {
      id: 'in-5',
      personId: 'p-marisol',
      target: { type: 'prompt', index: 2 },
      targetLabel: 'your answer',
      note: 'I know a diner. It is objectively bad and I love it.',
      at: hoursAgo(31),
      status: 'pending',
    },
    {
      id: 'in-6',
      personId: 'p-hana',
      target: { type: 'photo', index: 2 },
      targetLabel: 'your photo',
      note: null,
      at: hoursAgo(44),
      status: 'pending',
    },
  ]
}

function seedConversations() {
  return {
    'cv-grace': {
      id: 'cv-grace',
      personId: 'p-grace',
      startedAt: hoursAgo(52),
      messages: [
        {
          id: 'm1',
          from: 'them',
          kind: 'note',
          text: 'Bring me a coffee without asking what I want and get it slightly wrong. It is the effort.',
          meta: 'liked your answer',
          at: hoursAgo(52),
        },
        { id: 'm2', from: 'me', text: 'This is a trap and I am walking into it. Order noted, roughly.', at: hoursAgo(51) },
        { id: 'm3', from: 'them', text: 'Correct energy. Oat latte, and if they are out, surprise me.', at: hoursAgo(50) },
        { id: 'm4', from: 'me', text: 'How do you have any free time with nursing rotations?', at: hoursAgo(49) },
        {
          id: 'm5',
          from: 'them',
          text: 'I do not, but I have Thursday afternoons and I defend them violently.',
          at: hoursAgo(28),
        },
        { id: 'm6', from: 'me', text: 'Noted. Thursday is now sacred to me too.', at: hoursAgo(27) },
        { id: 'm7', from: 'them', text: 'Careful, I will hold you to that one.', at: hoursAgo(4) },
      ],
      datePlan: null,
      nudgeDismissed: false,
    },
    'cv-jordan': {
      id: 'cv-jordan',
      personId: 'p-jordan',
      startedAt: hoursAgo(9),
      messages: [
        {
          id: 'm1',
          from: 'me',
          kind: 'note',
          text: 'The alley behind Liberty take is correct and I feel seen.',
          meta: 'liked their answer',
          at: hoursAgo(9),
        },
        { id: 'm2', from: 'them', text: 'Finally. Everyone defends the Diag out of obligation.', at: hoursAgo(8) },
      ],
      datePlan: null,
      nudgeDismissed: false,
    },
  }
}

export function seedState() {
  return {
    session: { authed: false, email: '', verified: false, onboarded: false },
    me: CURRENT_USER,
    seen: [],
    outgoing: [],
    incoming: seedIncoming(),
    matches: [
      { id: 'mt-grace', personId: 'p-grace', at: hoursAgo(52), conversationId: 'cv-grace' },
      { id: 'mt-jordan', personId: 'p-jordan', at: hoursAgo(9), conversationId: 'cv-jordan' },
    ],
    conversations: seedConversations(),
    tonight: { active: false, mood: null },
    notifications: [
      { id: 'n1', kind: 'note', personId: 'p-lauren', text: 'Lauren left you a note.', at: hoursAgo(3), read: false },
      { id: 'n2', kind: 'like', personId: 'p-maya', text: 'Maya liked your photo.', at: minutesAgo(24), read: false },
      {
        id: 'n3',
        kind: 'message',
        personId: 'p-grace',
        text: 'Grace sent you a message.',
        at: hoursAgo(4),
        read: false,
      },
      {
        id: 'n4',
        kind: 'campus',
        text: 'Still free tonight? 87 people on campus are making plans.',
        at: hoursAgo(6),
        read: true,
      },
      { id: 'n5', kind: 'match', personId: 'p-jordan', text: 'You and Jordan found each other.', at: hoursAgo(9), read: true },
    ],
    blocked: [],
    reported: [],
    paused: false,
    doubleDate: { partnerId: null },
    formals: [],
  }
}

/* ------------------------------------------------------------------ reads -- */

/**
 * Today's deck. Deliberately finite: a good handful of people, then done.
 * Ranking inputs: preferences, campus, intention, shared context. Nothing else.
 */
export async function getDeck(state, { limit = 20 } = {}) {
  await wait(60)
  const { me, seen, blocked, matches, outgoing } = state
  const excluded = new Set([
    ...seen,
    ...blocked,
    ...matches.map((m) => m.personId),
    ...outgoing.map((o) => o.personId),
  ])
  const wants = me.prefs?.interestedIn ?? []
  const [minAge, maxAge] = me.prefs?.ageRange ?? [18, 30]

  const genderMatches = (p) =>
    wants.length === 0 ||
    wants.includes('everyone') ||
    (wants.includes('women') && p.gender === 'woman') ||
    (wants.includes('men') && p.gender === 'man') ||
    (wants.includes('nonbinary') && p.gender === 'nonbinary')

  return PEOPLE.filter(
    (p) => !excluded.has(p.id) && genderMatches(p) && p.age >= minAge && p.age <= maxAge
  ).slice(0, limit)
}

export async function getIncomingLikes(state) {
  await wait(40)
  // Every single one. No blur, no "upgrade to see", no cap.
  return state.incoming
    .filter((l) => l.status === 'pending' && !state.blocked.includes(l.personId))
    .map((l) => ({ ...l, person: personById(l.personId) }))
}

export async function getTonightCount() {
  await wait(30)
  return 87
}

/* ----------------------------------------------------------------- writes -- */

export function buildLike({ personId, target, targetLabel, note }) {
  return { id: nid('out'), personId, target, targetLabel, note: note || null, at: Date.now() }
}

export function buildMatch(personId) {
  const conversationId = nid('cv')
  return {
    match: { id: nid('mt'), personId, at: Date.now(), conversationId },
    conversation: {
      id: conversationId,
      personId,
      startedAt: Date.now(),
      messages: [],
      datePlan: null,
      nudgeDismissed: false,
    },
  }
}

export function buildMessage(text, from = 'me', extra = {}) {
  return { id: nid('m'), from, text, at: Date.now(), ...extra }
}

export function buildNotification(kind, text, personId) {
  return { id: nid('n'), kind, text, personId, at: Date.now(), read: false }
}

/**
 * Demo-only: a matched person replies so conversations feel alive.
 * Deleted entirely once real messaging exists.
 */
export const CANNED_REPLIES = [
  'Okay that is a real answer, I respect it.',
  'You are going to have to explain that one in person.',
  'I am extremely free Thursday if that means anything to you.',
  'Wrong, but confidently wrong, which counts for something.',
  'Ha — okay, now I actually want to know more.',
]

export function pickReply(seed = 0) {
  return CANNED_REPLIES[seed % CANNED_REPLIES.length]
}

/* ═══════════════════════════════════════════════════════════════════════════
   Backstage fixtures

   Demo-mode equivalents of the staff_overview RPC and the moderation queues,
   so the Backstage section is explorable without a backend. Mutated in memory
   only — approving something here changes nothing anywhere.
   ═══════════════════════════════════════════════════════════════════════════ */

let demoReports = [
  {
    id: 'rp-1',
    reason: 'Fake profile or someone else’s photos',
    status: 'open',
    note: null,
    at: hoursAgo(5),
    reporter: { id: 'p-grace', first_name: 'Grace', major: 'Nursing', grad_year: '28' },
    reported: { id: 'p-nate', first_name: 'Nate', major: 'Kinesiology', grad_year: '28', is_paused: false },
  },
  {
    id: 'rp-2',
    reason: 'Harassment or hate',
    status: 'open',
    note: null,
    at: hoursAgo(26),
    reporter: { id: 'p-riley', first_name: 'Riley', major: 'Information Science', grad_year: '27' },
    reported: { id: 'p-tyler', first_name: 'Tyler', major: 'Sport Management', grad_year: '28', is_paused: false },
  },
  {
    id: 'rp-3',
    reason: 'Spam, scam, or selling something',
    status: 'dismissed',
    note: 'Looked like a normal profile — no action.',
    at: hoursAgo(70),
    reporter: { id: 'p-omar', first_name: 'Omar', major: 'Political Science', grad_year: '26' },
    reported: { id: 'p-zoe', first_name: 'Zoe', major: 'Economics', grad_year: '28', is_paused: false },
  },
]

let demoPending = [
  {
    id: 'ev-1',
    title: 'Kerrytown night market',
    when: 'Thursday · 6 PM',
    venue: 'Kerrytown',
    kind: 'Around town',
    emoji: '🏮',
    status: 'pending',
    authorName: 'Chloe',
    submittedAt: hoursAgo(9),
  },
  {
    id: 'ev-2',
    title: 'Student film showcase',
    when: 'Friday · 8 PM',
    venue: 'State Theatre',
    kind: 'Arts',
    emoji: '🎬',
    status: 'pending',
    authorName: 'Eli',
    submittedAt: hoursAgo(31),
  },
]

export function staffOverview(days = 14) {
  // A believable pre-launch curve: slow, with a bump when someone posted it.
  const shape = [1, 0, 2, 3, 1, 4, 6, 3, 2, 5, 9, 7, 4, 6]
  const today = new Date()
  const signups = Array.from({ length: days }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (days - 1 - i))
    return { day: d.toISOString(), count: shape[(shape.length - days + i + shape.length) % shape.length] }
  })

  return {
    campus: {
      name: 'University of Michigan',
      short_name: 'Michigan',
      threshold: 50,
      is_live: false,
      is_open: false,
    },
    members: 34,
    signed_up: 41,
    incomplete: 7,
    paused: 1,
    likes: 128,
    notes: 47,
    matches: 22,
    messages: 310,
    open_reports: demoReports.filter((r) => r.status === 'open').length,
    pending_events: demoPending.filter((e) => e.status === 'pending').length,
    live_tonight: 12,
    signups,
  }
}

export function staffReports(status = 'open') {
  return status === 'all' ? demoReports : demoReports.filter((r) => r.status === status)
}

export function staffResolveReport(id, decision, note) {
  demoReports = demoReports.map((r) =>
    r.id === id ? { ...r, status: decision, note: note || null, reviewedAt: Date.now() } : r
  )
}

export function staffSetPaused(profileId, paused) {
  demoReports = demoReports.map((r) =>
    r.reported.id === profileId ? { ...r, reported: { ...r.reported, is_paused: paused } } : r
  )
}

export function staffPendingEvents() {
  return demoPending.filter((e) => e.status === 'pending')
}

export function staffReviewEvent(id, decision) {
  demoPending = demoPending.map((e) => (e.id === id ? { ...e, status: decision } : e))
}

/* ─────────────────────────────────────────────────────────── mutuals ─────
 *
 * The demo campus, searched the same way the real one is: exact first name
 * AND exact major, or nothing. Same rule, same shape of answer — the point of
 * the demo is that it can't do anything the live app can't.
 */

const seedMutuals = () =>
  (CURRENT_USER.mutuals ?? []).map((id) => ({
    connectionId: `conn-${id}`,
    ...connectionById(id),
    state: 'connected',
    scene: 'portrait',
  }))

let demoConnections = [
  ...seedMutuals(),
  {
    connectionId: 'conn-incoming-1',
    ...connectionById('c-priya'),
    state: 'incoming',
    scene: 'portrait',
    createdAt: hoursAgo(20),
  },
]

let demoThreads = {}

export function mutualsList() {
  return {
    mutuals: demoConnections.filter((c) => c.state === 'connected'),
    incoming: demoConnections.filter((c) => c.state === 'incoming'),
    sent: demoConnections.filter((c) => c.state === 'sent'),
  }
}

export async function mutualsSearch(firstName, major) {
  await wait(280)
  const n = (firstName || '').trim().toLowerCase()
  const m = (major || '').trim().toLowerCase()
  if (n.length < 2 || m.length < 3) throw new Error('Give both a first name and a major.')

  return CONNECTIONS.filter(
    (c) => c.firstName.toLowerCase() === n && c.major.toLowerCase() === m
  ).map((c) => ({
    ...c,
    scene: 'portrait',
    state: demoConnections.find((x) => x.id === c.id)?.state ?? 'none',
  }))
}

export function mutualsRequest(personId) {
  const person = connectionById(personId)
  if (!person) throw new Error('That person is not available.')
  const existing = demoConnections.find((c) => c.id === personId)
  if (existing) {
    if (existing.state === 'incoming') existing.state = 'connected'
    return existing.connectionId
  }
  const connectionId = nid('conn')
  demoConnections = [
    ...demoConnections,
    { connectionId, ...person, state: 'sent', scene: 'portrait', createdAt: Date.now() },
  ]
  return connectionId
}

export function mutualsRespond(connectionId, accept) {
  demoConnections = accept
    ? demoConnections.map((c) => (c.connectionId === connectionId ? { ...c, state: 'connected' } : c))
    : demoConnections.filter((c) => c.connectionId !== connectionId)
}

export function mutualsRemove(connectionId) {
  demoConnections = demoConnections.filter((c) => c.connectionId !== connectionId)
  delete demoThreads[connectionId]
}

/** Who you and one other person both know — an intersection of two lists. */
export function mutualsSharedWith(personId) {
  const person = personById(personId)
  const mine = new Set(demoConnections.filter((c) => c.state === 'connected').map((c) => c.id))
  return (person?.mutuals ?? [])
    .filter((id) => mine.has(id))
    .map((id) => ({ ...connectionById(id), scene: 'portrait' }))
}

export function mutualsThread(connectionId) {
  return demoThreads[connectionId] ?? []
}

export function mutualsSend(connectionId, text, personRef = null) {
  const message = {
    id: nid('mm'),
    from: 'me',
    text,
    card: personRef ? { ...personById(personRef), scene: 'portrait' } : null,
    at: Date.now(),
  }
  demoThreads = { ...demoThreads, [connectionId]: [...(demoThreads[connectionId] ?? []), message] }
  return message
}

/** A mutual replies once, warmly, so the thread reads like a conversation. */
export function mutualsReply(connectionId, seed = 0) {
  const lines = [
    'ha yes I know her, she’s great',
    'we had a class together last year — you’d get on',
    'don’t know them well but I’ve only heard good things',
    'go for it honestly',
  ]
  const message = {
    id: nid('mm'),
    from: 'them',
    text: lines[seed % lines.length],
    card: null,
    at: Date.now(),
  }
  demoThreads = { ...demoThreads, [connectionId]: [...(demoThreads[connectionId] ?? []), message] }
  return message
}
