# Loose Leaf for Partners

Local businesses become **Date Partners**. Couples get somewhere to go and a
perk; the business gets attribution for a date that actually happened. This is
how Looseleaf makes money, and it is the only place money is allowed to touch
the product.

Everything below assumes you've already got Looseleaf running against Supabase
— see `docs/DEPLOY.md` first. On the demo campus the `/partners` marketing
pages render, and everything past **Become a Partner** says so plainly rather
than simulating a signup that takes card details.

---

## What you need to supply

Two secrets, and three Stripe price IDs. Nothing else in this system needs a
credential.

| Where | Name | What it is |
| --- | --- | --- |
| Supabase → Edge Functions | `STRIPE_SECRET_KEY` | `sk_live_…` / `sk_test_…` |
| Supabase → Edge Functions | `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the endpoint |
| Supabase → Edge Functions | `PARTNER_SITE_URL` | comma-separated allow-list of return origins |
| Supabase → Edge Functions | `REPORT_USAGE_TOKEN` | only if you ever meter verified dates |
| Postgres | `partner_plans.stripe_price_id` | one recurring price per plan |

`PARTNER_SITE_URL` is a **list**, first entry wins as the fallback:

```
PARTNER_SITE_URL=https://hellolooseleaf.com,http://localhost:5173
```

Stripe is only allowed to send a partner back to an origin on that list, which
stops the billing flow being an open redirect. Add your dev origin, or a
checkout test from `localhost` lands you on production and looks exactly like a
webhook bug.

**There is no Stripe key in the front end.** Not even a publishable one.
Checkout and every change afterwards happen on Stripe-hosted pages, so the
browser only ever receives a redirect URL. If you find yourself adding
`VITE_STRIPE_…` to `.env`, something has gone wrong.

---

## Setup, in order

### 1. Apply the migrations

```bash
supabase db push
# or, by hand, in this order:
#   20260820120000_partners.sql            schema, RLS, storage bucket
#   20260820130000_partner_functions.sql   the callable surface
#   20260821120000_partner_team.sql        invitations and roles
#   20260822120000_partner_permissions.sql per-page capabilities, coordinates
```

The first one also **tightens student signup**. The campus email-domain check
used to live only in the Before User Created auth hook; that hook has to loosen
so a restaurant owner with a Gmail address can make an account, so the real
check moves down onto the `profiles` insert policy where it is enforced against
the address in the JWT. Net effect: partner signups become possible, and
student signups get stricter — nobody can onboard onto a campus whose domain
isn't theirs any more.

Re-enable the hook afterwards if you haven't already:
**Dashboard → Authentication → Hooks → Before User Created →
`public.restrict_signup_to_campus`**.

### 2. Create the plans in Stripe

Three products, each with one recurring monthly price:

| Plan id | Name | Price |
| --- | --- | --- |
| `date-spot` | Date Spot | $49/mo |
| `featured` | Featured Partner | $99/mo |
| `date-partner` | Date Partner | $199/mo |

Then point the rows at them:

```sql
update partner_plans set stripe_price_id = 'price_…' where id = 'date-spot';
update partner_plans set stripe_price_id = 'price_…' where id = 'featured';
update partner_plans set stripe_price_id = 'price_…' where id = 'date-partner';
```

Prices, names, and **what each plan unlocks** all live in `partner_plans`.
Changing $199 to $179, or moving Date Passes down a tier, is an `update` and a
page refresh — no deploy. Nothing in the app branches on a plan id; every check
is `can(entitlements, 'date_passes')` against the `entitlements` JSON on the
plan row.

### 3. Deploy the functions

```bash
cp supabase/functions/.env.example supabase/functions/.env   # fill it in
supabase secrets set --env-file supabase/functions/.env

supabase functions deploy partner-checkout
supabase functions deploy partner-portal
supabase functions deploy stripe-webhook --no-verify-jwt
```

`--no-verify-jwt` on the webhook is required — Stripe does not carry a Supabase
token. It protects itself with the signature instead, and nothing in the body is
parsed until that signature verifies.

### 4. Point Stripe at the webhook

Endpoint URL:

```
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

Events to send:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.

### 5. Check it end to end

Use a Stripe test key and card `4242 4242 4242 4242`:

1. `/partners/join` → make an account with a non-`.edu` address
2. Fill in the onboarding, choose a plan, complete Checkout
3. `partner_subscriptions.status` should become `active` within a few seconds —
   **from the webhook**, not from the redirect
4. Approve the business in Backstage → Partners
5. As a student, open Date Spots. It should now be there.

---

## How the money and the ranking stay apart

This is the part worth reading before changing anything.

A Loose Leaf recommendation is worth something to a business precisely because
students trust it. Three mechanisms protect that, in descending order of how
hard they are to accidentally undo:

**The date type is a filter, not a weight.** `recommend_date_spots` excludes
any spot that isn't tagged for what the person asked for, before scoring
anything. Ask for coffee and a paying brewery cannot appear — not lower down,
not at all.

