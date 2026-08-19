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

export const INTERESTS = [
  { id: 'live-music', label: 'Live music', emoji: '🎶' },
  { id: 'football', label: 'Football', emoji: '🏈' },
  { id: 'basketball', label: 'Basketball', emoji: '🏀' },
  { id: 'hockey', label: 'Hockey', emoji: '🏒' },
  { id: 'running', label: 'Running', emoji: '🏃' },
  { id: 'gym', label: 'Gym', emoji: '🏋️' },
  { id: 'skiing', label: 'Skiing', emoji: '🎿' },
  { id: 'travel', label: 'Travel', emoji: '✈️' },
  { id: 'photography', label: 'Photography', emoji: '📷' },
  { id: 'cooking', label: 'Cooking', emoji: '🍳' },
  { id: 'coffee', label: 'Coffee', emoji: '☕' },
  { id: 'concerts', label: 'Concerts', emoji: '🎤' },
  { id: 'cars', label: 'Cars', emoji: '🚗' },
  { id: 'motorcycles', label: 'Motorcycles', emoji: '🏍️' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮' },
  { id: 'art', label: 'Art', emoji: '🎨' },
  { id: 'movies', label: 'Movies', emoji: '🎬' },
  { id: 'reading', label: 'Reading', emoji: '📚' },
  { id: 'thrifting', label: 'Thrifting', emoji: '🧥' },
  { id: 'clubbing', label: 'Clubbing', emoji: '🪩' },
  { id: 'hiking', label: 'Hiking', emoji: '🥾' },
  { id: 'pickleball', label: 'Pickleball', emoji: '🥒' },
  { id: 'golf', label: 'Golf', emoji: '⛳' },
  { id: 'baking', label: 'Baking', emoji: '🧁' },
  { id: 'dogs', label: 'Dogs', emoji: '🐕' },
  { id: 'volunteering', label: 'Volunteering', emoji: '🤝' },
  { id: 'theater', label: 'Theater', emoji: '🎭' },
  { id: 'climbing', label: 'Climbing', emoji: '🧗' },
]

export const interestById = (id) => INTERESTS.find((i) => i.id === id)
export const interestLabel = (id) => interestById(id)?.label ?? id

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

export const DATE_SPOTS = [
  {
    id: 'vertex',
    name: 'Vertex Coffee',
    kind: 'Coffee',
    tags: ['Quiet', '$'],
    walk: '8 minute walk',
    note: 'Good for a first date',
    sponsored: false,
  },
  {
    id: 'roos',
    name: "Roos Roast",
    kind: 'Coffee',
    tags: ['Bright', '$'],
    walk: '11 minute walk',
    note: 'Big tables, easy to talk',
    sponsored: false,
  },
  {
    id: 'sava',
    name: "Sava's",
    kind: 'Food',
    tags: ['Lively', '$$'],
    walk: '6 minute walk',
    note: 'Never a bad brunch',
    sponsored: false,
  },
  {
    id: 'blank',
    name: 'Blank Slate Creamery',
    kind: 'Something fun',
    tags: ['Casual', '$'],
    walk: '14 minute walk',
    note: 'Low stakes, high reward',
    sponsored: false,
  },
  {
    id: 'arb',
    name: 'Nichols Arboretum',
    kind: 'Something fun',
    tags: ['Outdoors', 'Free'],
    walk: '15 minute walk',
    note: 'Best in the fall',
    sponsored: false,
  },
  {
    id: 'ugli',
    name: 'Shapiro Library, 3rd floor',
    kind: 'Study date',
    tags: ['Quiet', 'Free'],
    walk: '4 minute walk',
    note: 'Actually get work done. Allegedly.',
    sponsored: false,
  },
  {
    id: 'ashley',
    name: "Ashley's",
    kind: 'Drinks',
    tags: ['Classic', '$$'],
    walk: '7 minute walk',
    note: 'Two hundred beers, one decision',
    sponsored: false,
  },
  {
    id: 'pinball',
    name: 'Pinball Pete\'s',
    kind: 'Something fun',
    tags: ['Loud', '$'],
    walk: '5 minute walk',
    note: 'Nothing kills a silence like air hockey',
    sponsored: false,
  },
]

/** Sponsored offers are a separate list and are never mixed into ranking. */
export const SPONSORED_OFFERS = [
  {
    id: 'vertex-offer',
    spot: 'Vertex Coffee',
    emoji: '☕',
    headline: 'First-date special',
    detail: 'Two coffees for $5',
    distance: '0.4 miles away',
    sponsor: 'Vertex Coffee',
  },
]

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
