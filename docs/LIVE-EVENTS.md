# Live Events

*Planned and built 2026-09-02. M0–M2 are in the tree; M3–M4 are not.*

> ### Amended 2026-09-03, after a real host looked at it
>
> Two things changed, both because somebody who would actually run one of
> these said so:
>
> **1. There is no login at the door.** A name, and nothing else. The
> verified-email step was solving a problem the room already solves — the QR
> is printed on paper and taped inside a building on campus, so the set of
> people who can scan it is the set of people standing there. Identity is now
> a token minted server-side and kept in that browser. Everything about the
> door, the OTP rate-limit risk, and pre-registration below is **superseded**:
> the only person who still signs in is the host. Somebody who wants a
> Looseleaf profile afterwards claims their night from the same browser
> (`claim_event_participation`).
>
> **2. There is a second format: stations.** "Meet the members" was built as
> speed dating with different words on it, and that is not how a club runs a
> rush night. There are tables, a member sits at each one, and everybody else
> rotates around them — and that member is staff for the night, usually not
> signed up at all. So a station is a row the host types: a label, a name, an
> optional line. Everyone is spread across the tables each round and
> **nobody ever sits out**. `live_events.format` is `pairs` or `stations`.
>
> One honest limit found while testing the pairs engine: a room running its
> round-robin to *completion* comes out perfect about nine times in ten; the
> rest end with one or two pairs re-meeting in the final round. That is the
> price of choosing each round without knowing what the later ones need, which
> is the same property that lets somebody arrive at round three. Real events
> do not run to completion.
>
> **Status.** Everything below describes the design. What exists now:
> `supabase/migrations/20260902120000_live_events.sql` (schema, RLS, the
> pairing engine, every RPC), `tests/live_events_test.sql` (**110 assertions**,
> all passing against local Postgres 16), the participant flow at `/e`, the
> host console at `/host`, the print kit, and the Backstage queue at
> `/app/backstage/live`.
>
> **Not done, and both matter:** the M0 rate-limit load test has never been run
> against the real project, and nothing here has touched a real iPhone. See
> Risks.
>
> Two things changed during the build, both because the first version was
> wrong:
>
> * **Bye fairness is a hard constraint, not a scoring preference.** Ordering
>   the greedy by bye count makes a fair round *likely*; seven people over
>   seven rounds proved that "likely" isn't good enough, and somebody sat out
>   twice before somebody else sat out once. The bye is now chosen up front
>   from whoever has had the fewest, so `max - min <= 1` holds by construction.
> * **The vote card's Yes and No are the same weight.** The first version made
>   Yes a filled button beside an outlined No — the standard pairing, and
>   exactly wrong in a room where the polite answer is already yes.

A Looseleaf **live event** is a timed, rotating, in-person session: people arrive,
scan a QR code on the door, and their phone tells them where to sit, who they're
sitting with, and how long they have. A bell they can feel. Then it moves them.

The format is speed dating. What the room is *for* is the host's business — a
club matching people up, a professional fraternity letting rushes meet actives,
a dorm floor mixer. That distinction runs through this whole document: the
**mechanics are fixed** (rounds, stations, a timer, a rotation nobody has to
think about), and the **purpose is configured** (what you're asked at the door,
whether anyone gets to say "yes, again", whether anything is revealed at the end).

## Why we're building it

Looseleaf has a cold-start problem shaped exactly like a campus: nothing works
until fifty people on one campus have signed up, and nothing makes fifty people
sign up. A live event is the only marketing move that puts the app in forty
hands in one room in one hour, with a reason to open it that isn't "try our
dating app."

So the success measure is not "events hosted." It is: **how many people walked
out of a room with Looseleaf on their phone and a reason to open it tomorrow.**
Every design decision below that looks like a compromise is that measure winning.

---

## The four decisions that shaped this

Settled 2026-09-02.

**1. A host signs in as themselves, not as a business.** The choice still lives
on the Partners page where you asked for it — a third card next to "I own it" and
"I manage it" — but picking it routes to a `.edu` sign-in and a host console
outside `/partners`. This preserves the partner platform's founding invariant
(`partner_users` is never a `profiles` row, so every member policy fails closed
for a business *by construction*) without a single exception. A business hosting
a speed dating night is a later, small addition on the same tables, not a
different system.

