# Going live

What changed when Looseleaf stopped being a demo, what's real now, and what
still isn't.

---

## The short version

- **No fixture people anywhere.** The 18 fictional students live in
  `src/services/demo.js`, which is loaded dynamically and only when
  `VITE_DATA_MODE=demo`. In live mode the deck selector returns an empty array
  by construction, so an invented student can never appear in front of a real
  one.
- **No fixture events.** `supabase/seed.sql` no longer inserts any, and the
  migration deletes any that are still there.
- **No fixture date spots.** `seed.sql` used to ship eight real Ann Arbor
  businesses, one of them advertising an invented "two coffees for $5".
  Advertising a real business's prices without an agreement isn't placeholder
  content, it's a false claim about someone else's shop — and listing the shop
  at all is a claim that somebody stands behind it. `20260828130000` deletes
  them. Date Spots now come from partners who signed up and from
  **Backstage → Spots**, where a person adds a place they've been. A
  hand-added spot can never carry a perk: a check constraint refuses a
  sponsored row with no partner behind it.
- **Campuses start closed.** A new campus opens at 50 finished profiles.
  Below that, people can sign up and build a profile, then land on a waitlist.

Reference data — the campus list and the 32 prompts — stays in `seed.sql`.
That isn't fixture content; the app doesn't work
without it. The interest vocabulary moved out of `seed.sql` and into
`20260828120000_compatibility.sql` when it grew to ~110 grouped tags: an
interest with no category is a row the matching engine cannot use, and a
migration is not optional in the way a seed file is.

---

## Run the new migration

