/**
 * Static reference data. In production most of this becomes Supabase tables
 * (`interests`, `prompts`, `intentions`, `universities`, `date_spots`,
 * `campus_events`) — the shapes here are already row-like.
 */

export const INTENTIONS = [
  { id: 'relationship', emoji: '❤️', label: 'A relationship', blurb: 'Looking for something real' },
  { id: 'dating', emoji: '🌹', label: 'Dating', blurb: 'Dating with intention' },
  { id: 'seeing', emoji: '✨', label: 'Seeing where things go', blurb: 'Open, no pressure' },
  { id: 'casual', emoji: '🔥', label: 'Something casual', blurb: 'Keeping it light' },
  { id: 'events', emoji: '🎉', label: 'Dates & events', blurb: 'Someone to actually go out with' },
]

export const intentionById = (id) => INTENTIONS.find((i) => i.id === id)

/**
 * ── Interests ───────────────────────────────────────────────────────────────
 *
 * Grouped, because a flat wall of a hundred chips is a worse question than
 * thirty — people stop reading somewhere around the fourth row and pick from
 * whatever happens to be near the top, which is exactly the noise the matching
 * engine then has to work with.
 *
 * The category is not just for the picker. Two people who both chose *nothing*
 * in common can still both be outdoorsy, and `compatibility()` scores category
 * overlap as a softer signal underneath exact matches. See
 * `src/lib/compatibility.js`, which mirrors the SQL.
 *
 * Every id here also exists as a row in the `interests` table (seeded by
 * 20260828120000). Ids are permanent: they are foreign keys on real people's
 * profiles. Labels can change, ids cannot.
 */

export const INTEREST_CATEGORIES = [
  { id: 'music', label: 'Music' },
  { id: 'sports', label: 'Sports' },
  { id: 'fitness', label: 'Staying active' },
  { id: 'outdoors', label: 'Outdoors' },
  { id: 'food', label: 'Food & drink' },
  { id: 'making', label: 'Making things' },
  { id: 'screens', label: 'Watching & reading' },
  { id: 'games', label: 'Games' },
  { id: 'going-out', label: 'Going out' },
  { id: 'quiet', label: 'Quiet things' },
  { id: 'campus', label: 'Campus life' },
  { id: 'world', label: 'Out in the world' },
  { id: 'animals', label: 'Animals' },
]