**2. Joining an event does not require a dating profile.** It requires a
verified campus email and a name. Revised 2026-09-02 after the first draft
proposed anonymous accounts: participants sign in with the same `.edu` OTP flow
everyone else uses, so that when they decide to build a profile later they log
back in with the email they already used and pick up everything from the event.
A verified account and a dating profile are two different things, and only the
first is required at the door — see the next section.

**3. Liking and matching are an optional module.** The host switches them on.
A club running "meet the actives" turns them off and the app is a rotation timer
with a private notes field. A speed dating night turns them on and the reveal is
the finale.

**4. Staff approve each event before it runs.** `draft → pending → approved`,
plus a kill switch on a running one. Five seconds of your time per event while
you're recruiting hosts personally, and it means nobody runs "a Looseleaf event"
you've never heard of.

---

## The reframe: a verified account is not a profile

Everything else follows from this one distinction.

A person at a speed dating event has ninety seconds between scanning the poster
and the first bell. They will not build a dating profile. They may not want one.
A rush at a professional fraternity mixer definitely doesn't want one. If joining
an event means signing up for a dating app, most of the room doesn't join, and the
event — the whole point of which was reaching people who aren't members — reaches
only members.

But an event participant is not a stranger either. They are a **verified `.edu`
account with a name on it and no dating profile.**

- They sign in with the **same email OTP flow everyone else uses**: campus email,
  six-digit code, in. Same `sendCode` path, same Before User Created domain hook,
  same campus gating. Nothing new in the auth layer.
- They get a real `auth.users` row. They do **not** get a `profiles` row. Not a
  Looseleaf member, not on any campus roster, not in anybody's deck.
- Building a profile afterwards is not a migration or an upgrade — it is
  **logging back in with the email they already used** and finally answering the
  onboarding questions. Same user id, so the matches and the people they met
  come with them for free.
- If they scan while already signed in as a Looseleaf student, none of this
  happens: their name is prefilled and joining is one tap.

This is a better trade than the anonymous-account version that was in the first
draft of this document, and it kills that draft's single biggest risk (an
anonymous user has no email, and the domain hook demands one). It costs a slower
door, which the pre-registration section below is designed to buy back.

Three consequences worth naming before they surprise us:

**The mutual-yes lock is the conversion engine.** Two participants who both said
yes have a match and no way to talk — a `conversations` row hangs off `matches`,
which hangs off `profiles`, and neither of them has one. The reveal screen says
so plainly: *"You and Sam both said yes. Finish your profile to say hi — you're
already signed in."* Nobody is tricked; they genuinely need a profile to have a
conversation, and they want one at precisely the moment they're told. And because
they are already authenticated, the ask is "answer six questions", not "make an
account". If both already have profiles, the match writes a real `matches` +
`conversations` row and the thread is open before they leave the room.

**We can email them afterwards, and that is a privilege to spend carefully.** One
recap the next morning — *"You met 9 people at Sigma's speed dating. 3 of them
said yes."* — is a genuinely good message and probably the single highest-
converting thing in this plan. Two is spam. Hard cap: one recap per event, plus
whatever they opt into by making a profile.

**Orientation-aware pairing goes away as a built-in and comes back better.** We
still can't pair by `gender` + `interested_in`, because a participant with no
profile has neither. Instead the host adds a field — *"I'd like to meet…"* — and
marks it as the **split field**. That handles a straight event, a queer event,
and a "rushes meet actives" event with one mechanism instead of three special
cases.

### The host never gets the email list

Clubs will ask. The answer is no, and it should be no in the RPC rather than in a
policy document, because a Looseleaf event that quietly harvests forty campus
email addresses for a fraternity's mailing list is the kind of thing that gets
written up in the student paper.

A host can send **one message to the room through the app** (it arrives in the
event screen, and in the recap email as a line from the host). They never see an
address. This is the same shape as the partner platform's "attribution, not
dating data" rule and it should be tested the same way.

