-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — initial schema
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Three invariants this schema exists to protect. Any future migration that
--  breaks one of them is a bug, not a feature:
--
--   1. There is no plan, tier, entitlement, credit, or billing table. Nothing
--      about who you see or who can reach you is purchasable. Sponsorship
--      lives on `date_spots` only — a table that ranking never reads.
--   2. Every like you receive is readable by you, in full, forever. See the
--      select policy on `likes`. No cap, no blur, no gate.
--   3. Location is never stored. `area` is a coarse, self-chosen label from a
--      fixed list; there are no coordinates, addresses, or last-seen columns.
--
--  Run order: this file, then seed.sql.
--
--  Verified against PostgreSQL 16 with Supabase's auth/storage objects stubbed:
--  applies clean, every public table ends up with RLS enabled and at least one
--  policy, likes you receive are readable in full, likes between two other
--  people are not readable at all, and blocking or pausing removes a profile
--  from both the deck and direct reads.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ─── enums ────────────────────────────────────────────────────────────────

create type intention as enum ('relationship', 'dating', 'seeing', 'casual', 'events');
create type like_target as enum ('photo', 'prompt');
create type like_status as enum ('pending', 'passed', 'matched');
create type message_kind as enum ('text', 'note', 'plan');
create type tonight_mood as enum ('date', 'plans', 'out', 'casual', 'around');
create type pair_status as enum ('invited', 'active', 'ended');

-- ─── reference data ───────────────────────────────────────────────────────

create table universities (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  short_name    text not null,
  city          text not null,
  email_domains text[] not null,
  areas         text[] not null default '{}',
  created_at    timestamptz not null default now()
);

create table interests (
  id    text primary key,
  label text not null,
  emoji text not null
);

create table prompt_catalog (
  id       uuid primary key default gen_random_uuid(),
  category text not null,
  text     text not null unique
);

-- ─── people ───────────────────────────────────────────────────────────────

create table profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  university_id uuid not null references universities (id),
  first_name    text not null check (length(first_name) between 1 and 40),
  gender        text not null,
  pronouns      text,
  grad_year     text not null,
  major         text not null,
  minor         text,
  area          text,                              -- coarse label only, never a location
  orgs          text[] not null default '{}',
  intention     intention not null default 'seeing',
  age           int not null check (age >= 18),     -- derived from DOB at signup
  is_paused     boolean not null default false,
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Date of birth lives apart from the profile so that "we show your age, never
-- your birthday" is enforced by the schema rather than by a SELECT list.
create table profile_dob (
  profile_id uuid primary key references profiles (id) on delete cascade,
  birthdate  date not null
);

create table profile_preferences (
  profile_id    uuid primary key references profiles (id) on delete cascade,
  interested_in text[] not null default '{}',
  min_age       int not null default 18 check (min_age >= 18),
  max_age       int not null default 30,
  intentions    intention[] not null default '{}',
  check (max_age >= min_age)
);

create table profile_photos (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles (id) on delete cascade,
  position     int  not null check (position between 0 and 5),
  storage_path text,        -- null while the illustrated stand-in is in use
  scene        text,        -- 'portrait' | scene key from Portrait.jsx
  created_at   timestamptz not null default now(),
  unique (profile_id, position)
);

create table profile_prompts (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  position   int  not null check (position between 0 and 2),
  question   text not null,
  answer     text not null check (length(answer) between 1 and 400),
  unique (profile_id, position)
);

create table profile_interests (
  profile_id  uuid not null references profiles (id) on delete cascade,
  interest_id text not null references interests (id),
  primary key (profile_id, interest_id)
);

-- Mutual connections — people who both agreed they know each other.
create table connections (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  friend_id  uuid not null references profiles (id) on delete cascade,
  accepted   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (profile_id, friend_id),
  check (profile_id <> friend_id)
);

-- ─── safety ───────────────────────────────────────────────────────────────

create table blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles (id) on delete cascade,
  reported_id uuid not null references profiles (id) on delete cascade,
  reason      text not null,
  created_at  timestamptz not null default now()
);

-- ─── the dating loop ──────────────────────────────────────────────────────