export const INTERESTS = [
  // ── music ──────────────────────────────────────────────────────────────
  { id: 'live-music', label: 'Live music', emoji: '🎶', category: 'music' },
  { id: 'concerts', label: 'Concerts', emoji: '🎤', category: 'music' },
  { id: 'festivals', label: 'Festivals', emoji: '🎪', category: 'music' },
  { id: 'vinyl', label: 'Vinyl', emoji: '📀', category: 'music' },
  { id: 'karaoke', label: 'Karaoke', emoji: '🎙️', category: 'music' },
  { id: 'making-music', label: 'Playing music', emoji: '🎸', category: 'music' },
  { id: 'djing', label: 'DJing', emoji: '🎧', category: 'music' },
  { id: 'hip-hop', label: 'Hip-hop', emoji: '🔊', category: 'music' },
  { id: 'country', label: 'Country', emoji: '🤠', category: 'music' },
  { id: 'indie', label: 'Indie', emoji: '🎵', category: 'music' },
  { id: 'edm', label: 'EDM', emoji: '🪩', category: 'music' },

  // ── sports ─────────────────────────────────────────────────────────────
  { id: 'football', label: 'Football', emoji: '🏈', category: 'sports' },
  { id: 'basketball', label: 'Basketball', emoji: '🏀', category: 'sports' },
  { id: 'hockey', label: 'Hockey', emoji: '🏒', category: 'sports' },
  { id: 'baseball', label: 'Baseball', emoji: '⚾', category: 'sports' },
  { id: 'soccer', label: 'Soccer', emoji: '⚽', category: 'sports' },
  { id: 'volleyball', label: 'Volleyball', emoji: '🏐', category: 'sports' },
  { id: 'tennis', label: 'Tennis', emoji: '🎾', category: 'sports' },
  { id: 'golf', label: 'Golf', emoji: '⛳', category: 'sports' },
  { id: 'pickleball', label: 'Pickleball', emoji: '🥒', category: 'sports' },
  { id: 'tailgating', label: 'Tailgates', emoji: '🚙', category: 'sports' },
  { id: 'college-sports', label: 'College games', emoji: '📣', category: 'sports' },
  { id: 'f1', label: 'F1', emoji: '🏁', category: 'sports' },
  { id: 'fantasy-sports', label: 'Fantasy leagues', emoji: '📊', category: 'sports' },

  // ── staying active ─────────────────────────────────────────────────────
  { id: 'gym', label: 'Gym', emoji: '🏋️', category: 'fitness' },
  { id: 'lifting', label: 'Lifting', emoji: '💪', category: 'fitness' },
  { id: 'running', label: 'Running', emoji: '🏃', category: 'fitness' },
  { id: 'run-club', label: 'Run club', emoji: '👟', category: 'fitness' },
  { id: 'yoga', label: 'Yoga', emoji: '🧘', category: 'fitness' },
  { id: 'pilates', label: 'Pilates', emoji: '🤸', category: 'fitness' },
  { id: 'climbing', label: 'Climbing', emoji: '🧗', category: 'fitness' },
  { id: 'swimming', label: 'Swimming', emoji: '🏊', category: 'fitness' },
  { id: 'cycling', label: 'Cycling', emoji: '🚴', category: 'fitness' },
  { id: 'skiing', label: 'Skiing', emoji: '🎿', category: 'fitness' },
  { id: 'snowboarding', label: 'Snowboarding', emoji: '🏂', category: 'fitness' },
  { id: 'skating', label: 'Skating', emoji: '🛹', category: 'fitness' },
  { id: 'martial-arts', label: 'Martial arts', emoji: '🥋', category: 'fitness' },
  { id: 'dance', label: 'Dance', emoji: '💃', category: 'fitness' },
  { id: 'intramurals', label: 'Intramurals', emoji: '🏆', category: 'fitness' },

  // ── outdoors ───────────────────────────────────────────────────────────
  { id: 'hiking', label: 'Hiking', emoji: '🥾', category: 'outdoors' },
  { id: 'camping', label: 'Camping', emoji: '⛺', category: 'outdoors' },
  { id: 'backpacking', label: 'Backpacking', emoji: '🎒', category: 'outdoors' },
  { id: 'fishing', label: 'Fishing', emoji: '🎣', category: 'outdoors' },
  { id: 'kayaking', label: 'Kayaking', emoji: '🛶', category: 'outdoors' },
  { id: 'beach', label: 'The lake', emoji: '🏖️', category: 'outdoors' },
  { id: 'stargazing', label: 'Stargazing', emoji: '🌌', category: 'outdoors' },
  { id: 'gardening', label: 'Gardening', emoji: '🌱', category: 'outdoors' },
  { id: 'national-parks', label: 'National parks', emoji: '🏞️', category: 'outdoors' },

  // ── food & drink ───────────────────────────────────────────────────────
  { id: 'coffee', label: 'Coffee', emoji: '☕', category: 'food' },
  { id: 'tea', label: 'Tea', emoji: '🍵', category: 'food' },
  { id: 'boba', label: 'Boba', emoji: '🧋', category: 'food' },
  { id: 'cooking', label: 'Cooking', emoji: '🍳', category: 'food' },
  { id: 'baking', label: 'Baking', emoji: '🧁', category: 'food' },
  { id: 'brunch', label: 'Brunch', emoji: '🥞', category: 'food' },
  { id: 'foodie', label: 'Trying new places', emoji: '🍜', category: 'food' },
  { id: 'bbq', label: 'BBQ', emoji: '🍖', category: 'food' },
  { id: 'sushi', label: 'Sushi', emoji: '🍣', category: 'food' },
  { id: 'spicy-food', label: 'Spicy food', emoji: '🌶️', category: 'food' },
  { id: 'dessert', label: 'Dessert first', emoji: '🍨', category: 'food' },
  { id: 'craft-beer', label: 'Craft beer', emoji: '🍺', category: 'food' },
  { id: 'wine', label: 'Wine', emoji: '🍷', category: 'food' },
  { id: 'cocktails', label: 'Cocktails', emoji: '🍸', category: 'food' },
  { id: 'farmers-market', label: 'Farmers market', emoji: '🥕', category: 'food' },

  // ── making things ──────────────────────────────────────────────────────
  { id: 'art', label: 'Art', emoji: '🎨', category: 'making' },
  { id: 'drawing', label: 'Drawing', emoji: '✏️', category: 'making' },
  { id: 'painting', label: 'Painting', emoji: '🖌️', category: 'making' },
  { id: 'photography', label: 'Photography', emoji: '📷', category: 'making' },
  { id: 'filmmaking', label: 'Filmmaking', emoji: '🎥', category: 'making' },
  { id: 'writing', label: 'Writing', emoji: '✍️', category: 'making' },
  { id: 'poetry', label: 'Poetry', emoji: '📝', category: 'making' },
  { id: 'crafts', label: 'Crafts', emoji: '🧶', category: 'making' },
  { id: 'ceramics', label: 'Ceramics', emoji: '🏺', category: 'making' },
  { id: 'woodworking', label: 'Woodworking', emoji: '🪵', category: 'making' },
  { id: 'design', label: 'Design', emoji: '🖍️', category: 'making' },
  { id: 'fashion', label: 'Fashion', emoji: '👗', category: 'making' },
  { id: 'diy', label: 'Fixing things', emoji: '🔧', category: 'making' },

  // ── watching & reading ─────────────────────────────────────────────────
  { id: 'movies', label: 'Movies', emoji: '🎬', category: 'screens' },
  { id: 'tv', label: 'TV shows', emoji: '📺', category: 'screens' },
  { id: 'horror', label: 'Horror', emoji: '👻', category: 'screens' },
  { id: 'rom-coms', label: 'Rom-coms', emoji: '💘', category: 'screens' },
  { id: 'documentaries', label: 'Documentaries', emoji: '🎞️', category: 'screens' },
  { id: 'anime', label: 'Anime', emoji: '🍥', category: 'screens' },
  { id: 'reading', label: 'Reading', emoji: '📚', category: 'screens' },
  { id: 'true-crime', label: 'True crime', emoji: '🔍', category: 'screens' },
  { id: 'podcasts', label: 'Podcasts', emoji: '🎧', category: 'screens' },
  { id: 'comics', label: 'Comics', emoji: '💥', category: 'screens' },
  { id: 'theater', label: 'Theater', emoji: '🎭', category: 'screens' },

  // ── games ──────────────────────────────────────────────────────────────
  { id: 'gaming', label: 'Gaming', emoji: '🎮', category: 'games' },
  { id: 'board-games', label: 'Board games', emoji: '🎲', category: 'games' },
  { id: 'chess', label: 'Chess', emoji: '♟️', category: 'games' },
  { id: 'dnd', label: 'D&D', emoji: '🐉', category: 'games' },
  { id: 'trivia', label: 'Trivia nights', emoji: '❓', category: 'games' },
  { id: 'poker', label: 'Poker', emoji: '🃏', category: 'games' },
  { id: 'arcade', label: 'Arcades', emoji: '🕹️', category: 'games' },
  { id: 'puzzles', label: 'Puzzles', emoji: '🧩', category: 'games' },

  // ── going out ──────────────────────────────────────────────────────────
  { id: 'clubbing', label: 'Clubbing', emoji: '🪩', category: 'going-out' },
  { id: 'bars', label: 'Bars', emoji: '🍻', category: 'going-out' },
  { id: 'house-parties', label: 'House parties', emoji: '🏠', category: 'going-out' },
  { id: 'comedy', label: 'Comedy shows', emoji: '🎙️', category: 'going-out' },
  { id: 'museums', label: 'Museums', emoji: '🖼️', category: 'going-out' },
  { id: 'thrifting', label: 'Thrifting', emoji: '🧥', category: 'going-out' },
  { id: 'road-trips', label: 'Road trips', emoji: '🛣️', category: 'going-out' },

  // ── quiet things ───────────────────────────────────────────────────────
  { id: 'long-walks', label: 'Long walks', emoji: '🚶', category: 'quiet' },
  { id: 'journaling', label: 'Journaling', emoji: '📔', category: 'quiet' },
  { id: 'plants', label: 'Plants', emoji: '🪴', category: 'quiet' },
  { id: 'meditation', label: 'Meditation', emoji: '🧘‍♀️', category: 'quiet' },

  // ── campus life ────────────────────────────────────────────────────────
  { id: 'volunteering', label: 'Volunteering', emoji: '🤝', category: 'campus' },
  { id: 'greek-life', label: 'Greek life', emoji: '🏛️', category: 'campus' },
  { id: 'research', label: 'Research', emoji: '🔬', category: 'campus' },
  { id: 'startups', label: 'Startups', emoji: '🚀', category: 'campus' },
  { id: 'debate', label: 'Debate', emoji: '🗣️', category: 'campus' },
  { id: 'tutoring', label: 'Tutoring', emoji: '📐', category: 'campus' },
  { id: 'club-sports', label: 'Club sports', emoji: '🥅', category: 'campus' },
  { id: 'student-media', label: 'Student media', emoji: '📰', category: 'campus' },

  // ── out in the world ───────────────────────────────────────────────────
  { id: 'travel', label: 'Travel', emoji: '✈️', category: 'world' },
  { id: 'study-abroad', label: 'Study abroad', emoji: '🌍', category: 'world' },
  { id: 'languages', label: 'Languages', emoji: '🗺️', category: 'world' },
  { id: 'history', label: 'History', emoji: '🏺', category: 'world' },
  { id: 'cars', label: 'Cars', emoji: '🚗', category: 'world' },
  { id: 'motorcycles', label: 'Motorcycles', emoji: '🏍️', category: 'world' },

  // ── animals ────────────────────────────────────────────────────────────
  { id: 'dogs', label: 'Dogs', emoji: '🐕', category: 'animals' },
  { id: 'cats', label: 'Cats', emoji: '🐈', category: 'animals' },
  { id: 'horses', label: 'Horses', emoji: '🐎', category: 'animals' },
]