---

## Identity model

Three kinds of account can be in this system, and they stay separate:

| | is | may also be | never |
|---|---|---|---|
| **Participant** | `auth.users`, verified `.edu`, no profile | a Looseleaf member | a partner |
| **Host** | `auth.users`, verified `.edu` + `event_hosts` | a Looseleaf member | a partner *(for now)* |
| **Business host** *(phase 4)* | `partner_users` | — | a member |

Participant and host are the same kind of account with a different row attached.
Neither requires a `profiles` row, and the existing `partner_users` ⇄ `profiles`
exclusion trigger is untouched by all of this.

A **host** is `event_hosts(user_id)` — verified `.edu`, a name, an org name. It
is deliberately *not* `profiles`: a club president shouldn't have to build a dating
profile to run a rush event. If they happen to have one, it's the same login and
the same sign-in code path; the host console just doesn't care.

One function answers every permission question: `event_host_can(p_event)` — true
for the event's host, its co-hosts, and staff. Modelled on `partner_can()`, which
has already earned its keep.

---

## Schema

New tables, all prefixed `live_event_` to stay clear of the existing
`campus_events`, `event_interest` and `partner_events`.

```
event_hosts
  user_id        uuid pk → auth.users
  email          text            -- .edu, verified
  full_name      text
  org_name       text            -- "Sigma Chi", "Michigan Marketing Club"
  status         host_status     -- pending | approved | suspended
  created_at

live_events
  id             uuid pk
  code           text unique     -- 6 chars, Crockford base32, no I/O/L/U
  host_id        uuid → event_hosts
  host_partner_id uuid null → partners      -- phase 4; exactly one of the two
  title          text
  blurb          text
  venue_label    text            -- "Michigan Union, Room 3". A label, never a location.
  starts_at      timestamptz
  status         event_status    -- draft|pending|approved|running|paused|ended|killed
  -- format
  round_seconds       int  default 240
  break_seconds       int  default 30
  planned_rounds      int  null   -- null = until everyone has met
  advance             text default 'auto'   -- auto | manual
  split_field_id      uuid null → live_event_fields
  pairing_mode        text default 'mixer'  -- mixer | across | avoid_same
  station_count       int null
  -- modules
  likes_enabled       bool default true
  reveal              text default 'end'    -- end | live | never
  notes_enabled       bool default true
  -- door
  join_opens          text default 'anytime'  -- anytime | until_start | host_admits
  -- branding
  logo_path      text
  accent         text            -- from a validated palette, not free hex
  welcome_line   text
  created_at, updated_at

live_event_fields                 -- the host's door questions
  id, event_id, position
  label          text
  kind           text            -- short_text | choice | multi_choice | number | yes_no
  options        text[]
  required       bool
  use_for_pairing bool
  show_to_partner bool default false

live_event_participants
  id             uuid pk
  event_id       uuid → live_events
  user_id        uuid → auth.users        -- always a verified .edu account
  profile_id     uuid null → profiles     -- set when they're already a member,
                                          -- backfilled if they build one later
  display_name   text
  badge_no       int                      -- 1..n, printed on their screen
  state          text                     -- waiting | active | left | removed
  joined_at, left_at
  unique (event_id, user_id)

live_event_answers
  participant_id, field_id, value text[]   -- pk (participant_id, field_id)

live_event_rounds
  id, event_id, index int
  starts_at, ends_at timestamptz
  unique (event_id, index)

live_event_pairings
  id, round_id
  a_participant, b_participant  -- a < b
  station int
  bye     bool                  -- b is null when true
  unique (round_id, a_participant), unique (round_id, b_participant)

live_event_votes
  pairing_id, voter_participant, yes bool, note text
  pk (pairing_id, voter_participant)

live_event_matches
  event_id, a_participant, b_participant, created_at
  match_id uuid null → matches   -- set when both sides have real profiles
```

RLS shape, in one line each:

- A participant reads **their own** participant row, **their own** answers,
  **their own** pairings, and **their own** votes. Nothing else. There is no
  query that returns the roster.