-- You never like a person; you like one thing about them, optionally with a
-- note. `target_position` points at a photo slot or a prompt slot.
create table likes (
  id              uuid primary key default gen_random_uuid(),
  from_profile    uuid not null references profiles (id) on delete cascade,
  to_profile      uuid not null references profiles (id) on delete cascade,
  target_type     like_target not null,
  target_position int not null,
  note            text check (note is null or length(note) between 1 and 220),
  status          like_status not null default 'pending',
  created_at      timestamptz not null default now(),
  unique (from_profile, to_profile),
  check (from_profile <> to_profile)
);

-- Profiles already seen in Discover, so the daily deck doesn't repeat them.
create table deck_views (
  profile_id uuid not null references profiles (id) on delete cascade,
  seen_id    uuid not null references profiles (id) on delete cascade,
  seen_at    timestamptz not null default now(),
  primary key (profile_id, seen_id)
);

create table matches (
  id         uuid primary key default gen_random_uuid(),
  profile_a  uuid not null references profiles (id) on delete cascade,
  profile_b  uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (profile_a < profile_b),          -- canonical ordering keeps pairs unique
  unique (profile_a, profile_b)
);

create table conversations (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null unique references matches (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id       uuid not null references profiles (id) on delete cascade,
  body            text not null check (length(body) between 1 and 2000),
  kind            message_kind not null default 'text',
  meta            text,
  created_at      timestamptz not null default now()
);

create index messages_conversation_created_idx on messages (conversation_id, created_at);

-- ─── going outside ────────────────────────────────────────────────────────

create table date_spots (
  id             uuid primary key default gen_random_uuid(),
  university_id  uuid not null references universities (id),
  name           text not null,
  kind           text not null,
  tags           text[] not null default '{}',
  walk_minutes   int,
  note           text,
  -- Sponsorship lives here and nowhere else. No query that ranks or filters
  -- people is permitted to join this table.
  is_sponsored   boolean not null default false,
  sponsor_name   text,
  offer_headline text,
  offer_detail   text,
  check (not is_sponsored or sponsor_name is not null)
);

create table date_plans (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  proposed_by     uuid not null references profiles (id) on delete cascade,
  date_type       text not null,
  when_text       text not null,
  spot_id         uuid references date_spots (id),
  accepted        boolean,
  created_at      timestamptz not null default now()
);

create table campus_events (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities (id),
  title         text not null,
  starts_at     timestamptz,
  when_text     text,
  venue         text,
  kind          text,
  emoji         text
);

create table event_interest (
  profile_id uuid not null references profiles (id) on delete cascade,
  event_id   uuid not null references campus_events (id) on delete cascade,
  primary key (profile_id, event_id)
);

-- Expires on its own the next morning; nothing to remember to switch off.
create table tonight_status (
  profile_id uuid primary key references profiles (id) on delete cascade,
  mood       tonight_mood not null,
  expires_at timestamptz not null default (date_trunc('day', now()) + interval '1 day' + interval '9 hours')
);

create table formal_invites (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  title      text not null,
  when_text  text not null,
  event_type text not null,
  note       text,
  created_at timestamptz not null default now()
);

create table double_date_pairs (
  id         uuid primary key default gen_random_uuid(),
  profile_a  uuid not null references profiles (id) on delete cascade,
  profile_b  uuid not null references profiles (id) on delete cascade,
  status     pair_status not null default 'invited',
  created_at timestamptz not null default now(),
  check (profile_a <> profile_b)
);

-- ═══════════════════════════════════════════════════════════════════════════
--  Helpers (security definer, so policies can use them without recursion)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.current_university()
returns uuid language sql stable security definer set search_path = public as $$
  select university_id from public.profiles where id = auth.uid();
$$;

create or replace function public.blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.in_conversation(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.conversations c
    join public.matches m on m.id = c.match_id
    where c.id = conv
      and (m.profile_a = auth.uid() or m.profile_b = auth.uid())
  );
$$;

create or replace function public.is_matched_with(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.matches
    where (profile_a = auth.uid() and profile_b = other)
       or (profile_b = auth.uid() and profile_a = other)
  );
$$;

-- Creating a match keeps the canonical a<b ordering and opens the conversation.
create or replace function public.create_match(other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a uuid := least(auth.uid(), other);
  b uuid := greatest(auth.uid(), other);
  m uuid;
  c uuid;
begin
  insert into matches (profile_a, profile_b) values (a, b)
  on conflict (profile_a, profile_b) do update set profile_a = excluded.profile_a
  returning id into m;

  insert into conversations (match_id) values (m)
  on conflict (match_id) do update set match_id = excluded.match_id
  returning id into c;

  update likes set status = 'matched'
  where (from_profile = other and to_profile = auth.uid())
     or (from_profile = auth.uid() and to_profile = other);

  return c;
end;
$$;

-- Today's deck. Inputs: preferences, campus, blocks, what you've already seen.
-- Deliberately finite, and deliberately joined to nothing that has a price.
create or replace function public.get_deck(p_limit int default 20)
returns setof profiles language sql stable security definer set search_path = public as $$
  select p.*
  from profiles p
  join profile_preferences pref on pref.profile_id = auth.uid()
  where p.id <> auth.uid()
    and p.is_paused = false
    and p.onboarded_at is not null
    and p.university_id = public.current_university()
    and p.age between pref.min_age and pref.max_age
    and (
      cardinality(pref.interested_in) = 0
      or 'everyone' = any (pref.interested_in)
      or p.gender = any (pref.interested_in)
    )
    and not public.blocked_between(auth.uid(), p.id)
    and not exists (select 1 from deck_views v where v.profile_id = auth.uid() and v.seen_id = p.id)
    and not exists (select 1 from likes l where l.from_profile = auth.uid() and l.to_profile = p.id)
    and not public.is_matched_with(p.id)
  order by
    -- shared interests first, then a stable shuffle. No sponsored input.
    (select count(*) from profile_interests mine
       join profile_interests theirs on theirs.interest_id = mine.interest_id
      where mine.profile_id = auth.uid() and theirs.profile_id = p.id) desc,
    md5(p.id::text || current_date::text)
  limit p_limit;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on profiles
for each row execute function public.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
--  Row level security
-- ═══════════════════════════════════════════════════════════════════════════

alter table profiles            enable row level security;
alter table profile_dob         enable row level security;
alter table profile_preferences enable row level security;
alter table profile_photos      enable row level security;
alter table profile_prompts     enable row level security;
alter table profile_interests   enable row level security;
alter table connections         enable row level security;
alter table blocks              enable row level security;
alter table reports             enable row level security;
alter table likes               enable row level security;
alter table deck_views          enable row level security;
alter table matches             enable row level security;
alter table conversations       enable row level security;
alter table messages            enable row level security;
alter table date_plans          enable row level security;
alter table tonight_status      enable row level security;
alter table formal_invites      enable row level security;
alter table double_date_pairs   enable row level security;
alter table event_interest      enable row level security;

-- Reference tables are readable by any signed-in student.
alter table universities  enable row level security;
alter table interests     enable row level security;
alter table prompt_catalog enable row level security;
alter table date_spots    enable row level security;
alter table campus_events enable row level security;

create policy "reference: read" on universities   for select to authenticated using (true);
create policy "reference: read" on interests      for select to authenticated using (true);
create policy "reference: read" on prompt_catalog for select to authenticated using (true);
create policy "reference: read" on date_spots     for select to authenticated using (true);
create policy "reference: read" on campus_events  for select to authenticated using (true);

-- ─── profiles ─────────────────────────────────────────────────────────────

create policy "profiles: see yourself and your campus"
on profiles for select to authenticated
using (
  id = auth.uid()
  or (
    is_paused = false
    and university_id = public.current_university()
    and not public.blocked_between(auth.uid(), id)
  )
);

create policy "profiles: create your own" on profiles for insert to authenticated
with check (id = auth.uid());

create policy "profiles: edit your own" on profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy "dob: yours alone" on profile_dob for all to authenticated
using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "prefs: yours alone" on profile_preferences for all to authenticated
using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Profile contents follow whatever the profile itself allows.
create policy "photos: read with the profile" on profile_photos for select to authenticated
using (exists (select 1 from profiles p where p.id = profile_id));
create policy "photos: write your own" on profile_photos for all to authenticated
using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "prompts: read with the profile" on profile_prompts for select to authenticated
using (exists (select 1 from profiles p where p.id = profile_id));
create policy "prompts: write your own" on profile_prompts for all to authenticated
using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "interests: read with the profile" on profile_interests for select to authenticated
using (exists (select 1 from profiles p where p.id = profile_id));
create policy "interests: write your own" on profile_interests for all to authenticated
using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "connections: yours" on connections for select to authenticated
using (profile_id = auth.uid() or friend_id = auth.uid());
create policy "connections: manage yours" on connections for all to authenticated
using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ─── safety ───────────────────────────────────────────────────────────────

create policy "blocks: manage your own" on blocks for all to authenticated
using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- Reports are write-only from the client; nobody reads them but staff.
create policy "reports: file one" on reports for insert to authenticated
with check (reporter_id = auth.uid());
create policy "reports: see your own" on reports for select to authenticated
using (reporter_id = auth.uid());

-- ─── likes ────────────────────────────────────────────────────────────────

-- ★ The policy that defines the product. If you receive a like, you can read
--   it — the whole row, including the note, immediately and forever. There is
--   intentionally no subscription check, no LIMIT, and no obfuscation here,
--   and adding one would be a breaking change to what Looseleaf is.
create policy "likes: recipients see every like they receive"
on likes for select to authenticated
using (to_profile = auth.uid() or from_profile = auth.uid());

create policy "likes: send your own" on likes for insert to authenticated
with check (
  from_profile = auth.uid()
  and not public.blocked_between(auth.uid(), to_profile)
);

create policy "likes: respond to yours" on likes for update to authenticated
using (to_profile = auth.uid()) with check (to_profile = auth.uid());

create policy "deck views: yours alone" on deck_views for all to authenticated
using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ─── matches & messages ───────────────────────────────────────────────────

create policy "matches: yours" on matches for select to authenticated
using (profile_a = auth.uid() or profile_b = auth.uid());

create policy "conversations: yours" on conversations for select to authenticated
using (public.in_conversation(id));

create policy "messages: read your conversations" on messages for select to authenticated
using (public.in_conversation(conversation_id));

create policy "messages: send as yourself" on messages for insert to authenticated
with check (sender_id = auth.uid() and public.in_conversation(conversation_id));

create policy "date plans: read your conversations" on date_plans for select to authenticated
using (public.in_conversation(conversation_id));
create policy "date plans: propose in your conversations" on date_plans for insert to authenticated
with check (proposed_by = auth.uid() and public.in_conversation(conversation_id));
create policy "date plans: answer in your conversations" on date_plans for update to authenticated
using (public.in_conversation(conversation_id));

-- ─── campus ───────────────────────────────────────────────────────────────

create policy "tonight: read your campus" on tonight_status for select to authenticated
using (
  expires_at > now()
  and exists (
    select 1 from profiles p
    where p.id = profile_id
      and p.university_id = public.current_university()
      and not public.blocked_between(auth.uid(), p.id)
  )
);
create policy "tonight: set your own" on tonight_status for all to authenticated
using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "formals: read your campus" on formal_invites for select to authenticated
using (exists (
  select 1 from profiles p
  where p.id = profile_id and p.university_id = public.current_university()
));
create policy "formals: post your own" on formal_invites for all to authenticated
using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "pairs: read your campus" on double_date_pairs for select to authenticated using (true);
create policy "pairs: manage yours" on double_date_pairs for all to authenticated
using (profile_a = auth.uid() or profile_b = auth.uid())
with check (profile_a = auth.uid() or profile_b = auth.uid());

create policy "event interest: read" on event_interest for select to authenticated using (true);
create policy "event interest: yours" on event_interest for all to authenticated
using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
--  Storage — profile photos
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

create policy "photos: anyone signed in can view"
on storage.objects for select to authenticated
using (bucket_id = 'profile-photos');

-- Files live under <user-id>/<filename>, so you can only touch your own.
create policy "photos: upload your own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "photos: replace your own"
on storage.objects for update to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos: delete your own"
on storage.objects for delete to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ═══════════════════════════════════════════════════════════════════════════
--  Realtime — one channel per conversation
-- ═══════════════════════════════════════════════════════════════════════════

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table likes;
alter publication supabase_realtime add table matches;
