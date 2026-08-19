/**
 * ── The one place that talks to "the backend" ───────────────────────────────
 *
 * Everything the app does with data goes through this module. Today it's an
 * in-memory + localStorage implementation over the demo dataset. When Supabase
 * lands, replace the bodies of these functions with client calls — the
 * signatures and return shapes are what the UI depends on.
 *
 *   getDeck()              → select * from profiles where … (daily deck)
 *   sendLike(payload)      → insert into likes
 *   getIncomingLikes()     → select * from likes where target = auth.uid()
 *                            ← never paywalled, never blurred
 *   respondToLike(id, act) → insert into matches | update likes set status
 *   sendMessage(convo, t)  → insert into messages (realtime channel per convo)
 *   setTonight(status)     → upsert into tonight_status (expires next morning)
 *
 * Rules that must survive the migration:
 *   1. Ranking never reads any billing/sponsorship table.
 *   2. Incoming likes are always returned in full.
 *   3. No feature here is gated on a plan or entitlement.
 */

import { CURRENT_USER, PEOPLE, personById } from '../data/people'
import { DATA_MODE, isDemo, supabase } from '../lib/supabase'

/**
 * Which half of this module is live. `demo` uses the bundled campus below;
 * `supabase` (once the read/write bodies are ported) uses the schema in
 * supabase/migrations. Set with VITE_DATA_MODE.
 */
export { DATA_MODE, isDemo, supabase }

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