- What they see *of the person across the table* comes from
  `event_current(p_code)`, a security-definer function that returns a display
  name plus only the fields marked `show_to_partner` — never a table read.
- A host reads aggregate counts and the schedule. **A host never reads a vote.**
- Staff read everything, as everywhere else.

---

## The pairing engine

This is the part that has to be right, because a rotation that visibly repeats a
pair or strands someone alone is the thing everyone in the room notices.

### Generate one round at a time, not the whole schedule

The obvious implementation precomputes the full round-robin at Start. It breaks
immediately, because the roster is never stable: people arrive at round three,
leave after round five, and two friends who came together want to not be paired.
A precomputed schedule handles none of that.

So: **the next round is computed from the current roster and the set of pairs
who have already met.** The host still sees a projected full schedule (people
want to know how long this takes), but only the next round is committed. Late
arrivals, walkouts and bathroom breaks are then free rather than special cases.

### The algorithm

Per round, over the active participants:

- Build the graph. Exclude edges where the pair has already met; where
  `pairing_mode = 'across'` and both give the same answer on the split field;
  where `pairing_mode = 'avoid_same'` and both give the same answer *and* an
  unmet cross-answer partner is available.
- Weight edges: strongly prefer people who took the last bye; mildly prefer
  pairs where one of them is already at a station (so half the room stays put,
  the way a classic two-sided event works); random tiebreak from a seed stored
  on the event so a regeneration is reproducible.
- Randomized greedy matching with ~50 restarts, keep the best. At N ≤ 80 this
  is microseconds and it beats the circle method on every constraint we
  actually have. Blossom is not worth writing.
- Odd count → exactly one bye, and never the same person twice until everyone
  has had one. The bye screen says *"Sit this one out — grab a drink. You're
  back at Table 4 in 4:00."* Research is unanimous that a bye handled well is a
  non-event and a bye handled badly is the thing someone remembers.
- Assign stations, keeping one member of each pair where they were.

Runs in **plpgsql**, not the client, so no phone can forge a pairing.

### Rounds needed

Everyone meets everyone in N−1 rounds (N even) or N rounds with byes (N odd).
At 5 minutes a round that is 100 minutes for a room of 20, which is longer than
almost any club will run. So `planned_rounds` caps it, the host picks a number,
and the engine maximizes coverage within that budget. The host console says the
honest thing up front: **"12 rounds × 4 min = 54 minutes. Everyone meets 12 of
the other 19."**

---

## Timing, and why it isn't push-based

Forty phones on campus wifi in a basement is exactly where a pure realtime design
dies, and it dies invisibly — one person's phone stays on round 3 and they sit
down at the wrong table.

**The round schedule is data, not an event.** Each `live_event_rounds` row carries
`starts_at` and `ends_at`. Every client computes what round it is and how much
time is left from the server clock, not from a countdown started on page load. A
phone that loses signal for ninety seconds and comes back is instantly correct,
with no reconciliation.

Realtime is then an accelerator, not a dependency: a Supabase subscription on the
event row and on round inserts makes the transition feel instant; a 3-second poll
is the floor when the socket is down. Clock skew is handled by taking the server
time from the same response that carries the schedule and holding the offset.

Transitions have to be **loud**, because the host should not be shouting: the
whole screen changes color, `navigator.vibrate()` fires, an optional sound plays,
and the next station number is the biggest thing on the display. The 30-second
break is a screen of its own — *"Time. Head to Table 7."*

---

## What the host does

Console at `/host`, outside `/app` (a host may have no dating profile, and `/app`
requires one).

**Create** — title, org, venue label, date/time, blurb. Saves as a draft.

**Format** — round length, break length, how many rounds, auto or manual advance,
station count. A live preview does the arithmetic out loud: *"With 24 people,
12 rounds of 4 minutes runs 54 minutes and everyone meets half the room."*

**Door questions** — up to six fields, from five types. Two switches per field
that matter: *use this to pair people* and *show this answer to the person across
the table*. Both default off. The speed dating preset ships with one field —
"I'd like to meet" — already set as the split.