export const interestById = (id) => INTERESTS.find((i) => i.id === id)
export const interestLabel = (id) => interestById(id)?.label ?? id
export const interestCategory = (id) => interestById(id)?.category ?? null
export const interestCategoryLabel = (id) =>
  INTEREST_CATEGORIES.find((c) => c.id === id)?.label ?? id

/** Interests grouped for the picker, in catalogue order. */
export const INTERESTS_BY_CATEGORY = INTEREST_CATEGORIES.map((c) => ({
  ...c,
  items: INTERESTS.filter((i) => i.category === c.id),
}))

/**
 * ── The compatibility survey ────────────────────────────────────────────────
 *
 * Two halves, both optional, both worth answering.
 *
 * `IDEAL_DATES` is the question that does double duty: it says something real
 * about a person *and* it is the only thing that lets Loose Leaf suggest a
 * place a specific couple would actually both enjoy. `spot` is the
 * `date_spots.date_types` token it corresponds to — the vocabulary businesses
 * describe themselves in — so "a long walk" can find a park without anybody
 * having to type the word "outdoors".
 */
export const IDEAL_DATES = [
  { id: 'coffee', label: 'Coffee', emoji: '☕', spot: 'coffee' },
  { id: 'dinner', label: 'Dinner', emoji: '🍽', spot: 'dinner' },
  { id: 'brunch', label: 'Brunch', emoji: '🥞', spot: 'brunch' },
  { id: 'drinks', label: 'Drinks', emoji: '🍻', spot: 'drinks' },
  { id: 'dessert', label: 'Dessert', emoji: '🍨', spot: 'dessert' },
  { id: 'walk', label: 'A long walk', emoji: '🚶', spot: 'outdoors' },
  { id: 'outdoors', label: 'Something outdoors', emoji: '🌳', spot: 'outdoors' },
  { id: 'activity', label: 'Something to do', emoji: '🎯', spot: 'activity' },
  { id: 'fun', label: 'Something a bit silly', emoji: '🎳', spot: 'fun' },
  { id: 'movie', label: 'A movie', emoji: '🎬', spot: 'movie' },
  { id: 'live', label: 'Live music or a show', emoji: '🎶', spot: 'live-music' },
  { id: 'games', label: 'Games', emoji: '🎲', spot: 'games' },
  { id: 'study', label: 'Studying together', emoji: '📚', spot: 'study' },
  { id: 'late-night', label: 'Late night food', emoji: '🌙', spot: 'late-night' },
]