In the SQL editor, in order (the first two you've already run):

1. `supabase/migrations/20260819120000_init.sql`
2. `supabase/migrations/20260819130000_signup_domain_hook.sql`
3. `supabase/migrations/20260819140000_real_users.sql` ← new
4. `supabase/migrations/20260819150000_backstage.sql` ← new
5. `supabase/migrations/20260819160000_mutuals.sql` ← new
6. `supabase/seed.sql`

Then two things the dashboard has to do:

**Email template.** Authentication → Emails → Magic Link. The default body
sends a link; the six-box code screen needs a code. Make sure the template
contains `{{ .Token }}`:

```
Your Looseleaf code is {{ .Token }}. It expires in an hour.
```

**Make yourself staff.** There's no admin signup flow on purpose. Sign up
normally, then run once:

```sql
update profiles set is_admin = true where id = (
  select id from auth.users where email = 'you@umich.edu'
);
```

---

## Switch the app over

Vercel → Settings → Environment Variables:

```
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Redeploy. If the keys are missing, the app logs a warning and falls back to
demo rather than shipping a blank page — so a misconfigured deploy degrades
instead of breaking.

---

## How events work now

Previously `campus_events` had a read policy and nothing else, which meant
nobody could create one through the app at all — not even you. Now:

| who | can |
| --- | --- |
| any student | submit an event; it's `pending` and only they can see it |
| any student | withdraw or edit their own while it's still pending |
| staff | see everything pending, publish or decline with a note |
| everyone on campus | see approved events, mark themselves interested |

The `status = 'pending'` constraint is in the insert policy, so a crafted
request can't self-publish — verified against Postgres, along with the rest.

Students see the Events page as students: approved events, plus their own
submissions marked "waiting for review" or "not published". Nothing about
moderation appears there, even for you. The queue lives in Backstage.

Declining asks for an optional note, which the submitter sees. Being told why
is the difference between moderation and a black hole.

---

## Mutuals

A mutual is someone you actually know who has agreed that they know you.
That's the whole definition, and it's what makes "2 mutual connections" on a
profile worth reading.

**Finding someone.** Profile → Mutuals → Add. You give a first name *and* a
major, both exact. There is no prefix matching, no fuzzy match, no suggestions
while you type, and no results before you submit. Get the major wrong and you
get nothing back — which is the correct answer for someone you don't actually
know. Results cap at 8; a real name+major pair returns one or two people.

**What you get back** is a reference card: photo, first name, major, year.
Tapping the photo enlarges it, because two people with the same name and major
is exactly the case this feature exists for. It is not a profile and it does
not link to one. `find_mutual_candidates()` and `person_reference()` return
those columns and structurally cannot return more, so this holds no matter
what a future screen asks for.

**Nothing counts until they accept.** `request_connection()` writes a row with
`accepted = false`, and only the person who was asked can flip it. A pending
request is invisible to everyone but the two of you, opens no message thread,
and never appears as a mutual on any profile. Adding back someone who already
asked you is the same as accepting — the pair is unique by
`least(profile_id, friend_id)`, so there's one row per pair regardless of who
asked first.

Declining deletes the row rather than recording the refusal. A stored "no" is
a thing that can leak; a missing row just means nothing happened. The remedy
for being asked repeatedly is Settings → *Findable as a mutual*, off, or a
block.

**Threads.** Accepted mutuals get an ordinary message thread — same
`conversations` and `messages` tables as a match, with `connection_id` set
instead of `match_id`. From a person's profile, "Ask a mutual" sends
*"Do you know Grace?"* plus her reference card. A trigger refuses a shared
card in a match thread: that conversation is between two people, and a third
person's photo doesn't belong in it. Removing a mutual cascades the thread
away.

**No directory, enforced in the database.** This migration also narrows the
`profiles` select policy. Previously any signed-in student could read every
profile row on their campus; nothing in the app did that, but "the client
doesn't" isn't "it can't". Now a row is readable when it's yours, when
`deck_visible()` says the deck would have handed it to you anyway, or when
`knows()` finds a like, match, connection, or prior deck view. Photos,
prompts, and interests inherit it — their policies read through `profiles`.

Two consequences worth knowing when discovery gets ported: `get_deck()` is
security-definer so it is unaffected, and on a **closed** campus `deck_visible`
returns false for everyone, so a waitlisted student can read no profiles at
all. Mutuals still work there, deliberately — the search RPC doesn't gate on
the campus being open, and building your list while you wait is the most
useful thing to do on a waitlist.

---

## Backstage

Staff work happens in one place, deliberately separate from using the app.

Your five tabs — Discover, Likes, Matches, Campus, Profile — are byte-identical
to everyone else's. There is no staff badge on your profile, no moderation
button grafted onto a member page, no admin row in Discover. You use Looseleaf
the way a sophomore does.

Backstage sits below a divider in the desktop sidebar, under its own heading.
On mobile there's no sidebar and the bottom nav must stay identical for
everyone, so the door is a row at the bottom of your Profile page instead.
Both are rendered only when `profiles.is_admin` is true.

| page | what it does |
| --- | --- |
| Overview | campus status, signups per day, member and activity counts |
| Reports | the safety queue — dismiss, or act (which pauses the account) |
| Event queue | publish or decline student submissions |
| Sponsors | placeholder for the local-business interface, and the rules it will follow |

**Routes.** `/app/backstage`, `/app/backstage/reports`, `/app/backstage/events`,
`/app/backstage/sponsors`. `RequireStaff` in `App.jsx` redirects non-staff to
Discover, but that guard is only about not showing a door that won't open. The
real enforcement is in the database: `staff_overview()` and `staff_set_paused()`
both raise "Not authorised" unless `is_admin()`, and the reports and pending-event
policies check it too. Verified against Postgres — a non-staff session gets an
error, not an empty result.

**What the numbers are for.** Counts, not a growth dashboard. There is no
retention curve, no per-person engagement score, and nothing in Backstage can
change who gets seen — ranking reads preferences and campus context only. If a
metric here ever starts driving a decision that makes the product worse, the
right move is to delete the metric.

**Becoming staff** is still the one `update profiles set is_admin = true` above.
There is no UI for granting it, on purpose.

---

## Photos

Real uploads, into the private `profile-photos` bucket. Storage policies key
off the first path segment (`<user-id>/…`), so nobody can write into anyone
else's folder.

Nothing renders a bucket path directly — `signUrls()` batches signed URLs with
a one-hour expiry. The tradeoff: a leaked URL stops working, at the cost of
re-signing on load. For photos of college students that's the right side of the
trade.

Limits: JPEG/PNG/WebP/HEIC, 8MB, six slots. Illustrations remain the fallback
for empty slots.

---

## The waitlist

`campus_status()` returns members, threshold, whether the campus is open, and
your position. `get_deck()` also refuses to return anyone while the campus is
closed, so the gate holds even if the client is wrong.

To open a campus early — a launch event, a pilot group — either lower the
threshold or force it:

```sql
update universities set is_live = true where short_name = 'Michigan';
-- or
update universities set open_threshold = 20 where short_name = 'Michigan';
```

Adding a campus is still one insert; the signup hook picks it up immediately.

---

## What is NOT ported yet

This pass covered accounts, profiles, photos, events, and the waitlist. Still
running on demo data, and unreachable in live mode because the campus is
closed:

- Discover, and the deck
- Likes and the notes attached to them
- Matches and the match moment
- Chat, the date nudge, and date planning
- Tonight, Double Date, Formals

`get_deck` and `create_match` already exist in the database and are tested, and
`services/live/discovery.js` now wraps the deck half. The remaining work is
client-side: replacing the demo branches in `src/state/store.jsx` and adding
`services/live/messages.js` alongside the existing live modules.

Three things about the live deck that the demo does not make obvious, and that
whoever finishes the port needs to know:

- **Reading the deck assigns it.** `get_deck()` writes a `deck_views` row for
  everybody it returns, and those people are never offered again. So it is not
  a query to call on a prefetch, on a hover, or twice on mount — call it when
  somebody has actually opened Discover. Twice in a day is harmless; twice
  across two days is not.
- **How many is not the client's decision.** `deck_size_for()` is ten percent
  of the campus capped at ten, in the database, where the tests can see it.
- **Liking or passing must call `mark_deck_acted()`**, or the person stays in
  the deck. `services/live/discovery.js` has it; wire it into whatever replaces
  the demo `like`/`pass` actions.

**Don't open a campus before that's done.** Fifty people would arrive to a
Discover tab running on fixtures.

---

## How Discover chooses

`20260828120000_compatibility.sql`, and `docs/MATCHING.md` for the whole of it.
The short version: five people a day on a campus of fifty, ordered by
`compatibility()`, and a person you decided about never returns. Preferences
are checked **both ways** — the old deck spent a scarce daily allowance showing
people whose own settings excluded you.

---

## Before real people use this

Things that are not code, and are not optional:

- **A way to answer reports.** Backstage → Reports shows the queue with a count
  in the sidebar, but nothing pushes it to you — you only see it when you open
  the app. At minimum, check it daily; better, add a Supabase webhook to email
  you on insert.
- **Terms and a privacy policy.** You're storing photos, birthdates, and
  messages for people who are mostly 18–22. This needs to exist before signup,
  not after.
- **A deletion path that actually deletes.** "Delete account" currently clears
  local state. In live mode it needs to remove the auth user, which cascades
  the profile — that requires a service-role function, since a client can't
  delete its own auth user.
- **Photo moderation.** Uploads are unreviewed. Decide now whether that's
  report-driven or checked up front; the answer shapes how fast you can grow.
- **Rate limits on signup.** Supabase's defaults are generous. Auth → Rate
  Limits, before you post the link anywhere public.
