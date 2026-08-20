-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — Loose Leaf for Partners: schema, ownership, and row security
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Businesses become Date Partners. Couples get somewhere to go and a perk;
--  the business gets attribution. That exchange is deliberately narrow, and
--  three lines in this file are what keep it narrow:
--
--   1. A partner is NOT a student. `partner_users` is a separate table from
--      `profiles`, so a partner has no university, no deck, no likes, and
--      every existing member policy — all of which route through
--      `current_university()` or `auth.uid() = profiles.id` — fails closed for
--      them by construction, not by a filter someone has to remember.
--
--   2. A partner never reads `date_passes`. There is no select policy on that
--      table for partner members at all. Everything a business needs to see
--      about a pass (is it valid, which offer, has it been used) comes back
--      from a security-definer RPC that returns those three things and no
--      reference to the people. Scanning a pass tells a restaurant that a
--      Loose Leaf date is happening, never who is on it.
--
--   3. Money still cannot touch people. `partner_plans` and
--      `partner_subscriptions` describe what a business bought; no query that
--      ranks, filters, or orders a *person* is permitted to join them. The
--      recommendation function in the next migration reads them, and it ranks
--      places. Discover, Likes, and the deck do not, and must not.
--
--  A fourth thing this file fixes on the way past: the campus email domain was
--  only ever checked by the Before User Created auth hook. That hook has to
--  loosen for partners (a restaurant owner has a Gmail address), so the domain
--  rule is moved down onto the `profiles` insert policy, where it is enforced
--  by the database against the signed-in address in the JWT and cannot be
--  bypassed by client-supplied metadata. Net effect: partner signups become
--  possible and student signups get *stricter* — you can no longer onboard
--  onto a campus whose domain isn't yours.
--
--  Run order: after 20260819160000_mutuals.sql, before _partner_functions.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── enums ────────────────────────────────────────────────────────────────