**Modules** — likes on/off; reveal at the end, live, or never; private notes
on/off. Presets do the thinking for a first-time host: **Speed dating** (likes on,
reveal at end, split by who you want to meet), **Meet the members** (likes off,
notes on, pair across members/newcomers), **Mixer** (likes on, reveal live,
everyone meets everyone).

**Brand** — logo, an accent color from a validated palette, a welcome line. Not
free-form CSS. Looseleaf's mark stays on every screen, secondary but present —
that's the deal, and it's the whole reason this exists.

**Submit for approval** → shows up in Backstage.

**Print kit** — see below.

**Run** — the console during the event: a live headcount, big Start / Pause /
Next Round / End controls, the current round and clock mirrored large enough to
project, a list of who has a bye, and *"3 people just arrived — add them to the
next round?"* Removing a disruptive participant is one tap and takes effect at
the next round.

**Recap** — attendance, rounds run, conversations held, and, if likes were on,
*how many* mutual yeses. **Never who.** A host learning that Priya said yes to
Devon is the failure mode that would end this feature, and it's prevented in the
RPC, not in the UI.

---

## What a participant does

One route, `/e/:code`, as a state machine. No navigation, no tabs, one thing on
screen at a time.

1. **Scan.** The printed QR encodes `hellolooseleaf.com/e/K7M2QX`. The phone's own
   camera app opens it — nobody opens a website in order to open a camera. The
   in-app scanner is the *fallback*, not the path.
2. **Join.** The host's branding, the event name, and then whichever of these
   they actually need:
   - *Already signed in* (a member, or anyone who pre-registered, or anyone who
     came to a previous event on the same phone) — name prefilled, one tap.
   - *Not signed in* — campus email, six-digit code, name, the host's door
     questions. Three screens, and the copy says why: *"Your school email, so you
     can get back in later. We never show it to anyone."*

   Then a badge number and *"You're in. 14 people here. Priya starts it in a few
   minutes."*
3. **Lobby.** Headcount, the host's welcome line, and — quietly, at the bottom —
   what Looseleaf is.
4. **Round.** Enormous: **Table 5**. Then the other person's first name, and any
   answers they chose to show. A clock. Nothing else. You are supposed to be
   looking at a person, not a phone.
5. **Break.** *"Time."* If likes are on: yes / no on the person you just met,
   plus an optional private note. A no is invisible forever; a yes is invisible
   until it's mutual. Reporting someone is one tap from this card, and it reuses
   `ReportSheet` and the existing `reports` table.
6. **Reveal.** At the end, when the host says so. Mutual yeses only. Both have
   profiles → a real match and a thread, immediately. Either doesn't → *"Make a
   profile to say hi"*, and the match waits for them.
7. **Out the door.** *"You met 9 people tonight."* Then the pitch, once, honestly.

The bye screen and the "waiting for the host" screen are designed, not
afterthoughts. They're where an event feels broken if nobody thought about them.

### Pre-registration is what makes the door survivable

Requiring a verified email at the door is a queue waiting to happen: forty people
typing an address, waiting on an email, and mistyping it. The fix is to move that
work off the doorstep, and it costs almost nothing to build because the join link
already exists.

**The event link works before the event.** The host posts it in the GroupMe, the
Instagram story, the flyer on the wall a week early. Anyone who taps it verifies
their email at home, on their own wifi, with no line behind them — and at the
door they scan and they're already in, one tap. The poster is a pre-event flyer
and a door sign in the same artwork.

The host console shows both numbers, because they're the ones that predict how
the night goes: **"18 registered · 11 checked in."** And a first-time host is
told the honest thing in the setup flow: *share the link a few days early, and
the door takes seconds instead of minutes.*

Three fallbacks for the people who still arrive cold:

- The **60-second per-user cooldown** on OTP requests means a mistyped address
  costs a full minute. So validate the address shape hard before sending, show
  it back for confirmation, and make "wrong email?" a visible, obvious link.
- The host console lists **who is stuck mid-verification**, so the host knows
  whether to wait thirty seconds or start.