**The scoring gap is arithmetic.** Within the set that does match, a matching
date type is worth 34 points and *everything a partner can buy combined* —
featured placement, a live offer, priority eligibility — is capped at 10. A
free spot that fits better wins, and there is no amount of money that changes
that. Both properties have tests in `tests/partners_test.sql`.

**Ranking people never touches these tables.** `get_deck`, likes, and matches
do not join `partner_plans`, `partner_subscriptions`, or `date_spots`, and must
never start. Sponsorship affects places. It has never affected people.

## How partners stay out of dating data

A partner is not a row in `profiles`. `partner_users` is a separate table, so
every existing member policy — all of which route through `current_university()`
or `auth.uid() = profiles.id` — fails closed for a business by construction
rather than by a filter someone has to remember. A trigger keeps the two
mutually exclusive in both directions.

`date_passes` has **no partner select policy at all**. Everything a business
learns about a pass comes back from `partner_lookup_pass()` and
`partner_redemptions()`, which are security definer and hand-write their select
lists: an offer, a status, two timestamps, and the last four characters of the
code. There is no column in those shapes that could be widened into a person.

The test file asserts all of this against a real Postgres — that a partner
reads zero rows from `date_passes`, `profiles`, `messages`, `likes`, and
`recommendation_events`, and that no partner-facing function returns a column
whose name suggests a person.

```bash
# with a database that has the migrations applied
psql "$DATABASE_URL" -f tests/partners_test.sql
```

## What a student is allowed to read about an offer

RLS is row-level, and an offer row is not uniformly public. `partner_offers`
carries the deal *and* the commercial terms behind it — `max_redemptions`,
`max_redemptions_per_month`, `redeemed_count`, internal notes, status. A policy
that lets a student see the row lets them see all of that, which is a
business's private information handed to its customers.

So students never touch the table. They read a view:

```sql
select * from public_offers;   -- title, summary, days, hours. Nothing else.
```

`public_offers` hand-writes its select list, filters to `status = 'active'` on
a partner that is `partner_is_live()` and still entitled to offers, and is the
only offer surface granted to `authenticated`. The table's own select policy is
now `partner_can(partner_id, 'offers')` — the people who manage them, and
nobody else. The suite asserts both halves: a student reads **zero** rows from
`partner_offers` and exactly one from `public_offers`, and no column of the
view matches `/cap|max|count|internal|status/`.

Staff fall on the same side of that line as students, which is the point. A
member of waiting staff scanning passes has no reason to know how many of them
the business will honour this month.

## Photos, and why they appear immediately

Three separate problems, three fixes, all in `services/live/partnerMedia.js`
and `components/dates/SpotImage.jsx`:

**HEIC.** An iPhone hands over HEIC whenever a photo is picked from Files
rather than Photos, and Chrome and Firefox cannot decode it at all — upload one
and it is a broken image for everyone but the person who uploaded it. Uploads
detect it by MIME type *and* extension and convert to JPEG through a WebAssembly
libheif build, which is dynamically imported at the moment somebody picks one,
so nobody downloads three megabytes to upload a normal JPEG.

**Orientation and size.** Everything is decoded with
`createImageBitmap(file, { imageOrientation: 'from-image' })` — EXIF rotation
baked into the pixels, because a `<img>` in a grid will not honour it — then
drawn down to a target edge (512 for a logo, 1800 for a cover, 1400 for a
gallery shot) and re-encoded as JPEG at 0.82. A twelve-megapixel phone photo
lands as a few hundred kilobytes, which is most of the reason the old ones felt
slow. Logos with real transparency stay PNG; everything else is flattened onto
the paper colour.

**The wait.** Uploads set `cacheControl: '31536000'` so a cover is fetched once
ever. The Date Spots page calls `preload()` with every cover as soon as the
list arrives, so they are in cache before anybody has finished reading the
filter chips, and the first four cards render `eager` with
`fetchPriority="high"`. `SpotImage` always paints a box at the final aspect
ratio, tinted from the spot's own id, so the layout is final on first paint and
nothing reflows when the bytes land. A spot with no photo keeps that box
permanently, which beats a broken-image icon.

The upload field shows the *local* file as a preview from the moment it is
picked — `URL.createObjectURL`, swapped for the stored URL when the upload
finishes and revoked after. Onboarding used to show an empty frame for as long
as the upload took, which read as a failure.

## The map

A partner's address is geocoded once, when they save it, through Nominatim —
no key, no account — and `latitude`/`longitude` are stored on
`partner_locations` and `date_spots`. The Date Spot sheet embeds it as an
OpenStreetMap iframe: one lazily-loaded frame, no script, no key. If geocoding
failed the map is left out and the address carries the section on its own.

**Directions** deliberately leaves Looseleaf, as a `maps/dir/?api=1` link built
from the *address* rather than the coordinates, so it works whether or not
geocoding ever succeeded and opens the native app on a phone.

The only location involved anywhere here is the business's. Looseleaf still
stores nothing about where the person reading the sheet is standing — see
below.

## Distance, and why it's from campus

Looseleaf stores no user location — no coordinates, no addresses, no last-seen.
So "0.8 miles away" on a card means *away from campus*, computed from the
business's own address to the campus centroid, and `walk_minutes` is the same.
A partner enters both during onboarding.

