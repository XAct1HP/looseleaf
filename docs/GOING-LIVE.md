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
- **No fake sponsorship.** The seeded "two coffees for $5" offer at Vertex
  Coffee was invented. Advertising a real business's prices without an
  agreement isn't placeholder content, it's a false claim about someone else's
  shop — so date spots now seed unsponsored.
- **Campuses start closed.** A new campus opens at 50 finished profiles.
  Below that, people can sign up and build a profile, then land on a waitlist.

Reference data — the campus list, the 28 interests, the 32 prompts, the 8 real
Ann Arbor date spots — stays in `seed.sql`. That isn't fixture content; the app
doesn't work without it.

---

## Run the new migration

In the SQL editor, in order (the first two you've already run):

1. `supabase/migrations/20260819120000_init.sql`
2. `supabase/migrations/20260819130000_signup_domain_hook.sql`
3. `supabase/migrations/20260819140000_real_users.sql` ← new
4. `supabase/seed.sql`

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

The queue lives on the Events page itself: if you're staff, pending
submissions appear at the top with Publish and Decline. There's no separate
admin app to build or secure.

Declining asks for an optional note, which the submitter sees. Being told why
is the difference between moderation and a black hole.

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

`get_deck` and `create_match` already exist in the database and are tested; the
remaining work is client-side — replacing the demo branches in
`src/state/store.jsx` and adding `services/live/discovery.js` and
`services/live/messages.js` alongside the existing live modules.

**Don't open a campus before that's done.** Fifty people would arrive to a
Discover tab running on fixtures.

---

## Before real people use this

Things that are not code, and are not optional:

- **A way to answer reports.** `reports` collects them and staff can read them,
  but nothing notifies you. At minimum, check the table daily; better, add a
  Supabase webhook to email you on insert.
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