- Anyone who finishes after the first bell **joins at the next round** — the
  one-round-at-a-time pairing engine already handles this, and it's the payoff
  for that design choice.

---

## Entry points

**Student landing page** — a "Join a live event" section, as you described, above
the fold on mobile. It goes to `/e`, which is a code box *and* a camera scanner
(reusing the jsQR + BarcodeDetector machinery already in `Scan.jsx`, and its
hard-won lesson that permission and stream attachment must be separate steps).
It's also, quietly, an awareness surface: a student who has never heard of a
Looseleaf event learns they exist.

**Partners page** — the third card you asked for, alongside "I own it" and "I
manage it": *"I'm a student hosting an event."* It routes to `/host` and a `.edu`
sign-in rather than the business onboarding form. A club president never sees
"describe your restaurant."

**Backstage** — a Live Events section: the approval queue, what's running right
now, and a kill switch.

---

## Print kit

A host cannot run this without paper, so this is not phase-three polish.

`/host/:id/print` renders print-ready pages with `@media print` CSS — no PDF
library, no server. The host prints or saves as PDF from the browser.

- **Door poster**, US Letter — QR at ~4 inches, event name, org logo, the
  six-character code in large type as a fallback for a phone that won't scan,
  time and room, and one line: *"Free. No app to download."* The same artwork,
  printed a week early with the date on it, is the pre-registration flyer — and
  a line of small type earns its place: *"Scan now, skip the line."*
- **Half-page flyers, 2-up**, for the registration table.
- **Table tents** — a numbered card per station, folded, so nobody is counting
  tables in their head. Generated from `station_count`.
- **Instagram square and story** — the same QR and branding, sized for a post.
  This is the cheapest thing in the plan and probably the highest-leverage: it's
  how a club fills the room in the first place.

The existing `QrCode.jsx` handles the code itself — error correction M, drawn as
one SVG path, which scales to print without a raster anywhere.

---

## Safety and moderation

An event QR is a public URL and the room is full of strangers. What holds:

- **Joins close when the host starts**, by default. `join_opens = 'host_admits'`
  is the cautious setting: the host taps to admit each arrival.
- **Report from the round card**, one tap, into the existing `reports` table with
  the event and pairing as context.
- **Remove a participant** — host-side, effective next round.
- **Kill switch** — staff can end a running event from Backstage.
- **Host approval and event approval** are separate. A suspended host's events
  all stop.
- **Every participant is a verified campus email.** Not anonymous, not a
  walk-up, and traceable if something goes wrong at an event — which is a real
  safety property, not just an auth detail.
- Age is still not verified, because we collect no date of birth from someone
  with no profile. A `.edu` address is a decent proxy and not a guarantee. The
  host console says so plainly: they are responsible for who is in their room.
  Pretending otherwise would be worse than saying it.

---

## Checked against the non-negotiables

| Rule | Holds? |
|---|---|
| Nobody can pay for romantic visibility | Events are free. Nothing here is purchasable. Pairing reads no billing table. |
| Every incoming like is fully visible | Event votes aren't likes — they're mutual-only by design, and nothing is capped, blurred or sold. |
| Nobody can browse who is on Looseleaf | **No roster exists.** One name at a time, the person in front of you, from a security-definer function. This is the rule most at risk here and the schema is shaped around it. |
| Ranking never reads a billing table | The deck is untouched. Events don't feed it. |
| No coordinates or addresses | `venue_label` is a label the host types. No geocoding. |
| Notifications never anxiety-inducing | *"You matched with 3 people at Sigma's speed dating"* — no urgency, no countdown. |
| Discovery is finite | Unchanged; events are not discovery. |

Two genuinely new privacy invariants, worth writing into the tests on day one:

> **A host sees counts, never a vote.** Not who said yes, not how many yeses one
> participant got, not a match list. `host_event_summary()` returns aggregates
> and cannot return more.

> **A host never sees an email address.** Not in the console, not in an export,
> not in the recap. They message the room through the app. Enforced in the RPC's
> select list, the same way `partner_lookup_pass()` is.

---

## Risks, in order of how much they'd hurt