If you ever want true proximity, the honest version is a browser geolocation
prompt at plan time, used in memory and never persisted — not a column.

## The performance fee

`$199/month + $5 per verified date` is built and switched off. It stays off
behind three separate locks, all of which have to be opened by hand:

1. `partner_plans.per_verified_date_cents` above zero
2. `partner_plans.stripe_metered_price_id` pointing at a real metered price
3. `partner_subscriptions.metered_started_at` set for that specific partner

`supabase/functions/partner-report-usage` reports yesterday's redemptions as
usage for any subscription that clears all three. Deploy it and schedule it
daily only when you actually mean to start charging; the counts it reports come
from `date_pass_redemptions`, the same table the partner's own dashboard shows,
so any invoice can be reconciled against what they were told.

## Who can do what

A role is not a rank. `partner_members` carries one, but what a role *reaches*
is a list of pages the owner controls, held in `partners.role_pages`:

```json
{ "manager": ["scan", "team"], "staff": ["scan"] }
```

Those are the defaults every new business starts with. A member of waiting
staff who signs in sees one screen — the scanner — with no navigation around
it at all, because there is nowhere else they can go. A manager sees the
scanner and the team. Everything else is off until an owner turns it on in
**Settings → What your team can see**, one page at a time, and it can be turned
off again the same way.

Two things are not negotiable and are not in the grid:

* **`scan` cannot be revoked.** It is the whole job. Taking it away would leave
  somebody signed in to nothing.
* **`settings` can never be granted.** It is the page that edits the grid, so
  granting it would let a manager grant themselves the rest. `partner_can()`
  returns false for it before it ever looks at the column, and
  `set_partner_role_pages()` filters it out of anything written there — so
  writing `{"manager": ["settings"]}` straight into the table by hand still
  gets a manager nothing.

Every check is one function:

```sql
partner_can(partner_id, 'billing')   -- role → role_pages → yes or no
```

Owners short-circuit to true. `is_partner_admin(p)` is now defined as
`partner_can(p, 'spot')`, so the policies that were written against it keep
meaning what they meant, and the RPCs — `partner_overview`, `partner_funnel`,
`save_date_spot`, the billing calls — each name the page they need. The
dashboard hides tabs a role can't use and bounces a typed URL back to the first
page it can, but neither of those is the control: the control is that the
database refuses.

People are added by email from **Team**, which managers can now do — they are
the ones actually hiring at a restaurant. A manager can add and remove staff
and other managers; they cannot add an owner, promote anyone to owner, or
remove one, and that is enforced in `invite_partner_member()`,
`set_partner_member_role()` and `remove_partner_member()` rather than in the
dropdown. An invitation grants nothing on its own: `accept_partner_invite()`
re-checks the address against the JWT of whoever is actually signed in, so
forwarding the email passes nothing on. A business always keeps at least one
owner — the last one can't demote or remove themselves until somebody else is
promoted, and the button isn't shown rather than shown-and-refused.

Somebody who was invited never sees the "describe your restaurant" flow; they
land on an accept screen instead, because they don't own one.

## More than one location

One business, many `partner_locations`, each publishing its own `date_spots`
row with its own address, hours, and walk from campus — "0.8 miles away" is a
per-address fact, and sharing one across three cafes would be a lie about two
of them. How many is `max_locations` on the plan.

With a single location, renaming the Date Spot renames the business, because
that is what a partner means by it. With several, the card title is just a card
title.

## Moderation

New businesses land as `pending` and are invisible to students. `partner_is_live()`
requires **both** staff approval and a live subscription, so paying is not
enough and neither is approval on its own. Backstage → Partners is where a
person reads each application; declining writes a note the partner sees
verbatim on their dashboard.

Suspending a partner takes effect immediately — their Date Spot drops out of
discovery and recommendations on the next query.

Individual offers can be taken down without touching the business: expand the
offer count on a partner's row in Backstage. It **pauses** rather than deletes,
because an offer pulled for review is the start of a conversation with a
business, and deleting their work mid-conversation makes that conversation
much worse. They see it paused in their own dashboard and can ask why.

## Storage

Partner logos, covers, and galleries live in a **public** `partner-media`
bucket, unlike student photos which are private and served through short-lived
signed URLs. The difference is deliberate: a student's photo is a person, a
restaurant's logo is a shopfront. Files sit under `<partner-id>/…` and the
storage policy calls `is_partner_admin()` on that first path segment.

## Routes

| Route | Who |
| --- | --- |
| `/partners` | anyone — the B2B landing page |
| `/partners/join`, `/partners/login` | business owners |
| `/partners/onboarding` | a partner without a business yet |
| `/partners/dashboard/…` | partner members |
| `/partners/dashboard/scan` | every partner member, including staff |
| `/partners/dashboard/team` | owners, and managers, who can't touch owners |
| `/partners/dashboard/settings` | owners only, and never grantable |
| `/app/campus/spots` | students — Date Spots |
| `/app/passes` | students — their Date Passes |
| `/app/backstage/partners` | Looseleaf staff |

The whole `/partners` subtree is lazily loaded, so a student never downloads
any of it.