do $$ begin
  create type partner_status as enum
    ('draft', 'pending', 'active', 'paused', 'rejected', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type partner_role as enum ('owner', 'manager', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type offer_status as enum ('draft', 'active', 'paused', 'ended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pass_status as enum ('issued', 'redeemed', 'expired', 'void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type funnel_stage as enum
    ('spot_view', 'recommendation', 'offer_unlock', 'verified_date');
exception when duplicate_object then null; end $$;

-- ─── taxonomy ─────────────────────────────────────────────────────────────
--  Date-shaped categories, not restaurant-shaped ones. These are rows rather
--  than a constant in the client because the recommender scores against them,
--  and adding "Bookstore date" later should be an insert.

create table if not exists partner_categories (
  id    text primary key,
  label text not null,
  emoji text,
  sort  int not null default 100
);

create table if not exists date_types (
  id    text primary key,
  label text not null,
  emoji text,
  sort  int not null default 100
);

create table if not exists date_vibes (
  id    text primary key,
  label text not null,
  sort  int not null default 100
);

insert into partner_categories (id, label, emoji, sort) values
  ('restaurant',   'Restaurant',        '🍽',  10),
  ('coffee',       'Coffee shop',       '☕',  20),
  ('cafe',         'Cafe',              '🥐',  30),
  ('dessert',      'Dessert shop',      '🍨',  40),
  ('brewery',      'Brewery',           '🍺',  50),
  ('bar',          'Bar',               '🍸',  60),
  ('bowling',      'Bowling alley',     '🎳',  70),
  ('arcade',       'Arcade',            '🕹',  80),
  ('mini-golf',    'Mini golf',         '⛳',  90),
  ('museum',       'Museum',            '🏛', 100),
  ('art-studio',   'Art studio',        '🎨', 110),
  ('pottery',      'Pottery studio',    '🏺', 120),
  ('cooking',      'Cooking class',     '👩‍🍳', 130),
  ('comedy',       'Comedy club',       '🎤', 140),
  ('venue',        'Live music venue',  '🎶', 150),
  ('bookstore',    'Bookstore',         '📚', 160),
  ('climbing',     'Climbing gym',      '🧗', 170),
  ('other',        'Somewhere else',    '📍', 999)
on conflict (id) do nothing;

insert into date_types (id, label, emoji, sort) values
  ('first-date',  'First date',    '👋',  10),
  ('coffee',      'Coffee',        '☕',  20),
  ('dinner',      'Dinner',        '🍽',  30),
  ('drinks',      'Drinks',        '🍻',  40),
  ('dessert',     'Dessert',       '🍨',  50),
  ('fun',         'Something fun', '🎳',  60),
  ('activity',    'Activity',      '🎯',  70),
  ('outdoors',    'Outdoors',      '🌳',  80),
  ('late-night',  'Late night',    '🌙',  90),
  ('casual',      'Casual',        '🧦', 100),
  ('romantic',    'Romantic',      '🌹', 110),
  ('group',       'Group date',    '👯', 120),
  ('study',       'Study date',    '📚', 130)
on conflict (id) do nothing;

insert into date_vibes (id, label, sort) values
  ('cozy',        'Cozy',        10),
  ('playful',     'Playful',     20),
  ('romantic',    'Romantic',    30),
  ('adventurous', 'Adventurous', 40),
  ('artsy',       'Artsy',       50),
  ('foodie',      'Foodie',      60),
  ('competitive', 'Competitive', 70),
  ('quiet',       'Quiet',       80),
  ('social',      'Social',      90),
  ('upscale',     'Upscale',    100),
  ('low-key',     'Low-key',    110)
on conflict (id) do nothing;

-- ─── plans and entitlements ───────────────────────────────────────────────
--  Everything a plan unlocks is a key in `entitlements`, read at runtime.
--  Nothing in the app is permitted to branch on a plan id — see
--  src/lib/partnerPlans.js, which reads these rows and nothing else. Changing
--  a price or moving a feature between tiers is an UPDATE, not a deploy.

create table if not exists partner_plans (
  id                       text primary key,
  name                     text not null,
  blurb                    text,
  monthly_cents            int not null,
  -- The performance fee stays off until this is deliberately set above zero
  -- AND the billing side is configured to meter it. Zero means never charged.
  per_verified_date_cents  int not null default 0,
  stripe_price_id          text,
  -- The metered price a per-verified-date fee would bill against. Null means
  -- the meter does not exist in Stripe at all, which is a second lock on top
  -- of `per_verified_date_cents = 0` and `metered_started_at is null`.
  stripe_metered_price_id  text,
  entitlements             jsonb not null default '{}'::jsonb,
  sort                     int not null default 100,
  is_public                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

insert into partner_plans (id, name, blurb, monthly_cents, entitlements, sort) values
  (
    'date-spot', 'Date Spot',
    'Be somewhere couples can find.',
    4900,
    jsonb_build_object(
      'discovery',            true,
      'partner_badge',        true,
      'photos',               true,
      'date_categories',      true,
      'analytics',            'basic',
      'featured_placement',   false,
      'recommendations',      false,
      'offers',               false,
      'chat_recommendations', false,
      'date_passes',          false,
      'redemption',           false,
      'targeting',            false,
      'max_locations',        1,
      'max_active_offers',    0,
      'gallery_photos',       4
    ),
    10
  ),
  (
    'featured', 'Featured Partner',
    'Show up when Loose Leaf is helping someone choose.',
    9900,
    jsonb_build_object(
      'discovery',            true,
      'partner_badge',        true,
      'photos',               true,
      'date_categories',      true,
      'analytics',            'enhanced',
      'featured_placement',   true,
      'recommendations',      true,
      'offers',               true,
      'chat_recommendations', false,
      'date_passes',          false,
      'redemption',           false,
      'targeting',            false,
      'max_locations',        3,
      'max_active_offers',    2,
      'gallery_photos',       8
    ),
    20
  ),
  (
    'date-partner', 'Date Partner',
    'Turn conversations into tables.',
    19900,
    jsonb_build_object(
      'discovery',            true,
      'partner_badge',        true,
      'photos',               true,
      'date_categories',      true,
      'analytics',            'advanced',
      'featured_placement',   true,
      'recommendations',      true,
      'offers',               true,
      'chat_recommendations', true,
      'date_passes',          true,
      'redemption',           true,
      'targeting',            true,
      'verified_date_reporting', true,
      'max_locations',        10,
      'max_active_offers',    6,
      'gallery_photos',       12
    ),
    30
  )
on conflict (id) do nothing;

-- ─── accounts ─────────────────────────────────────────────────────────────

--  A business person's login. Separate from `profiles` on purpose: this row
--  existing is what makes someone a partner, and it grants nothing on the
--  dating side because no member policy ever looks here.
create table if not exists partner_users (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text not null check (length(full_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists partners (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique,
  name          text not null check (length(name) between 2 and 120),
  category      text not null references partner_categories (id),
  description   text,
  website       text,
  phone         text,
  logo_path     text,
  status        partner_status not null default 'draft',
  -- Moderation. Staff decide; the partner reads the note.
  review_note   text,
  reviewed_by   uuid references profiles (id) on delete set null,
  reviewed_at   timestamptz,
  created_by    uuid references partner_users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

--  Who may act for a business. Modelled as a join table from day one so a
--  restaurant can give a shift manager a redemption login without handing
--  over the billing account.
create table if not exists partner_members (
  partner_id      uuid not null references partners (id) on delete cascade,
  partner_user_id uuid not null references partner_users (id) on delete cascade,
  role            partner_role not null default 'staff',
  created_at      timestamptz not null default now(),
  primary key (partner_id, partner_user_id)
);

create index if not exists partner_members_user_idx on partner_members (partner_user_id);

-- ─── locations ────────────────────────────────────────────────────────────
--  One business, many locations, from the start.
--
--  Note what is stored and what is not: the *business* address, which is
--  public information a business wants published, and `walk_minutes` from the
--  campus centroid. There is no user location anywhere in this file. "0.8
--  miles away" on a card means away from campus, because Loose Leaf does not
--  know where anybody is standing and is not going to start.

create table if not exists partner_locations (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid not null references partners (id) on delete cascade,
  university_id   uuid not null references universities (id),
  label           text,
  address_line    text not null,
  city            text,
  region          text,
  postal_code     text,
  walk_minutes    int check (walk_minutes between 0 and 240),
  distance_miles  numeric(4, 2) check (distance_miles >= 0),
  price_level     int check (price_level between 1 and 4),
  -- {"mon": [["11:00","22:00"]], "tue": [], ...} — empty array = closed
  hours           jsonb not null default '{}'::jsonb,
  phone           text,
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists partner_locations_partner_idx on partner_locations (partner_id);
create index if not exists partner_locations_campus_idx on partner_locations (university_id);

-- ─── date_spots becomes the consumer-facing surface for both ──────────────
--  `date_spots` already exists, is already what `date_plans.spot_id` points
--  at, and is already the one table sponsorship was allowed to live on. A
--  partner location publishes into it rather than into a parallel table, so
--  organic spots and partner spots rank in the same query and a partner's
--  presence is one nullable column rather than a separate code path.

alter table date_spots add column if not exists partner_id           uuid references partners (id) on delete set null;
alter table date_spots add column if not exists partner_location_id  uuid references partner_locations (id) on delete cascade;
alter table date_spots add column if not exists date_types           text[] not null default '{}';
alter table date_spots add column if not exists vibes                text[] not null default '{}';
alter table date_spots add column if not exists price_level          int;
alter table date_spots add column if not exists address_line         text;
alter table date_spots add column if not exists website              text;
alter table date_spots add column if not exists phone                text;
alter table date_spots add column if not exists hours                jsonb not null default '{}'::jsonb;
alter table date_spots add column if not exists logo_path            text;
alter table date_spots add column if not exists cover_path           text;
alter table date_spots add column if not exists gallery_paths        text[] not null default '{}';
alter table date_spots add column if not exists distance_miles       numeric(4, 2);
alter table date_spots add column if not exists indoor_outdoor       text;
alter table date_spots add column if not exists reservations         text;
alter table date_spots add column if not exists min_age              int;
alter table date_spots add column if not exists is_published         boolean not null default true;
alter table date_spots add column if not exists created_at           timestamptz not null default now();
alter table date_spots add column if not exists updated_at           timestamptz not null default now();

do $$ begin
  alter table date_spots add constraint date_spots_price_level_check
    check (price_level is null or price_level between 1 and 4);
exception when duplicate_object then null; end $$;

create unique index if not exists date_spots_location_uidx
  on date_spots (partner_location_id) where partner_location_id is not null;
create index if not exists date_spots_campus_published_idx
  on date_spots (university_id) where is_published;
create index if not exists date_spots_date_types_idx on date_spots using gin (date_types);
create index if not exists date_spots_vibes_idx on date_spots using gin (vibes);
create index if not exists date_spots_partner_idx on date_spots (partner_id);

-- ─── subscriptions ────────────────────────────────────────────────────────
--  What Stripe says, mirrored. `status` is only ever written by the webhook
--  handler running with the service role — a redirect back from Checkout is
--  not proof that anybody paid, and nothing in the client can set this.

create table if not exists partner_subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  partner_id             uuid not null unique references partners (id) on delete cascade,
  plan_id                text references partner_plans (id),
  status                 text not null default 'incomplete',
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  latest_invoice_status  text,
  -- Set only when the operator deliberately turns on per-verified-date
  -- billing for this partner. Null means the meter is off, whatever the plan
  -- row says, so switching it on is always a two-key action.
  metered_started_at     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists partner_subscriptions_customer_idx on partner_subscriptions (stripe_customer_id);

--  Webhook idempotency. Stripe retries; a redelivered event must be a no-op.
create table if not exists partner_billing_events (
  stripe_event_id text primary key,
  type            text not null,
  partner_id      uuid references partners (id) on delete set null,
  received_at     timestamptz not null default now(),
  payload         jsonb
);

-- ─── offers ───────────────────────────────────────────────────────────────

create table if not exists partner_offers (
  id                      uuid primary key default gen_random_uuid(),
  partner_id              uuid not null references partners (id) on delete cascade,
  -- null = every location
  partner_location_id     uuid references partner_locations (id) on delete cascade,
  title                   text not null check (length(title) between 2 and 80),
  offer_type              text not null check (offer_type in
                            ('percent_off','amount_off','free_item','bogo','spend_threshold','package','custom')),
  percent_off             int check (percent_off between 1 and 100),
  amount_off_cents        int check (amount_off_cents > 0),
  min_spend_cents         int check (min_spend_cents >= 0),
  free_item               text,
  description             text,
  terms                   text,
  starts_on               date,
  ends_on                 date,
  -- 0 = Sunday, matching extract(dow). A restaurant that wants Loose Leaf
  -- traffic on a dead Tuesday and not on a rammed Friday says so here.
  days_of_week            int[] not null default '{0,1,2,3,4,5,6}',
  start_time              time,
  end_time                time,
  max_total_redemptions   int check (max_total_redemptions > 0),
  max_monthly_redemptions int check (max_monthly_redemptions > 0),
  max_daily_redemptions   int check (max_daily_redemptions > 0),
  new_customers_only      boolean not null default false,
  -- A pass is single-use unless the offer explicitly says otherwise.
  multi_use               boolean not null default false,
  pass_valid_days         int not null default 14 check (pass_valid_days between 1 and 180),
  status                  offer_status not null default 'draft',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index if not exists partner_offers_partner_idx on partner_offers (partner_id, status);
create index if not exists partner_offers_live_idx on partner_offers (partner_id) where status = 'active';

-- ─── date passes ──────────────────────────────────────────────────────────
--  A ticket to a date. `issued_to` and `conversation_id` are here because the
--  person needs to find their own pass and we need to stop one couple minting
--  forty of them — and they are exactly why no partner gets to read this
--  table. See the RPCs in the next migration.

create table if not exists date_passes (
  id                  uuid primary key default gen_random_uuid(),
  -- Short, unambiguous, sayable out loud to a server who can't scan.
  code                text not null unique,
  offer_id            uuid not null references partner_offers (id) on delete cascade,
  partner_id          uuid not null references partners (id) on delete cascade,
  partner_location_id uuid references partner_locations (id) on delete set null,
  issued_to           uuid references profiles (id) on delete set null,
  conversation_id     uuid references conversations (id) on delete set null,
  match_id            uuid references matches (id) on delete set null,
  status              pass_status not null default 'issued',
  issued_at           timestamptz not null default now(),
  expires_at          timestamptz not null,
  redeemed_at         timestamptz,
  -- Anti-abuse, kept deliberately thin: a count of failed lookups and the
  -- coarse surface it came from. No IP, no device id, no fingerprint.
  lookup_attempts     int not null default 0,
  issue_surface       text,
  check (expires_at > issued_at)
);

create index if not exists date_passes_partner_idx on date_passes (partner_id, status);
create index if not exists date_passes_holder_idx on date_passes (issued_to, issued_at desc);
create index if not exists date_passes_offer_idx on date_passes (offer_id, issued_at desc);
-- One live pass per person per offer: unlocking twice returns the same ticket.
create unique index if not exists date_passes_one_live_uidx
  on date_passes (offer_id, issued_to) where status = 'issued';

create table if not exists date_pass_redemptions (
  id                  uuid primary key default gen_random_uuid(),
  pass_id             uuid not null references date_passes (id) on delete cascade,
  partner_id          uuid not null references partners (id) on delete cascade,
  offer_id            uuid not null references partner_offers (id) on delete cascade,
  partner_location_id uuid references partner_locations (id) on delete set null,
  -- Which member of staff confirmed it. A partner-side identity, never a
  -- dating-side one.
  redeemed_by         uuid references partner_users (id) on delete set null,
  redeemed_at         timestamptz not null default now(),
  amount_cents        int check (amount_cents >= 0)
);

create index if not exists date_pass_redemptions_partner_idx
  on date_pass_redemptions (partner_id, redeemed_at desc);
create index if not exists date_pass_redemptions_offer_idx
  on date_pass_redemptions (offer_id, redeemed_at desc);
create index if not exists date_pass_redemptions_pass_idx on date_pass_redemptions (pass_id);

-- ─── measurement ──────────────────────────────────────────────────────────

--  Rich, private, ours. Used to tune ranking and — the important one — to
--  keep Loose Leaf from suggesting the same place twice in a week. Partners
--  never read this table; they read counts derived from it.
create table if not exists recommendation_events (
  id              bigint generated always as identity primary key,
  date_spot_id    uuid references date_spots (id) on delete cascade,
  partner_id      uuid references partners (id) on delete set null,
  offer_id        uuid references partner_offers (id) on delete set null,
  viewer          uuid references profiles (id) on delete cascade,
  conversation_id uuid references conversations (id) on delete cascade,
  surface         text not null check (surface in ('discovery','planner','chat','homepage')),
  rank            int,
  fit_score       int,
  outcome         text check (outcome in ('shown','dismissed','chosen','swapped')),
  created_at      timestamptz not null default now()
);

create index if not exists recommendation_events_viewer_idx
  on recommendation_events (viewer, created_at desc);
create index if not exists recommendation_events_convo_idx
  on recommendation_events (conversation_id, created_at desc);
create index if not exists recommendation_events_spot_idx
  on recommendation_events (date_spot_id, created_at desc);

--  The funnel a partner is paying to see: view → recommendation → unlock →
--  verified date. Deliberately has no column that identifies a person, so
--  even a mistake in a policy here leaks nothing about anybody's love life.
create table if not exists partner_events (
  id           bigint generated always as identity primary key,
  partner_id   uuid not null references partners (id) on delete cascade,
  date_spot_id uuid references date_spots (id) on delete set null,
  offer_id     uuid references partner_offers (id) on delete set null,
  stage        funnel_stage not null,
  occurred_at  timestamptz not null default now()
);

create index if not exists partner_events_funnel_idx
  on partner_events (partner_id, stage, occurred_at desc);

-- ─── targeting ────────────────────────────────────────────────────────────
--  Eligibility inputs, not purchased placements. A partner narrows when they
--  want to be considered; they cannot widen past what the recommender thinks
--  is relevant, and an empty array means "no preference", not "everything".

create table if not exists partner_targeting (
  partner_id   uuid primary key references partners (id) on delete cascade,
  date_types   text[] not null default '{}',
  vibes        text[] not null default '{}',
  price_levels int[]  not null default '{}',
  days_of_week int[]  not null default '{0,1,2,3,4,5,6}',
  start_time   time,
  end_time     time,
  is_paused    boolean not null default false,
  updated_at   timestamptz not null default now()
);

-- ─── updated_at ───────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'partner_users','partners','partner_locations','partner_plans',
    'partner_subscriptions','partner_offers','date_spots'
  ] loop
    execute format(
      'drop trigger if exists %I on %I; create trigger %I before update on %I
         for each row execute function public.touch_updated_at();',
      t || '_touch', t, t || '_touch', t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Helpers
-- ═══════════════════════════════════════════════════════════════════════════

--  The signed-in email address, from the JWT rather than the auth schema, so
--  this needs no privilege on auth.users and no security definer.
create or replace function public.jwt_email()
returns text language sql stable as $$
  select lower(nullif(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_partner_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from partner_users where id = auth.uid());
$$;

--  Membership checks are security definer so that reading `partner_members`
--  from inside a policy on `partner_members` doesn't recurse.
create or replace function public.is_partner_member(p_partner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from partner_members
    where partner_id = p_partner and partner_user_id = auth.uid()
  );
$$;

create or replace function public.is_partner_admin(p_partner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from partner_members
    where partner_id = p_partner
      and partner_user_id = auth.uid()
      and role in ('owner', 'manager')
  );
$$;

create or replace function public.is_partner_owner(p_partner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from partner_members
    where partner_id = p_partner
      and partner_user_id = auth.uid()
      and role = 'owner'
  );
$$;

--  What this partner's plan unlocks right now. Falls back to the free-standing
--  'date-spot' feature set only when a subscription row exists and is live;
--  an unpaid or lapsed partner gets an empty object, which every entitlement
--  check reads as false.
create or replace function public.partner_entitlements(p_partner uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pl.entitlements
       from partner_subscriptions s
       join partner_plans pl on pl.id = s.plan_id
      where s.partner_id = p_partner
        and s.status in ('active', 'trialing')),
    '{}'::jsonb);
$$;

create or replace function public.partner_has(p_partner uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((public.partner_entitlements(p_partner) ->> p_key)::boolean, false);
$$;

--  A partner is visible to students only when a human approved it and the
--  billing is current. Both halves matter: approval is the moderation gate,
--  the subscription is the commercial one.
create or replace function public.partner_is_live(p_partner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from partners p
    left join partner_subscriptions s on s.partner_id = p.id
    where p.id = p_partner
      and p.status = 'active'
      and coalesce(s.status, '') in ('active', 'trialing')
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Row level security
-- ═══════════════════════════════════════════════════════════════════════════

alter table partner_categories      enable row level security;
alter table date_types              enable row level security;
alter table date_vibes              enable row level security;
alter table partner_plans           enable row level security;
alter table partner_users           enable row level security;
alter table partners                enable row level security;
alter table partner_members         enable row level security;
alter table partner_locations       enable row level security;
alter table partner_subscriptions   enable row level security;
alter table partner_billing_events  enable row level security;
alter table partner_offers          enable row level security;
alter table date_passes             enable row level security;
alter table date_pass_redemptions   enable row level security;
alter table recommendation_events   enable row level security;
alter table partner_events          enable row level security;
alter table partner_targeting       enable row level security;

-- ─── public reference data ────────────────────────────────────────────────
--  Readable signed out, because the pricing page and the sign-up form are
--  public. None of it says anything about a person.

drop policy if exists "taxonomy: read" on partner_categories;
create policy "taxonomy: read" on partner_categories for select to anon, authenticated using (true);

drop policy if exists "taxonomy: read" on date_types;
create policy "taxonomy: read" on date_types for select to anon, authenticated using (true);

drop policy if exists "taxonomy: read" on date_vibes;
create policy "taxonomy: read" on date_vibes for select to anon, authenticated using (true);

drop policy if exists "plans: read the public ones" on partner_plans;
create policy "plans: read the public ones" on partner_plans
  for select to anon, authenticated using (is_public or public.is_admin());

-- ─── partner accounts ─────────────────────────────────────────────────────

drop policy if exists "partner users: yourself" on partner_users;
create policy "partner users: yourself" on partner_users
  for select to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists "partner users: create your own" on partner_users;
create policy "partner users: create your own" on partner_users
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "partner users: edit your own" on partner_users;
create policy "partner users: edit your own" on partner_users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

--  A partner row is readable by its own people, by staff, and — only once it
--  is live — by signed-in students, who need the name and logo on a card.
drop policy if exists "partners: your own, or a live one" on partners;
create policy "partners: your own, or a live one" on partners
  for select to authenticated
  using (
    public.is_partner_member(id)
    or public.is_admin()
    or (status = 'active' and public.partner_is_live(id))
  );

--  Creating the business is done through register_partner(), which also makes
--  the owner row. There is no direct insert path, so a partner can never end
--  up with a business nobody owns.
drop policy if exists "partners: edit your own" on partners;
create policy "partners: edit your own" on partners
  for update to authenticated
  using (public.is_partner_admin(id))
  with check (public.is_partner_admin(id));

drop policy if exists "partner members: your team" on partner_members;
create policy "partner members: your team" on partner_members
  for select to authenticated
  using (public.is_partner_member(partner_id) or public.is_admin());

drop policy if exists "partner members: owners manage the team" on partner_members;
create policy "partner members: owners manage the team" on partner_members
  for all to authenticated
  using (public.is_partner_owner(partner_id))
  with check (public.is_partner_owner(partner_id));

-- ─── locations ────────────────────────────────────────────────────────────

drop policy if exists "locations: yours, or a live one" on partner_locations;
create policy "locations: yours, or a live one" on partner_locations
  for select to authenticated
  using (
    public.is_partner_member(partner_id)
    or public.is_admin()
    or public.partner_is_live(partner_id)
  );

drop policy if exists "locations: manage your own" on partner_locations;
create policy "locations: manage your own" on partner_locations
  for all to authenticated
  using (public.is_partner_admin(partner_id))
  with check (public.is_partner_admin(partner_id));

-- ─── date spots ───────────────────────────────────────────────────────────
--  Replaces the blanket read. A student sees published spots; a partner also
--  sees its own unpublished draft so the editor's live preview works.

drop policy if exists "reference: read" on date_spots;
drop policy if exists "spots: published, plus your own" on date_spots;
create policy "spots: published, plus your own" on date_spots
  for select to authenticated
  using (
    public.is_admin()
    or (partner_id is not null and public.is_partner_member(partner_id))
    or (
      is_published
      and (partner_id is null or public.partner_is_live(partner_id))
    )
  );

drop policy if exists "spots: partners manage their own" on date_spots;
create policy "spots: partners manage their own" on date_spots
  for all to authenticated
  using (partner_id is not null and public.is_partner_admin(partner_id))
  with check (partner_id is not null and public.is_partner_admin(partner_id));

-- ─── subscriptions ────────────────────────────────────────────────────────
--  Readable by the business, writable by nobody holding an anon key. The
--  webhook handler uses the service role, which bypasses RLS entirely.

drop policy if exists "subscriptions: read your own" on partner_subscriptions;
create policy "subscriptions: read your own" on partner_subscriptions
  for select to authenticated
  using (public.is_partner_admin(partner_id) or public.is_admin());

drop policy if exists "billing events: staff only" on partner_billing_events;
create policy "billing events: staff only" on partner_billing_events
  for select to authenticated using (public.is_admin());

-- ─── offers ───────────────────────────────────────────────────────────────

drop policy if exists "offers: yours, or a live one" on partner_offers;
create policy "offers: yours, or a live one" on partner_offers
  for select to authenticated
  using (
    public.is_partner_member(partner_id)
    or public.is_admin()
    or (status = 'active' and public.partner_is_live(partner_id)
        and public.partner_has(partner_id, 'offers'))
  );

drop policy if exists "offers: manage your own" on partner_offers;
create policy "offers: manage your own" on partner_offers
  for all to authenticated
  using (public.is_partner_admin(partner_id))
  with check (public.is_partner_admin(partner_id));

-- ─── date passes ──────────────────────────────────────────────────────────
--
--  Read it and note what is absent: there is no partner policy here. A
--  business cannot select from this table under any role it can obtain. The
--  only way a partner learns anything about a pass is
--  partner_lookup_pass(code), which is security definer and returns four
--  columns, none of which is a person.

drop policy if exists "passes: the person holding it" on date_passes;
create policy "passes: the person holding it" on date_passes
  for select to authenticated
  using (issued_to = auth.uid() or public.is_admin());

--  Issued through issue_date_pass() so the expiry, the limits, and the
--  one-live-pass rule are applied server-side. No direct insert.

drop policy if exists "redemptions: the business that earned it" on date_pass_redemptions;
create policy "redemptions: the business that earned it" on date_pass_redemptions
  for select to authenticated
  using (public.is_partner_member(partner_id) or public.is_admin());

-- ─── measurement ──────────────────────────────────────────────────────────
--  `recommendation_events` names a viewer, so a partner never touches it.
--  Students read their own rows only, which is what powers "don't show me
--  that again".

drop policy if exists "recommendations: your own trail" on recommendation_events;
create policy "recommendations: your own trail" on recommendation_events
  for select to authenticated
  using (viewer = auth.uid() or public.is_admin());

drop policy if exists "partner events: staff only" on partner_events;
create policy "partner events: staff only" on partner_events
  for select to authenticated using (public.is_admin());

-- Partners read their funnel through partner_funnel(), which aggregates.

drop policy if exists "targeting: yours" on partner_targeting;
create policy "targeting: yours" on partner_targeting
  for select to authenticated
  using (public.is_partner_member(partner_id) or public.is_admin());

drop policy if exists "targeting: manage yours" on partner_targeting;
create policy "targeting: manage yours" on partner_targeting
  for all to authenticated
  using (public.is_partner_admin(partner_id) and public.partner_has(partner_id, 'targeting'))
  with check (public.is_partner_admin(partner_id) and public.partner_has(partner_id, 'targeting'));

-- ═══════════════════════════════════════════════════════════════════════════
--  Closing the campus-domain hole the partner path would otherwise open
-- ═══════════════════════════════════════════════════════════════════════════
--
--  The Before User Created hook has to allow non-.edu addresses now, or no
--  restaurant owner can make an account. That hook was the only thing keeping
--  a stranger off a campus, so before loosening it, move the real check onto
--  the profiles insert policy — where it is checked against the address in
--  the JWT, which the client does not get to choose.
--
--  This is strictly tighter than what came before: it also stops a Michigan
--  address from onboarding onto the MSU campus, which the old hook allowed.

create or replace function public.email_matches_campus(p_university uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from universities u
    where u.id = p_university
      and split_part(public.jwt_email(), '@', 2) = any (u.email_domains)
  );
$$;

drop policy if exists "profiles: create your own" on profiles;
create policy "profiles: create your own" on profiles
  for insert to authenticated
  with check (
    id = auth.uid()
    and public.email_matches_campus(university_id)
  );

--  A member profile and a partner account are mutually exclusive. Enforced
--  both ways so neither order of operations produces a hybrid.
create or replace function public.guard_account_kind()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'profiles' then
    if exists (select 1 from partner_users where id = new.id) then
      raise exception 'This address is already a Loose Leaf Partner account.';
    end if;
  else
    if exists (select 1 from profiles where id = new.id) then
      raise exception 'This address is already a Loose Leaf member account.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_account_kind on profiles;
create trigger profiles_guard_account_kind before insert on profiles
  for each row execute function public.guard_account_kind();

drop trigger if exists partner_users_guard_account_kind on partner_users;
create trigger partner_users_guard_account_kind before insert on partner_users
  for each row execute function public.guard_account_kind();

--  Now the hook can let a business through. A forged `account_type` in the
--  client-supplied metadata buys nothing: it creates an auth user that cannot
--  insert a profile (the policy above checks the real address) and cannot
--  become a partner without going through register_partner().
create or replace function public.restrict_signup_to_campus(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  addr    text;
  domain  text;
  kind    text;
  known   boolean;
begin
  addr := lower(trim(event -> 'user' ->> 'email'));
  kind := coalesce(
    event -> 'user' -> 'raw_user_meta_data' ->> 'account_type',
    event -> 'user' -> 'user_metadata' ->> 'account_type',
    'student');

  if addr is null or addr = '' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'An email address is required.',
        'http_code', 400
      )
    );
  end if;

  -- Businesses sign up with whatever address they actually use.
  if kind = 'partner' then
    return '{}'::jsonb;
  end if;

  domain := split_part(addr, '@', 2);

  select exists (
    select 1
    from public.universities u
    where domain = any (u.email_domains)
  ) into known;

  if not known then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Looseleaf isn''t on your campus yet. Sign up with your school email and we''ll get there.',
        'http_code', 403
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant execute on function public.restrict_signup_to_campus(jsonb) to supabase_auth_admin;
revoke execute on function public.restrict_signup_to_campus(jsonb) from authenticated, anon, public;

-- ═══════════════════════════════════════════════════════════════════════════
--  Storage — partner media
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Public, unlike `profile-photos`, and the difference is the point: a
--  student's photo is a person and is served through short-lived signed URLs;
--  a restaurant's logo is a shopfront the business wants seen. Files live
--  under <partner-id>/…, so ownership is a path check.

insert into storage.buckets (id, name, public)
values ('partner-media', 'partner-media', true)
on conflict (id) do nothing;

drop policy if exists "partner media: anyone can view" on storage.objects;
create policy "partner media: anyone can view"
on storage.objects for select to anon, authenticated
using (bucket_id = 'partner-media');

drop policy if exists "partner media: your own business" on storage.objects;
create policy "partner media: your own business"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'partner-media'
  and public.is_partner_admin(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "partner media: replace your own" on storage.objects;
create policy "partner media: replace your own"
on storage.objects for update to authenticated
using (
  bucket_id = 'partner-media'
  and public.is_partner_admin(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "partner media: delete your own" on storage.objects;
create policy "partner media: delete your own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'partner-media'
  and public.is_partner_admin(((storage.foldername(name))[1])::uuid)
);

-- ─── grants ───────────────────────────────────────────────────────────────

grant select on partner_categories, date_types, date_vibes, partner_plans to anon, authenticated;
grant select, insert, update, delete on
  partner_users, partners, partner_members, partner_locations, partner_offers,
  partner_targeting, date_spots to authenticated;
grant select on partner_subscriptions, date_passes, date_pass_redemptions,
  recommendation_events, partner_events, partner_billing_events to authenticated;