export const idealDateById = (id) => IDEAL_DATES.find((d) => d.id === id)
export const idealDateLabel = (id) => idealDateById(id)?.label ?? id
/** The `date_spots.date_types` tokens a set of ideal-date answers points at. */
export const idealDateSpotTypes = (ids = []) =>
  Array.from(new Set(ids.map((id) => idealDateById(id)?.spot).filter(Boolean)))

export const DATE_BUDGETS = [
  { id: 1, label: 'Cheap and cheerful', detail: 'Coffee, a walk, something free' },
  { id: 2, label: 'Normal student money', detail: 'A meal out without thinking about it' },
  { id: 3, label: 'Happy to spend', detail: 'A proper dinner is fine' },
  { id: 4, label: 'Doesn’t matter', detail: 'Money isn’t the deciding factor' },
]

export const DRINKS_ON_DATES = [
  { id: 'never', label: 'No thanks' },
  { id: 'sometimes', label: 'Sometimes' },
  { id: 'happy-to', label: 'Sure' },
]

/**
 * Six either/ors, each with a middle. The middle matters: it is honest for a
 * lot of people, and it scores as *compatible with both ends* rather than as a
 * shrug — a night owl and somebody who says "either" are not a mismatch.
 *
 * Every end token is unique across the whole survey and the middle is always
 * `either`, which is what lets the SQL score all six through one tiny
 * position function instead of six CASE blocks. Do not reuse an end token.
 */