1. **Auth email rate limits will break an event that doesn't plan for them.**
   This is now the top risk and it is entirely preventable. Supabase's
   project-wide default is **30 OTPs per hour**, with a **60-second per-user
   window**; the underlying 2-emails-per-hour cap only lifts because we're
   already on custom SMTP through Resend (2026-08-23). Forty people verifying in
   a twenty-minute window is roughly **120/hour** at the door, and it fails as
   *"email rate limit exceeded"* — the same error that already bit us once on a
   first partner login.

   Three things, in order: raise the project rate limit at
   `/dashboard/project/_/auth/rate-limits` well above the worst case; confirm
   Resend's own send limit on the current plan clears it; and lean on
   pre-registration so the emails are spread over days instead of minutes.
   **Load-test this before the first event** — send 60 OTPs in ten minutes
   against the real project and watch what happens. It is the cheapest test in
   this document and the most expensive one to skip.

2. **A room where the wifi is bad.** Mitigated by the clock-based design, but it
   needs a real test with real phones, not headless Chromium. Nothing in this
   codebase has ever been tested on an actual iPhone, and this feature is
   iPhone-shaped. Worse now than in the anonymous draft, because the door also
   depends on **email arriving** — an institutional mail server that queues for
   ninety seconds is a queue in the hallway.

3. **Campus domain gating vs. who actually shows up.** The Before User Created
   hook admits an address only if it matches a known campus. That is exactly
   what you want for a Michigan event full of Michigan students, and it quietly
   turns away a visiting friend from State, an alum, and a grad student on a
   `med.umich.edu` subdomain. Check the subdomain case against the real hook
   before the first event; decide the visitor case deliberately rather than
   discovering it at the door.

4. **Conversion is worse than hoped.** Forty people verify, four build profiles.
   The levers are the exit screen, the mutual-yes lock and the recap email, all
   cheap to iterate. Instrument from the first event: verified accounts created,
   profiles completed, and how many of each came back the next week.

5. **The first host has a bad night.** Run the first one yourself, in the room,
   with a laptop open. Everything about the run console should be designed for
   the second event, informed by the first.

6. **Scope.** The custom-field builder is where this quietly becomes a
   general-purpose event platform. Five field types, two pairing rules, three
   presets — and no more — until an actual host asks for something else.

---

## Milestones

**M0 — Prove the door can take the load.** Raise the auth rate limit, confirm
Resend's ceiling, and fire 60 OTPs in ten minutes at the real project. Check a
`med.umich.edu`-style subdomain against the domain hook while you're there. A day
at most, and it decides whether M1 is built on sand.

**M1 — The door.** Schema and RLS. Host sign-in and console. Create and configure
an event. Staff approval in Backstage. The join flow: scan → verify → name → door
questions → lobby, plus pre-registration and the registered/checked-in counters.
The print kit. *At the end of M1 you could run a real event with paper
scorecards, which is a legitimate way to test the room before trusting the
engine.*

**M2 — The room.** The pairing engine in plpgsql. Round schedule and clock sync.
The round, break and bye screens. The host run console. Votes, mutual matching,
and the reveal — including the upgrade-your-account path. Realtime as an
accelerator over the polling floor.

**M3 — Polish and proof.** Branding, the full print kit, the Instagram assets.
Host recap and the one message-the-room channel. The morning-after recap email.
Instrumentation for the conversion question. A real run on real phones.

**M4 — Business hosts.** `host_partner_id`, a dashboard page, same tables. A bar
that's already a Date Partner hosting a Looseleaf speed dating night is a very
good story, and by then it's a small addition.

---

## Sources

Format research: [Speed dating (Wikipedia)](https://en.wikipedia.org/wiki/Speed_dating) ·
[Round-robin rotation math, MixerSeater](https://www.mixerseater.com/cms/speed-networking-rotation-round-robin) ·
[How to host a speed dating event, Fotify](https://fotify.app/blog/event-speed-dating-how-to-host-2026/) ·
[Hosting tips, party.pro](https://party.pro/speed-dating-event/)

Rate limits: [Supabase auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) ·
[Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
