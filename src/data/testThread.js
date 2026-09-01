/**
 * ── One invented match, for checking the room is wired up ───────────────────
 *
 * A conversation you can actually have, with somebody who does not exist, so
 * that the parts of the app that only appear *inside* a conversation — the
 * bubbles, the suggestion card, the planner — can be looked at without waiting
 * for two real students to match and then get far enough into talking.
 *
 * Four rules hold this apart from everything else, and they are the reason it
 * is safe to have on a live campus:
 *
 *   It exists in one browser. Nothing here is written to Postgres. There is no
 *   profile row, no match row, no conversation row, so there is nobody for it
 *   to leak to and nothing to clean up. Signing out or reloading takes it with
 *   it.
 *
 *   It is staff-only, and it says what it is. `profiles.is_admin` gates it, and
 *   the thread carries a banner rather than relying on you remembering.
 *
 *   Avery is not in `PEOPLE`. The demo cast is what the deck, the mutual
 *   search and the campus surfaces iterate, and dropping an invented student
 *   into it is precisely the leak this codebase keeps re-learning about. She is
 *   resolvable by id and by nothing else.
 *
 *   And it is not counted. The thread's recommendations run against the real
 *   `recommend_date_spots` — that is the whole point of it — but they carry
 *   `surface: 'test'`, which `services/dates.js` refuses to log and refuses to
 *   issue a Date Pass for. A staff member poking at this must not turn up in a
 *   real business's funnel, and must not spend one of their redemptions.
 *
 * What it *cannot* fake: the database half of the couple. `recommend_date_spots`
 * reads the other person's interests out of the conversation, and there is no
 * conversation. So it scores on your interests plus the couple's request —
 * budget, walk, date type — which the client works out from both profiles the
 * same way it does in demo mode. Ranking, filtering and the ten-point ceiling
 * on anything money can buy are all the real ones.
 */

export const TEST_PERSON_ID = 'test-avery'
export const TEST_CONVERSATION_ID = 'test-thread'
export const TEST_MATCH_ID = 'test-match'

const hoursAgo = (h) => Date.now() - h * 3_600_000

export const TEST_PERSON = {
  id: TEST_PERSON_ID,
  isTest: true,
  firstName: 'Avery',
  age: 21,
  gender: 'woman',
  pronouns: 'she/her',
  gradYear: '27',
  major: 'Urban Planning',
  minor: 'Photography',
  area: 'Central Campus',
  orgs: ['Campus radio', 'Bike co-op'],
  intention: 'relationship',
  interests: ['coffee', 'live-music', 'thrifting', 'photography', 'cooking', 'hiking', 'farmers-market'],
  photos: [{ scene: 'portrait' }, { scene: 'coffee' }, { scene: 'concert' }, { scene: 'plants' }],
  prompts: [
    {
      q: 'My perfect Sunday...',
      a: 'Walk somewhere with no plan, end up somewhere with good bread, stay too long.',
    },
    {
      q: 'The hill I’ll die on is...',
      a: 'A place with a bad sign and a queue is always better than a place with a good sign and none.',
    },
    {
      q: 'We should absolutely...',
      a: 'Pick a street neither of us has walked down and see what is on it.',
    },
  ],
  mutuals: [],
  // What the recommender reads off her half of the couple.
  survey: {
    idealDates: ['coffee', 'walk', 'dinner'],
    budgetLevel: 2,
    maxWalkMinutes: 20,
    drinks: 'sometimes',
    going_out: 'either',
    chronotype: 'night',
    planning: 'spontaneous',
    group_size: 'one-on-one',
    texting: 'texter',
    conversation: 'deep',
  },
}

/**
 * Her replies, in order, cycling once they run out.
 *
 * Written to go somewhere. The suggestion card is allowed to appear at six
 * messages with at least two from each side (`lib/dateNudge.js`), which from
 * her single opener means your third message — so by the time it lands the two
 * of you are visibly circling a plan, which is the only moment a suggestion is
 * help rather than an advert. Testing that it fires at the *wrong* moment is
 * worth as much as testing that it fires at the right one, so nothing here
 * says "where should we go" and trips the early trigger for you; type that
 * yourself and watch it come one message sooner.
 */
export const TEST_REPLIES = [
  'Okay that is a much better answer than I expected on a Tuesday.',
  'I am around most of this week, genuinely. Thursday is the only day I have anything on.',
  'I have been meaning to actually go somewhere instead of talking about going somewhere.',
  'Fine — you pick, I will complain about it afterwards either way.',
  'That works. Send me a time and I will be there ten minutes late.',
]

export function testSeed() {
  return {
    match: {
      id: TEST_MATCH_ID,
      personId: TEST_PERSON_ID,
      at: hoursAgo(2),
      conversationId: TEST_CONVERSATION_ID,
      isTest: true,
    },
    conversation: {
      id: TEST_CONVERSATION_ID,
      personId: TEST_PERSON_ID,
      isTest: true,
      startedAt: hoursAgo(2),
      messages: [
        {
          id: 'test-m1',
          from: 'them',
          kind: 'note',
          text: 'The diner one. I need to know which diner and whether you are right about it.',
          meta: 'liked your answer',
          at: hoursAgo(2),
        },
      ],
      datePlan: null,
      nudgeDismissed: false,
      nudgesShown: 0,
      lastNudgeAt: null,
    },
  }
}

/** Her next line, given how many she has already sent past the opener. */
export function testReply(alreadySent = 0) {
  return TEST_REPLIES[alreadySent % TEST_REPLIES.length]
}