export const SURVEY = [
  {
    id: 'going_out',
    question: 'A good week has…',
    options: [
      { id: 'homebody', label: 'One good night in' },
      { id: 'either', label: 'A bit of both' },
      { id: 'out-out', label: 'Something on most nights' },
    ],
  },
  {
    id: 'chronotype',
    question: 'You’re at your best…',
    options: [
      { id: 'early', label: 'First thing' },
      { id: 'either', label: 'Either' },
      { id: 'night', label: 'Late at night' },
    ],
  },
  {
    id: 'planning',
    question: 'Plans get…',
    options: [
      { id: 'planner', label: 'Made in advance' },
      { id: 'either', label: 'A bit of both' },
      { id: 'spontaneous', label: 'Decided that day' },
    ],
  },
  {
    id: 'group_size',
    question: 'You’d rather be…',
    options: [
      { id: 'one-on-one', label: 'One-on-one' },
      { id: 'either', label: 'Either' },
      { id: 'big-group', label: 'In the big group' },
    ],
  },
  {
    id: 'texting',
    question: 'Between seeing each other…',
    options: [
      { id: 'texter', label: 'Texting all day' },
      { id: 'either', label: 'Here and there' },
      { id: 'in-person', label: 'Save it for in person' },
    ],
  },
  {
    id: 'conversation',
    question: 'A first date should…',
    options: [
      { id: 'deep', label: 'Get real quickly' },
      { id: 'either', label: 'Go either way' },
      { id: 'light', label: 'Stay light and funny' },
    ],
  },
]

export const surveyQuestion = (id) => SURVEY.find((q) => q.id === id)
export const surveyAnswerLabel = (questionId, answerId) =>
  surveyQuestion(questionId)?.options.find((o) => o.id === answerId)?.label ?? answerId

export const PROMPT_CATEGORIES = [
  {
    id: 'about',
    label: 'About me',
    prompts: [
      "I'm weirdly competitive about...",
      'The way to my heart is...',
      "A fact about me that surprises people...",
      "I spend way too much money on...",
      'My simple pleasures are...',
      "You'd never guess that I...",
    ],
  },
  {
    id: 'dating',
    label: 'Dating',
    prompts: [
      'My ideal first date is...',
      "I'll fall for you if...",
      'The fastest way to get my attention is...',
      "We'll get along if...",
      "Green flags I look for...",
      "Dating me is like...",
    ],
  },
  {
    id: 'campus',
    label: 'Campus',
    prompts: [
      "After class you'll usually find me...",
      'My campus hot take is...',
      'The best study spot nobody talks about...',
      'My major in one honest sentence...',
      "Best thing I've done at Michigan so far...",
      "The class that changed how I think...",
    ],
  },
  {
    id: 'opinions',
    label: 'Unpopular opinions',
    prompts: [
      'My most irrational opinion is...',
      "The hill I'll die on is...",
      "Something everyone likes that I don't get...",
      "I will always defend...",
    ],
  },
  {
    id: 'random',
    label: 'Random',
    prompts: [
      'A perfect Saturday looks like...',
      'My perfect Sunday...',
      "The last thing that made me laugh out loud...",
      'Two truths and a lie...',
      'My most-used emoji says a lot about me because...',
    ],
  },
  {
    id: 'plans',
    label: "Let's actually do something",
    prompts: [
      'We should absolutely...',
      "Take me to..., I've never been",
      "I'm always down for...",
      "Let's debate this over coffee:",
      'Say yes to this and I am yours:',
    ],
  },
]

export const ALL_PROMPTS = PROMPT_CATEGORIES.flatMap((c) =>
  c.prompts.map((p) => ({ text: p, category: c.id }))
)

export const UNIVERSITY = {
  id: 'umich',
  name: 'University of Michigan',
  short: 'Michigan',
  city: 'Ann Arbor, MI',
  domains: ['umich.edu'],
  activeStudents: 2418,
  areas: ['Central Campus', 'North Campus', 'Off Campus', 'Medical Campus'],
}

/*
 *  DATE_SPOTS and SPONSORED_OFFERS used to live here: eight real Ann Arbor
 *  businesses, one of them carrying an invented "two coffees for $5". Nothing
 *  imported either of them — the demo campus has its own cast in
 *  services/demoDates.js and the live one reads the database — so they were a
 *  fixture with no screen behind it and a false claim about a real
 *  restaurant's prices sitting in the repo. Removed 2026-08-28. If a fixture
 *  is ever needed here again, invent the business.
 */

export const CAMPUS_EVENTS = [
  {
    id: 'wisconsin',
    title: 'Michigan vs Wisconsin',
    when: 'Saturday · 3:30 PM',
    where: 'Michigan Stadium',
    kind: 'Football',
    interested: 214,
    emoji: '🏈',
  },
  {
    id: 'kerrytown',
    title: 'Kerrytown night market',
    when: 'Thursday · 6 PM',
    where: 'Kerrytown',
    kind: 'Around town',
    interested: 88,
    emoji: '🏮',
  },
  {
    id: 'showcase',
    title: 'Student film showcase',
    when: 'Friday · 8 PM',
    where: 'State Theatre',
    kind: 'Arts',
    interested: 46,
    emoji: '🎬',
  },
  {
    id: 'hockey',
    title: 'Hockey vs Michigan State',
    when: 'Next Friday · 7 PM',
    where: 'Yost Ice Arena',
    kind: 'Hockey',
    interested: 173,
    emoji: '🏒',
  },
]

export const TONIGHT_MOODS = [
  { id: 'date', emoji: '🌙', label: 'Looking for a date' },
  { id: 'plans', emoji: '📍', label: 'Open to plans' },
  { id: 'out', emoji: '🎶', label: 'Going out' },
  { id: 'casual', emoji: '🍿', label: 'Something casual' },
  { id: 'around', emoji: '👀', label: 'Just seeing who’s around' },
]

export const DATE_TYPES = [
  { id: 'coffee', emoji: '☕', label: 'Coffee' },
  { id: 'food', emoji: '🍕', label: 'Food' },
  { id: 'drinks', emoji: '🍻', label: 'Drinks' },
  { id: 'fun', emoji: '🎳', label: 'Something fun' },
  { id: 'study', emoji: '📚', label: 'Study date' },
  { id: 'event', emoji: '🎉', label: 'Campus event' },
]
