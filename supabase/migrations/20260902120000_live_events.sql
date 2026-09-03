-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Live Events — timed, rotating, in-person sessions                       ║
-- ║  Plan: docs/LIVE-EVENTS.md                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
--  A club prints a QR code, forty people scan it, and their phones tell them
--  where to sit and for how long. The format is speed dating. What the room is
--  *for* is the host's business: a dating night, a rush mixer, a dorm-floor
--  icebreaker. Mechanics fixed, purpose configured.
--
--  ── The idea that shapes this whole file ─────────────────────────────────
--
--  A participant is a **verified campus account with no dating profile**. They
--  sign in through the same email-OTP path as everybody else — same Before
--  User Created hook, same campus gating — and get an `auth.users` row and no
--  `profiles` row. That is what lets a rush at a professional fraternity join
--  a Looseleaf event in ninety seconds without being asked to describe their
--  ideal Sunday, and it is what makes "log back in later and build a profile"
--  a login rather than a migration.
--
--  So nothing in here may assume `profiles`. `live_event_participants.user_id`
--  points at `auth.users`; `profile_id` is a nullable convenience that gets
--  filled in if and when they become a member.
--
--  ── Three invariants, enforced here rather than in the UI ────────────────
--
--  1. NO ROSTER EXISTS. A participant can read their own rows and nothing
--     else. What they see of the person opposite comes from `event_state()`,
--     which hands back a first name plus only the answers the host marked
--     `show_to_partner`. There is no query in this file that returns a list of
--     who is in the room to anybody but the host and staff. This is the
--     no-directory rule from the main app, and it is the rule most at risk in
--     a feature about putting people in a room together.
--
--  2. A HOST SEES COUNTS, NEVER A VOTE. Not who said yes, not per-person
--     totals, not a match list. `host_event_summary()` returns aggregates and
--     structurally cannot return more.
--
--  3. A HOST NEVER SEES AN EMAIL ADDRESS. Clubs will ask for the list. The
--     answer is no. `host_roster()` hand-writes its select list the way
--     `partner_lookup_pass()` does, and a host who wants to reach the room
--     does it through `host_broadcast()`.

-- ──────────────────────────────────────────────────────────────────────────
--  Enums
-- ──────────────────────────────────────────────────────────────────────────

do $$ begin
  create type host_status as enum ('pending', 'approved', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type live_event_status as enum
    ('draft', 'pending', 'approved', 'running', 'paused', 'ended', 'killed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_field_kind as enum
    ('short_text', 'choice', 'multi_choice', 'number', 'yes_no');
exception when duplicate_object then null; end $$;

-- ──────────────────────────────────────────────────────────────────────────
--  Hosts
--
--  Deliberately NOT `profiles`. A club president should not have to build a
--  dating profile to run a rush event, and a `partner_users` row is off the
--  table entirely — the partner platform's founding invariant is that a
--  partner is never a member, and bending it for a student host would turn a
--  structural guarantee into a rule somebody has to remember.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists event_hosts (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null check (length(full_name) between 1 and 80),
  org_name    text not null check (length(org_name) between 2 and 120),
  status      host_status not null default 'pending',
  review_note text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────
--  Events
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists live_events (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  host_id         uuid not null references event_hosts (user_id) on delete cascade,
  --  Phase 4: a Date Partner hosting a speed dating night. The column exists
  --  now so the pairing engine and every participant screen never has to learn
  --  about it later; nothing sets it yet.
  host_partner_id uuid references partners (id) on delete set null,
  university_id   uuid references universities (id),

  title       text not null check (length(title) between 2 and 90),
  blurb       text check (blurb is null or length(blurb) <= 400),
  --  A label a human typed. Not a location, not geocoded, and never will be.
  venue_label text check (venue_label is null or length(venue_label) <= 120),
  starts_at   timestamptz,

  status      live_event_status not null default 'draft',
  review_note text,

  -- ── format ──
  round_seconds  int not null default 240 check (round_seconds between 30 and 1800),
  break_seconds  int not null default 30  check (break_seconds between 0 and 600),
  planned_rounds int check (planned_rounds is null or planned_rounds between 1 and 40),
  advance        text not null default 'auto' check (advance in ('auto', 'manual')),
  pairing_mode   text not null default 'mixer'
                 check (pairing_mode in ('mixer', 'across', 'avoid_same')),
  split_field_id uuid,          -- fk added after live_event_fields exists
  station_count  int check (station_count is null or station_count between 1 and 60),

  -- ── modules ──
  likes_enabled boolean not null default true,
  reveal        text not null default 'end' check (reveal in ('end', 'live', 'never')),
  notes_enabled boolean not null default true,
  matches_revealed_at timestamptz,

  -- ── door ──
  join_opens text not null default 'anytime'
             check (join_opens in ('anytime', 'until_start', 'host_admits')),

  -- ── branding ──
  logo_path    text,
  accent       text not null default 'coral',
  welcome_line text check (welcome_line is null or length(welcome_line) <= 160),

  -- ── run state ──
  started_at timestamptz,
  ended_at   timestamptz,
  paused_at  timestamptz,
  broadcast  text check (broadcast is null or length(broadcast) <= 280),
  broadcast_at timestamptz,
  --  Stored so a regenerated round is reproducible rather than reshuffling
  --  the room every time somebody's phone asks what happens next.
  seed int not null default (floor(random() * 1000000))::int,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  --  Exactly one kind of host.
  constraint live_events_one_host check (host_partner_id is null)
);

create index if not exists live_events_host_idx on live_events (host_id);
create index if not exists live_events_status_idx on live_events (status);

--  Co-hosts: the exec board, so one person's dead phone doesn't end the night.
create table if not exists live_event_cohosts (
  event_id   uuid not null references live_events (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ──────────────────────────────────────────────────────────────────────────
--  Door questions
--
--  Five kinds and no more. This is the seam where a rotation timer quietly
--  becomes a general-purpose form builder, so the shape is deliberately mean:
--  a label, a kind, some options, and two switches that actually matter.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists live_event_fields (
  id       uuid primary key default gen_random_uuid(),
  event_id uuid not null references live_events (id) on delete cascade,
  position int not null check (position between 0 and 5),
  label    text not null check (length(label) between 1 and 60),
  kind     event_field_kind not null default 'short_text',
  options  text[] not null default '{}',
  required boolean not null default false,
  --  Feeds `pairing_mode`. Only meaningful on a choice field.
  use_for_pairing boolean not null default false,
  --  Does the person across the table see this answer? Off by default, always.
  show_to_partner boolean not null default false,
  unique (event_id, position)
);

do $$ begin
  alter table live_events
    add constraint live_events_split_field_fkey
    foreign key (split_field_id) references live_event_fields (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ──────────────────────────────────────────────────────────────────────────
--  Participants
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists live_event_participants (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references live_events (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  --  Filled if they are already a member, and backfilled by a trigger the
  --  moment they become one. Everything else works without it.
  profile_id   uuid references profiles (id) on delete set null,
  display_name text not null check (length(display_name) between 1 and 40),
  badge_no     int not null,
  state        text not null default 'waiting'
               check (state in ('waiting', 'active', 'left', 'removed')),
  bye_count    int not null default 0,
  last_station int,
  joined_at    timestamptz not null default now(),
  left_at      timestamptz,
  unique (event_id, user_id),
  unique (event_id, badge_no)
);

create index if not exists lep_event_state_idx on live_event_participants (event_id, state);
create index if not exists lep_user_idx on live_event_participants (user_id);
create index if not exists lep_profile_idx on live_event_participants (profile_id);

create table if not exists live_event_answers (
  participant_id uuid not null references live_event_participants (id) on delete cascade,
  field_id       uuid not null references live_event_fields (id) on delete cascade,
  value          text[] not null default '{}',
  primary key (participant_id, field_id)
);

-- ──────────────────────────────────────────────────────────────────────────
--  Rounds and pairings
--
--  The schedule is DATA, not a push event. Each round carries its own
--  `starts_at`/`ends_at` and every phone works out what round it is from the
--  server clock. A phone that loses signal for ninety seconds and comes back
--  is instantly right, with nothing to reconcile — which is the difference
--  between a feature that works in a basement and one that doesn't.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists live_event_rounds (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references live_events (id) on delete cascade,
  index      int not null check (index >= 1),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  created_at timestamptz not null default now(),
  unique (event_id, index)
);

create index if not exists ler_event_idx on live_event_rounds (event_id, index desc);

create table if not exists live_event_pairings (
  id       uuid primary key default gen_random_uuid(),
  round_id uuid not null references live_event_rounds (id) on delete cascade,
  event_id uuid not null references live_events (id) on delete cascade,
  a_participant uuid not null references live_event_participants (id) on delete cascade,
  b_participant uuid references live_event_participants (id) on delete cascade,
  station  int,
  bye      boolean not null default false,
  --  True when the engine had to re-seat a pair who had already met, because
  --  the alternative was stranding somebody. Surfaced to nobody; kept so the
  --  quality of a night's rotation can be looked at afterwards.
  repeat   boolean not null default false,
  check ((bye and b_participant is null) or (not bye and b_participant is not null)),
  check (b_participant is null or a_participant <> b_participant)
);

create unique index if not exists lep_pair_a_idx on live_event_pairings (round_id, a_participant);
create unique index if not exists lep_pair_b_idx on live_event_pairings (round_id, b_participant)
  where b_participant is not null;
create index if not exists lep_pair_event_idx on live_event_pairings (event_id);

-- ──────────────────────────────────────────────────────────────────────────
--  Votes and matches
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists live_event_votes (
  pairing_id uuid not null references live_event_pairings (id) on delete cascade,
  voter_id   uuid not null references live_event_participants (id) on delete cascade,
  yes        boolean not null,
  note       text check (note is null or length(note) <= 220),
  created_at timestamptz not null default now(),
  primary key (pairing_id, voter_id)
);

create table if not exists live_event_matches (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references live_events (id) on delete cascade,
  a_participant uuid not null references live_event_participants (id) on delete cascade,
  b_participant uuid not null references live_event_participants (id) on delete cascade,
  --  Set once BOTH sides have a dating profile — that is the moment the match
  --  can become a conversation. Until then it is a promise kept in this table.
  match_id   uuid references matches (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, a_participant, b_participant),
  check (a_participant <> b_participant)
);

-- ──────────────────────────────────────────────────────────────────────────
--  Helpers
--
--  SQL (not plpgsql) functions are parsed eagerly, so every helper is defined
--  above the first thing that calls it. That ordering is load-bearing.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.is_event_host()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_hosts where user_id = auth.uid());
$$;

--  Can the caller run this event? The host, a co-host, or staff. One function,
--  the way `partner_can()` is one function, so there is a single place to
--  read when the answer surprises somebody.
create or replace function public.event_host_can(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from live_events e
    where e.id = p_event
      and (
        e.host_id = auth.uid()
        or exists (
          select 1 from live_event_cohosts c
          where c.event_id = e.id and c.user_id = auth.uid()
        )
      )
  ) or public.is_admin();
$$;

--  The caller's participant row for an event, or null. Security definer so a
--  policy on `live_event_participants` can call it without recursing.
create or replace function public.my_participant(p_event uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from live_event_participants
  where event_id = p_event and user_id = auth.uid();
$$;

--  A short, unambiguous code. Crockford's base32 without I, L, O or U: no
--  1/I confusion, no 0/O confusion, and no accidental words. This gets read
--  aloud across a room and typed by somebody whose camera won't focus.
create or replace function public.new_event_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_code text;
  v_try  int := 0;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from live_events where code = v_code);
    v_try := v_try + 1;
    if v_try > 40 then
      raise exception 'Could not allocate an event code.';
    end if;
  end loop;
  return v_code;
end;
$$;

--  An event is joinable when it is approved or already running, the host's
--  door rule allows it, and it hasn't ended.
create or replace function public.event_join_open(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from live_events e
    where e.id = p_event
      and e.status in ('approved', 'running', 'paused')
      and (
        e.join_opens = 'anytime'
        or (e.join_opens = 'until_start' and e.started_at is null)
        or e.join_opens = 'host_admits'
      )
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────
--  RLS
--
--  Read the participant policies as one sentence: you can see your own row,
--  and the host can see the room. There is no third case, and that absence is
--  the no-roster rule.
-- ──────────────────────────────────────────────────────────────────────────

alter table event_hosts             enable row level security;
alter table live_events             enable row level security;
alter table live_event_cohosts      enable row level security;
alter table live_event_fields       enable row level security;
alter table live_event_participants enable row level security;
alter table live_event_answers      enable row level security;
alter table live_event_rounds       enable row level security;
alter table live_event_pairings     enable row level security;
alter table live_event_votes        enable row level security;
alter table live_event_matches      enable row level security;

drop policy if exists "event_hosts: yourself or staff" on event_hosts;
create policy "event_hosts: yourself or staff" on event_hosts
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "event_hosts: create your own" on event_hosts;
create policy "event_hosts: create your own" on event_hosts
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "event_hosts: edit your own" on event_hosts;
create policy "event_hosts: edit your own" on event_hosts
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  --  Status is moderation. Nobody approves themselves; `staff_set_host_status`
  --  is the only way it moves, and it is security definer.
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "live_events: hosts, participants, staff" on live_events;
create policy "live_events: hosts, participants, staff" on live_events
  for select to authenticated
  using (
    public.event_host_can(id)
    or public.my_participant(id) is not null
  );

drop policy if exists "live_events: hosts create" on live_events;
create policy "live_events: hosts create" on live_events
  for insert to authenticated
  with check (host_id = auth.uid() and public.is_event_host());

drop policy if exists "live_events: hosts edit" on live_events;
create policy "live_events: hosts edit" on live_events
  for update to authenticated
  using (public.event_host_can(id)) with check (public.event_host_can(id));

drop policy if exists "live_events: hosts delete drafts" on live_events;
create policy "live_events: hosts delete drafts" on live_events
  for delete to authenticated
  using (public.event_host_can(id) and status in ('draft', 'pending'));

drop policy if exists "cohosts: the event's people" on live_event_cohosts;
create policy "cohosts: the event's people" on live_event_cohosts
  for select to authenticated using (public.event_host_can(event_id));

drop policy if exists "cohosts: the host manages" on live_event_cohosts;
create policy "cohosts: the host manages" on live_event_cohosts
  for all to authenticated
  using (public.event_host_can(event_id)) with check (public.event_host_can(event_id));

--  Fields are readable by anyone in the room: they *are* the join form.
drop policy if exists "fields: the event's people" on live_event_fields;
create policy "fields: the event's people" on live_event_fields
  for select to authenticated
  using (public.event_host_can(event_id) or public.my_participant(event_id) is not null);

drop policy if exists "fields: the host writes" on live_event_fields;
create policy "fields: the host writes" on live_event_fields
  for all to authenticated
  using (public.event_host_can(event_id)) with check (public.event_host_can(event_id));

--  ★ The no-roster rule. Your own row, or the host's view of the room.
drop policy if exists "participants: yourself, or the host" on live_event_participants;
create policy "participants: yourself, or the host" on live_event_participants
  for select to authenticated
  using (user_id = auth.uid() or public.event_host_can(event_id));

drop policy if exists "participants: join yourself" on live_event_participants;
create policy "participants: join yourself" on live_event_participants
  for insert to authenticated
  with check (user_id = auth.uid() and public.event_join_open(event_id));

drop policy if exists "participants: edit yourself" on live_event_participants;
create policy "participants: edit yourself" on live_event_participants
  for update to authenticated
  using (user_id = auth.uid() or public.event_host_can(event_id))
  with check (user_id = auth.uid() or public.event_host_can(event_id));

--  Answers are the participant's own. A host reads them only in aggregate,
--  through an RPC; there is no policy that hands them a column of answers
--  with names attached.
drop policy if exists "answers: your own" on live_event_answers;
create policy "answers: your own" on live_event_answers
  for select to authenticated
  using (
    participant_id in (
      select id from live_event_participants where user_id = auth.uid()
    )
  );

drop policy if exists "answers: write your own" on live_event_answers;
create policy "answers: write your own" on live_event_answers
  for all to authenticated
  using (
    participant_id in (select id from live_event_participants where user_id = auth.uid())
  )
  with check (
    participant_id in (select id from live_event_participants where user_id = auth.uid())
  );

drop policy if exists "rounds: the event's people" on live_event_rounds;
create policy "rounds: the event's people" on live_event_rounds
  for select to authenticated
  using (public.event_host_can(event_id) or public.my_participant(event_id) is not null);

--  ★ Your pairings, not the room's. Reading this table tells you who *you* are
--  sitting with and nothing about anybody else's night.
drop policy if exists "pairings: your own, or the host's schedule" on live_event_pairings;
create policy "pairings: your own, or the host's schedule" on live_event_pairings
  for select to authenticated
  using (
    public.event_host_can(event_id)
    or a_participant = public.my_participant(event_id)
    or b_participant = public.my_participant(event_id)
  );

--  ★ A vote is yours alone. No host clause. No partner clause. The only way a
--  vote ever influences anything anybody can see is by becoming a match.
drop policy if exists "votes: your own only" on live_event_votes;
create policy "votes: your own only" on live_event_votes
  for select to authenticated
  using (voter_id in (select id from live_event_participants where user_id = auth.uid()));

drop policy if exists "votes: cast your own" on live_event_votes;
create policy "votes: cast your own" on live_event_votes
  for all to authenticated
  using (voter_id in (select id from live_event_participants where user_id = auth.uid()))
  with check (voter_id in (select id from live_event_participants where user_id = auth.uid()));

--  A match is readable by its two people once the host has revealed. Staff
--  can read them; the host cannot, and that is deliberate.
drop policy if exists "event matches: the two of you" on live_event_matches;
create policy "event matches: the two of you" on live_event_matches
  for select to authenticated
  using (
    public.is_admin()
    or (
      exists (
        select 1 from live_events e
        where e.id = event_id
          and (e.reveal = 'live' or e.matches_revealed_at is not null)
      )
      and (
        a_participant in (select id from live_event_participants where user_id = auth.uid())
        or b_participant in (select id from live_event_participants where user_id = auth.uid())
      )
    )
  );

-- ══════════════════════════════════════════════════════════════════════════
--  THE PAIRING ENGINE
--
--  The obvious implementation precomputes the whole round-robin when the host
--  presses Start. It breaks immediately, because the roster is never stable:
--  somebody arrives at round three, two people leave after round five, and one
--  is still waiting on their sign-in code. A precomputed schedule handles none
--  of that without a pile of special cases.
--
--  So the next round is computed from the roster *as it is now*, plus the set
--  of pairs who have already met. Late arrivals, walkouts and bathroom breaks
--  stop being special cases and become the ordinary input.
--
--  Randomized greedy with restarts, not blossom. At N ≤ 80 the difference in
--  match quality is nil and the difference in how much plpgsql there is to be
--  wrong about is enormous.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.generate_event_round(p_event uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ev        live_events;
  v_ids       uuid[];
  v_group     text[];
  v_byes      int[];
  v_station   int[];
  v_n         int;
  v_met       boolean[];         -- flattened n×n, index (i-1)*n + j
  v_best_pair int[];             -- best[i] = j, or 0
  v_best_rep  boolean[];
  v_best_score int := -1;
  v_pair      int[];
  v_rep       boolean[];
  v_score     int;
  v_order     int[];
  v_i int; v_j int; v_k int; v_a int; v_st int;
  v_ua uuid; v_ub uuid;
  v_cand int; v_cand_score int; v_best_cand int; v_best_cand_score int;
  v_matched int;
  v_repeats int;
  v_bye_cost int;
  v_forced_bye int;
  v_allowed boolean;
  v_round_id uuid;
  v_index   int;
  v_starts  timestamptz;
  v_stations_used boolean[];
  v_next_station int;
  v_split uuid;
  v_txt  text;
  v_num1 int;
  v_num2 int;
begin
  select * into v_ev from live_events where id = p_event for update;
  if not found then raise exception 'No such event.'; end if;

  v_split := v_ev.split_field_id;

  --  The room, in a stable order. `bye_count desc` first so that whoever has
  --  been sitting out gets first pick of a partner; the seeded shuffle breaks
  --  ties the same way every time this round is regenerated.
  select array_agg(p.id order by p.bye_count desc, md5(p.id::text || v_ev.seed::text))
    into v_ids
  from live_event_participants p
  where p.event_id = p_event and p.state in ('waiting', 'active');

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 2 then
    raise exception 'Not enough people here yet to start a round.';
  end if;

  --  Each person's answer on the split field, for `across` / `avoid_same`.
  --  Note the scalar hop: plpgsql will not SELECT INTO an array subscript.
  v_group := array_fill(''::text, array[v_n]);
  if v_split is not null then
    for v_i in 1..v_n loop
      select coalesce(a.value[1], '') into v_txt
      from live_event_answers a
      where a.participant_id = v_ids[v_i] and a.field_id = v_split;
      v_group[v_i] := coalesce(v_txt, '');
    end loop;
  end if;

  v_byes   := array_fill(0, array[v_n]);
  v_station := array_fill(0, array[v_n]);
  for v_i in 1..v_n loop
    select coalesce(p.bye_count, 0), coalesce(p.last_station, 0)
      into v_num1, v_num2
    from live_event_participants p where p.id = v_ids[v_i];
    v_byes[v_i]   := coalesce(v_num1, 0);
    v_station[v_i] := coalesce(v_num2, 0);
  end loop;

  --  Who has already met whom. Flattened because plpgsql's multidimensional
  --  array element assignment is fussier than it looks and this is hot.
  v_met := array_fill(false, array[v_n * v_n]);
  for v_ua, v_ub in
    select pr.a_participant, pr.b_participant
    from live_event_pairings pr
    where pr.event_id = p_event and pr.b_participant is not null
  loop
    v_i := array_position(v_ids, v_ua);
    v_j := array_position(v_ids, v_ub);
    if v_i is not null and v_j is not null then
      v_met[(v_i - 1) * v_n + v_j] := true;
      v_met[(v_j - 1) * v_n + v_i] := true;
    end if;
  end loop;

  --  ── who sits out, decided before the search, not by it ────────────────
  --
  --  An odd room means somebody is sitting out, and *which* somebody is a
  --  fairness question rather than a matching one. Leaving it to the greedy
  --  makes it a side effect of whoever happened to run out of partners, and
  --  that is how a person ends up sitting out twice before somebody else has
  --  sat out once — the one thing in a rotation people genuinely resent.
  --
  --  So the bye is chosen up front from whoever has had the fewest, and
  --  `max(bye_count) - min(bye_count) <= 1` holds by construction rather than
  --  by luck. Marked with -1, which reads as "taken" to the greedy.
  --
  --  `across` is left alone: there, leftovers are structural (four rushes and
  --  two actives leaves two people out no matter how fair you are about it).
  v_forced_bye := 0;
  if v_ev.pairing_mode <> 'across' and (v_n % 2) = 1 then
    select x into v_forced_bye
    from generate_series(1, v_n) as x
    order by v_byes[x] asc, random()
    limit 1;
  end if;

  -- ── restarts ───────────────────────────────────────────────────────────
  for v_k in 1..24 loop
    --  A fresh order each restart: people who have sat out most go first,
    --  everything else shuffled.
    select array_agg(x order by v_byes[x] desc, random()) into v_order
    from generate_series(1, v_n) as x;

    v_pair := array_fill(0, array[v_n]);
    v_rep  := array_fill(false, array[v_n]);
    v_repeats := 0;
    if v_forced_bye <> 0 then v_pair[v_forced_bye] := -1; end if;

    --  Strict pass: never repeat a pairing, honour the split rule.
    for v_i in 1..v_n loop
      v_a := v_order[v_i];
      continue when v_pair[v_a] <> 0;

      v_best_cand := 0;
      v_best_cand_score := -1;

      for v_j in 1..v_n loop
        v_cand := v_order[v_j];
        continue when v_cand = v_a or v_pair[v_cand] <> 0;
        continue when v_met[(v_a - 1) * v_n + v_cand];

        v_allowed := true;
        if v_ev.pairing_mode = 'across' and v_split is not null then
          --  Pair across different answers only. An unanswered field is not a
          --  group, so those people are never forced together.
          v_allowed := v_group[v_a] <> '' and v_group[v_cand] <> ''
                       and v_group[v_a] <> v_group[v_cand];
        end if;
        continue when not v_allowed;

        --  Prefer whoever has sat out most, then whoever can keep their seat.
        v_cand_score := v_byes[v_cand] * 100;
        if v_ev.pairing_mode = 'avoid_same' and v_split is not null
           and v_group[v_a] <> '' and v_group[v_a] = v_group[v_cand] then
          v_cand_score := v_cand_score - 500;
        end if;
        if v_station[v_cand] <> 0 and v_station[v_cand] = v_station[v_a] then
          v_cand_score := v_cand_score + 10;
        end if;

        if v_cand_score > v_best_cand_score then
          v_best_cand := v_cand;
          v_best_cand_score := v_cand_score;
        end if;
      end loop;

      if v_best_cand <> 0 then
        v_pair[v_a] := v_best_cand;
        v_pair[v_best_cand] := v_a;
      end if;
    end loop;

    --  Relaxed pass. Two people left over who have already met should sit
    --  together again rather than both get a bye — a repeat conversation is a
    --  worse round; two byes is a worse night. In `across` mode leftovers are
    --  expected (uneven groups) and stay as byes.
    if v_ev.pairing_mode <> 'across' then
      for v_i in 1..v_n loop
        v_a := v_order[v_i];
        continue when v_pair[v_a] <> 0;
        for v_j in 1..v_n loop
          v_cand := v_order[v_j];
          continue when v_cand = v_a or v_pair[v_cand] <> 0;
          v_pair[v_a] := v_cand;
          v_pair[v_cand] := v_a;
          v_rep[v_a] := true;
          v_rep[v_cand] := true;
          v_repeats := v_repeats + 1;
          exit;
        end loop;
      end loop;
    end if;

    --  Score the arrangement, and note what is being traded against what.
    --
    --  Seating everybody dominates: an unmatched person costs 1000. After
    --  that, an unfair bye costs far more than a repeated conversation —
    --  sitting out twice before somebody else has sat out once is the thing
    --  people actually notice and resent, and re-meeting somebody is a dull
    --  round rather than a bad night.
    --
    --  This belongs in the objective rather than in the ordering. Ordering by
    --  bye count makes a fair round *likely*; scoring for it makes a fair
    --  round *chosen*, which is the difference between a rotation that is
    --  usually fair and one that is.
    v_matched := 0;
    v_bye_cost := 0;
    for v_i in 1..v_n loop
      if v_pair[v_i] > 0 then v_matched := v_matched + 1;
      else v_bye_cost := v_bye_cost + v_byes[v_i];
      end if;
    end loop;

    v_score := v_matched * 1000 - v_bye_cost * 200 - v_repeats * 10;
    if v_score > v_best_score then
      v_best_score := v_score;
      v_best_pair := v_pair;
      v_best_rep := v_rep;
    end if;
  end loop;

  -- ── commit the round ───────────────────────────────────────────────────
  select coalesce(max(r.index), 0) + 1 into v_index
  from live_event_rounds r where r.event_id = p_event;

  v_starts := greatest(
    now(),
    coalesce(
      (select r.ends_at + make_interval(secs => v_ev.break_seconds)
         from live_event_rounds r
        where r.event_id = p_event order by r.index desc limit 1),
      now()
    )
  );

  insert into live_event_rounds (event_id, index, starts_at, ends_at)
  values (p_event, v_index, v_starts,
          v_starts + make_interval(secs => v_ev.round_seconds))
  returning id into v_round_id;

  --  Stations. Keep a pair where one of them already was, so half the room
  --  stays seated — the same feeling as the classic one-side-rotates event,
  --  without anybody having to be told which side they are on.
  v_stations_used := array_fill(false, array[greatest(v_n, 2)]);
  v_next_station := 1;

  for v_i in 1..v_n loop
    v_j := v_best_pair[v_i];
    continue when v_j > 0 and v_j < v_i;   -- each pair once, a<b by index

    if v_j <= 0 then
      insert into live_event_pairings (round_id, event_id, a_participant, bye)
      values (v_round_id, p_event, v_ids[v_i], true);
      update live_event_participants
         set bye_count = bye_count + 1, last_station = null, state = 'active'
       where id = v_ids[v_i];
    else
      v_st := 0;
      if v_station[v_i] between 1 and array_length(v_stations_used, 1)
         and not v_stations_used[v_station[v_i]] then
        v_st := v_station[v_i];
      elsif v_station[v_j] between 1 and array_length(v_stations_used, 1)
         and not v_stations_used[v_station[v_j]] then
        v_st := v_station[v_j];
      else
        while v_next_station <= array_length(v_stations_used, 1)
              and v_stations_used[v_next_station] loop
          v_next_station := v_next_station + 1;
        end loop;
        v_st := v_next_station;
      end if;
      if v_st >= 1 and v_st <= array_length(v_stations_used, 1) then
        v_stations_used[v_st] := true;
      end if;

      insert into live_event_pairings
        (round_id, event_id, a_participant, b_participant, station, repeat)
      values (v_round_id, p_event, v_ids[v_i], v_ids[v_j], v_st,
              coalesce(v_best_rep[v_i], false));

      update live_event_participants
         set last_station = v_st, state = 'active'
       where id in (v_ids[v_i], v_ids[v_j]);
    end if;
  end loop;

  return v_round_id;
end;
$$;

comment on function public.generate_event_round(uuid) is
  'Computes ONE round from the current roster and the already-met set. Never '
  'precompute the whole schedule: the roster is never stable.';

-- ══════════════════════════════════════════════════════════════════════════
--  Advancing
--
--  An event drives itself. `advance_event_if_due` is called at the top of
--  `event_state`, which every phone in the room is polling, so the next round
--  begins on time whether or not the host is looking at their screen. The
--  advisory lock plus the unique (event_id, index) index mean forty phones
--  arriving at the same millisecond produce one round, not forty.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.advance_event_if_due(p_event uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ev    live_events;
  v_last  live_event_rounds;
  v_count int;
  v_here  int;
begin
  select * into v_ev from live_events where id = p_event;
  if not found or v_ev.status <> 'running' or v_ev.advance <> 'auto' then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('live_event:' || p_event::text));

  --  Re-read inside the lock: another caller may have just advanced us.
  select * into v_ev from live_events where id = p_event;
  if v_ev.status <> 'running' then return; end if;

  select * into v_last from live_event_rounds
   where event_id = p_event order by index desc limit 1;

  if found and now() < v_last.ends_at + make_interval(secs => v_ev.break_seconds) then
    return;   -- current round, or its break, is still running
  end if;

  select count(*) into v_count from live_event_rounds where event_id = p_event;

  if v_ev.planned_rounds is not null and v_count >= v_ev.planned_rounds then
    update live_events set status = 'ended', ended_at = now(), updated_at = now()
     where id = p_event;
    return;
  end if;

  select count(*) into v_here from live_event_participants
   where event_id = p_event and state in ('waiting', 'active');

  if v_here < 2 then
    --  Two people can hold a round. One cannot, and an empty room should end
    --  rather than spin generating byes forever.
    if v_count > 0 then
      update live_events set status = 'ended', ended_at = now(), updated_at = now()
       where id = p_event;
    end if;
    return;
  end if;

  perform public.generate_event_round(p_event);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
--  Matching
-- ══════════════════════════════════════════════════════════════════════════

--  Turn an event match into a real conversation — only possible once both
--  sides have a dating profile. Until then the row sits there being a promise,
--  which is exactly the thing that makes somebody build a profile.
create or replace function public.promote_event_match(p_row uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_pa uuid; v_pb uuid; v_a uuid; v_b uuid; v_match uuid;
begin
  select pa.profile_id, pb.profile_id into v_pa, v_pb
  from live_event_matches m
  join live_event_participants pa on pa.id = m.a_participant
  join live_event_participants pb on pb.id = m.b_participant
  where m.id = p_row;

  if v_pa is null or v_pb is null then return null; end if;

  v_a := least(v_pa, v_pb);
  v_b := greatest(v_pa, v_pb);

  insert into matches (profile_a, profile_b) values (v_a, v_b)
  on conflict (profile_a, profile_b) do update set profile_a = excluded.profile_a
  returning id into v_match;

  insert into conversations (match_id) values (v_match)
  on conflict (match_id) do nothing;

  update live_event_matches set match_id = v_match where id = p_row;
  return v_match;
end;
$$;

--  Called after each vote. A match exists the moment both sides have said yes;
--  whether either of them is *told* is the host's `reveal` setting, enforced in
--  the read policy above rather than by withholding the row.
create or replace function public.settle_event_pairing(p_pairing uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pr live_event_pairings;
  v_a boolean; v_b boolean;
  v_row uuid;
begin
  select * into v_pr from live_event_pairings where id = p_pairing;
  if not found or v_pr.b_participant is null then return; end if;

  select yes into v_a from live_event_votes
   where pairing_id = p_pairing and voter_id = v_pr.a_participant;
  select yes into v_b from live_event_votes
   where pairing_id = p_pairing and voter_id = v_pr.b_participant;

  if coalesce(v_a, false) and coalesce(v_b, false) then
    insert into live_event_matches (event_id, a_participant, b_participant)
    values (
      v_pr.event_id,
      least(v_pr.a_participant, v_pr.b_participant),
      greatest(v_pr.a_participant, v_pr.b_participant)
    )
    on conflict (event_id, a_participant, b_participant) do nothing
    returning id into v_row;

    if v_row is not null then
      perform public.promote_event_match(v_row);
    end if;
  end if;
end;
$$;

--  When somebody finally builds a profile, everything they did at an event
--  catches up with them: their participant rows learn their profile id, and
--  any match that was waiting on exactly this becomes a conversation.
create or replace function public.link_event_participation()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_row uuid;
begin
  update live_event_participants
     set profile_id = new.id
   where user_id = new.id and profile_id is null;

  for v_row in
    select m.id from live_event_matches m
    join live_event_participants a on a.id = m.a_participant
    join live_event_participants b on b.id = m.b_participant
    where m.match_id is null
      and (a.user_id = new.id or b.user_id = new.id)
      and a.profile_id is not null and b.profile_id is not null
  loop
    perform public.promote_event_match(v_row);
  end loop;

  return new;
end;
$$;

drop trigger if exists profiles_link_event_participation on profiles;
create trigger profiles_link_event_participation
  after insert on profiles
  for each row execute function public.link_event_participation();

-- ══════════════════════════════════════════════════════════════════════════
--  Host RPCs
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.register_event_host(
  p_full_name text,
  p_org_name  text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;

  --  A business already has a home. Sending a partner through here would put
  --  a `partner_users` row and an `event_hosts` row on one account and start
  --  the exact ambiguity the partner platform was built to avoid.
  if exists (select 1 from partner_users where id = v_uid) then
    raise exception 'This is a Loose Leaf for Partners account. Event hosting is separate.';
  end if;

  insert into event_hosts (user_id, email, full_name, org_name)
  values (v_uid, coalesce(public.jwt_email(), ''), trim(p_full_name), trim(p_org_name))
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        org_name  = excluded.org_name,
        updated_at = now();
end;
$$;

create or replace function public.my_host()
returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(h) - 'email'
  from event_hosts h where h.user_id = auth.uid();
$$;

create or replace function public.create_live_event(
  p_title text,
  p_blurb text default null,
  p_venue text default null,
  p_starts_at timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_uni uuid;
begin
  if not exists (select 1 from event_hosts where user_id = v_uid) then
    raise exception 'Register as a host first.';
  end if;
  if exists (select 1 from event_hosts where user_id = v_uid and status = 'suspended') then
    raise exception 'This host account is suspended.';
  end if;

  --  Which campus this belongs to, from the host's own address. Used by
  --  Backstage to sort the queue; the participants' own gating is the signup
  --  hook's job, not this column's.
  select u.id into v_uni from universities u
   where split_part(coalesce(public.jwt_email(), ''), '@', 2) = any (u.email_domains)
   limit 1;

  insert into live_events (code, host_id, university_id, title, blurb, venue_label, starts_at)
  values (public.new_event_code(), v_uid, v_uni, trim(p_title),
          nullif(trim(coalesce(p_blurb, '')), ''),
          nullif(trim(coalesce(p_venue, '')), ''), p_starts_at)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.update_live_event(
  p_event uuid,
  p_patch jsonb
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_status live_event_status;
begin
  if not public.event_host_can(p_event) then
    raise exception 'Not your event.';
  end if;

  select status into v_status from live_events where id = p_event;
  if v_status in ('ended', 'killed') then
    raise exception 'That event is over.';
  end if;

  update live_events set
    title          = coalesce(p_patch ->> 'title', title),
    blurb          = coalesce(p_patch ->> 'blurb', blurb),
    venue_label    = coalesce(p_patch ->> 'venue_label', venue_label),
    starts_at      = coalesce((p_patch ->> 'starts_at')::timestamptz, starts_at),
    round_seconds  = coalesce((p_patch ->> 'round_seconds')::int, round_seconds),
    break_seconds  = coalesce((p_patch ->> 'break_seconds')::int, break_seconds),
    planned_rounds = case when p_patch ? 'planned_rounds'
                          then (p_patch ->> 'planned_rounds')::int else planned_rounds end,
    advance        = coalesce(p_patch ->> 'advance', advance),
    pairing_mode   = coalesce(p_patch ->> 'pairing_mode', pairing_mode),
    split_field_id = case when p_patch ? 'split_field_id'
                          then (p_patch ->> 'split_field_id')::uuid else split_field_id end,
    station_count  = case when p_patch ? 'station_count'
                          then (p_patch ->> 'station_count')::int else station_count end,
    likes_enabled  = coalesce((p_patch ->> 'likes_enabled')::boolean, likes_enabled),
    reveal         = coalesce(p_patch ->> 'reveal', reveal),
    notes_enabled  = coalesce((p_patch ->> 'notes_enabled')::boolean, notes_enabled),
    join_opens     = coalesce(p_patch ->> 'join_opens', join_opens),
    logo_path      = case when p_patch ? 'logo_path'
                          then p_patch ->> 'logo_path' else logo_path end,
    accent         = coalesce(p_patch ->> 'accent', accent),
    welcome_line   = coalesce(p_patch ->> 'welcome_line', welcome_line),
    updated_at     = now()
  where id = p_event;
end;
$$;

--  Fields are replaced wholesale rather than patched. A host editing their
--  door questions is rearranging a short list, and a diff protocol for six
--  rows is more ways to be wrong than it is worth.
create or replace function public.set_event_fields(p_event uuid, p_fields jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_f jsonb;
  v_i int := 0;
  v_id uuid;
  v_split uuid;
begin
  if not public.event_host_can(p_event) then
    raise exception 'Not your event.';
  end if;
  if exists (select 1 from live_events where id = p_event and started_at is not null) then
    raise exception 'The questions are fixed once the event has started.';
  end if;
  if jsonb_array_length(p_fields) > 6 then
    raise exception 'Six questions is the limit. Ask fewer things at a door.';
  end if;

  delete from live_event_fields where event_id = p_event;

  for v_f in select * from jsonb_array_elements(p_fields) loop
    insert into live_event_fields
      (event_id, position, label, kind, options, required, use_for_pairing, show_to_partner)
    values (
      p_event, v_i,
      trim(v_f ->> 'label'),
      coalesce((v_f ->> 'kind')::event_field_kind, 'short_text'),
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(
           coalesce(v_f -> 'options', '[]'::jsonb)) as t(value)),
        '{}'::text[]),
      coalesce((v_f ->> 'required')::boolean, false),
      coalesce((v_f ->> 'use_for_pairing')::boolean, false),
      coalesce((v_f ->> 'show_to_partner')::boolean, false)
    )
    returning id into v_id;

    if coalesce((v_f ->> 'use_for_pairing')::boolean, false) and v_split is null then
      v_split := v_id;
    end if;
    v_i := v_i + 1;
  end loop;

  update live_events set split_field_id = v_split, updated_at = now()
   where id = p_event;
end;
$$;

create or replace function public.my_live_events()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', e.id, 'code', e.code, 'title', e.title, 'status', e.status,
      'starts_at', e.starts_at, 'venue_label', e.venue_label,
      'created_at', e.created_at, 'review_note', e.review_note,
      'accent', e.accent, 'logo_path', e.logo_path,
      'registered', (select count(*) from live_event_participants p where p.event_id = e.id),
      'checked_in', (select count(*) from live_event_participants p
                      where p.event_id = e.id and p.state in ('waiting', 'active'))
    ) as x
    from live_events e
    where e.host_id = auth.uid()
       or exists (select 1 from live_event_cohosts c
                   where c.event_id = e.id and c.user_id = auth.uid())
  ) t;
$$;

create or replace function public.host_event(p_event uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  if not public.event_host_can(p_event) then
    raise exception 'Not your event.';
  end if;

  select jsonb_build_object(
    'event', to_jsonb(e) - 'seed',
    'fields', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.position)
      from live_event_fields f where f.event_id = e.id), '[]'::jsonb),
    'host', (select jsonb_build_object('org_name', h.org_name, 'full_name', h.full_name,
                                       'status', h.status)
               from event_hosts h where h.user_id = e.host_id)
  ) into v_out
  from live_events e where e.id = p_event;

  return v_out;
end;
$$;

create or replace function public.submit_live_event(p_event uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.event_host_can(p_event) then
    raise exception 'Not your event.';
  end if;
  update live_events set status = 'pending', review_note = null, updated_at = now()
   where id = p_event and status = 'draft';
end;
$$;

-- ── running it ────────────────────────────────────────────────────────────

create or replace function public.start_live_event(p_event uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_ev live_events; v_here int;
begin
  if not public.event_host_can(p_event) then raise exception 'Not your event.'; end if;

  select * into v_ev from live_events where id = p_event;
  if v_ev.status not in ('approved', 'paused') then
    raise exception 'This event is not ready to start.';
  end if;

  select count(*) into v_here from live_event_participants
   where event_id = p_event and state in ('waiting', 'active');
  if v_here < 2 then
    raise exception 'You need at least two people in the room.';
  end if;

  update live_events
     set status = 'running',
         started_at = coalesce(started_at, now()),
         paused_at = null,
         updated_at = now()
   where id = p_event;

  if not exists (select 1 from live_event_rounds where event_id = p_event) then
    perform public.generate_event_round(p_event);
  end if;
end;
$$;

create or replace function public.next_event_round(p_event uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_count int; v_planned int;
begin
  if not public.event_host_can(p_event) then raise exception 'Not your event.'; end if;

  select count(*), max(e.planned_rounds) into v_count, v_planned
  from live_event_rounds r right join live_events e on e.id = p_event
  where r.event_id = p_event or r.event_id is null;

  select count(*) into v_count from live_event_rounds where event_id = p_event;
  select planned_rounds into v_planned from live_events where id = p_event;

  if v_planned is not null and v_count >= v_planned then
    update live_events set status = 'ended', ended_at = now(), updated_at = now()
     where id = p_event;
    return;
  end if;

  --  Ending the current round early is the point of a manual advance: the
  --  room finished talking, so the clock should stop arguing about it.
  update live_event_rounds set ends_at = least(ends_at, now())
   where event_id = p_event
     and index = (select max(index) from live_event_rounds where event_id = p_event);

  perform public.generate_event_round(p_event);
end;
$$;

create or replace function public.pause_live_event(p_event uuid, p_paused boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.event_host_can(p_event) then raise exception 'Not your event.'; end if;
  if p_paused then
    update live_events set status = 'paused', paused_at = now(), updated_at = now()
     where id = p_event and status = 'running';
  else
    update live_events set status = 'running', paused_at = null, updated_at = now()
     where id = p_event and status = 'paused';
  end if;
end;
$$;

create or replace function public.end_live_event(p_event uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.event_host_can(p_event) then raise exception 'Not your event.'; end if;
  update live_events
     set status = 'ended', ended_at = now(), updated_at = now(),
         --  "Reveal at the end" means the end is a moment somebody chooses.
         --  Ending the event is that moment unless the host wanted the extra
         --  beat, and `reveal = 'never'` means never, full stop.
         matches_revealed_at = case when reveal = 'end' then coalesce(matches_revealed_at, now())
                                    else matches_revealed_at end
   where id = p_event;
end;
$$;

create or replace function public.reveal_event_matches(p_event uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.event_host_can(p_event) then raise exception 'Not your event.'; end if;
  update live_events set matches_revealed_at = coalesce(matches_revealed_at, now()),
                         updated_at = now()
   where id = p_event and reveal <> 'never';
end;
$$;

create or replace function public.host_broadcast(p_event uuid, p_text text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.event_host_can(p_event) then raise exception 'Not your event.'; end if;
  update live_events
     set broadcast = nullif(trim(p_text), ''), broadcast_at = now(), updated_at = now()
   where id = p_event;
end;
$$;

--  ★ The host's view of the room. Names, badges, state, and how many rounds
--  each person has had. No email address, no answers with a name attached, no
--  votes, no matches. Compare `partner_lookup_pass()`: the protection is the
--  hand-written select list, not a policy somebody might widen later.
create or replace function public.host_roster(p_event uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.event_host_can(p_event) then
    raise exception 'Not your event.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.display_name,
      'badge_no', p.badge_no,
      'state', p.state,
      'byes', p.bye_count,
      'station', p.last_station,
      'joined_at', p.joined_at
    ) order by p.badge_no)
    from live_event_participants p where p.event_id = p_event
  ), '[]'::jsonb);
end;
$$;

--  ★ Aggregates only. There is no argument that widens this into a list.
create or replace function public.host_event_summary(p_event uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  if not public.event_host_can(p_event) then
    raise exception 'Not your event.';
  end if;

  select jsonb_build_object(
    'registered', (select count(*) from live_event_participants where event_id = p_event),
    'here',       (select count(*) from live_event_participants
                    where event_id = p_event and state in ('waiting', 'active')),
    'left',       (select count(*) from live_event_participants
                    where event_id = p_event and state = 'left'),
    'rounds',     (select count(*) from live_event_rounds where event_id = p_event),
    'conversations', (select count(*) from live_event_pairings
                       where event_id = p_event and bye = false),
    'byes',       (select count(*) from live_event_pairings
                    where event_id = p_event and bye = true),
    'matches',    (select count(*) from live_event_matches where event_id = p_event),
    'members',    (select count(*) from live_event_participants
                    where event_id = p_event and profile_id is not null)
  ) into v_out;

  return v_out;
end;
$$;

create or replace function public.host_remove_participant(p_event uuid, p_participant uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.event_host_can(p_event) then raise exception 'Not your event.'; end if;
  update live_event_participants
     set state = 'removed', left_at = now()
   where id = p_participant and event_id = p_event;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
--  Participant RPCs
-- ══════════════════════════════════════════════════════════════════════════

--  What a poster promises. Readable signed out, because the whole point of
--  pre-registration is that somebody taps the link from a GroupMe on Tuesday
--  and verifies their email on their own wifi rather than in a queue.
--
--  Note what it does NOT return: any count of who is coming, anything about
--  who is in the room. A marketing preview is not a roster either.
create or replace function public.event_preview(p_code text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id,
    'code', e.code,
    'title', e.title,
    'blurb', e.blurb,
    'venue_label', e.venue_label,
    'starts_at', e.starts_at,
    'status', e.status,
    'accent', e.accent,
    'logo_path', e.logo_path,
    'welcome_line', e.welcome_line,
    'org_name', (select h.org_name from event_hosts h where h.user_id = e.host_id),
    'join_open', public.event_join_open(e.id),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'label', f.label, 'kind', f.kind,
        'options', f.options, 'required', f.required
      ) order by f.position)
      from live_event_fields f where f.event_id = e.id), '[]'::jsonb)
  )
  from live_events e
  where e.code = upper(trim(p_code))
    and e.status in ('approved', 'running', 'paused', 'ended');
$$;

create or replace function public.join_live_event(
  p_code    text,
  p_name    text,
  p_answers jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_ev    live_events;
  v_id    uuid;
  v_badge int;
  v_key   text;
  v_field live_event_fields;
  v_vals  text[];
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;

  select * into v_ev from live_events where code = upper(trim(p_code));
  if not found then raise exception 'No event with that code.'; end if;

  if exists (select 1 from partner_users where id = v_uid) then
    raise exception 'Partner accounts can''t join an event as a guest.';
  end if;

  --  Already in? Then this is a returning phone, not a second person.
  select id into v_id from live_event_participants
   where event_id = v_ev.id and user_id = v_uid;

  if v_id is null then
    if not public.event_join_open(v_ev.id) then
      raise exception 'Joining is closed for this event.';
    end if;

    select coalesce(max(p.badge_no), 0) + 1 into v_badge
    from live_event_participants p where p.event_id = v_ev.id;

    insert into live_event_participants
      (event_id, user_id, profile_id, display_name, badge_no)
    values (
      v_ev.id, v_uid,
      (select id from profiles where id = v_uid),
      nullif(trim(p_name), ''),
      v_badge
    )
    returning id into v_id;
  else
    update live_event_participants
       set display_name = coalesce(nullif(trim(p_name), ''), display_name),
           state = case when state = 'left' then 'waiting' else state end,
           left_at = null
     where id = v_id;
  end if;

  --  Answers, keyed by field id. Anything not a field on this event is
  --  dropped rather than stored — a client should not be able to write rows
  --  into a table by inventing keys.
  for v_key in select jsonb_object_keys(coalesce(p_answers, '{}'::jsonb)) loop
    select * into v_field from live_event_fields
     where event_id = v_ev.id and id = v_key::uuid;
    continue when not found;

    if jsonb_typeof(p_answers -> v_key) = 'array' then
      select coalesce(array_agg(t.value), '{}'::text[]) into v_vals
      from jsonb_array_elements_text(p_answers -> v_key) as t(value);
    else
      v_vals := array[p_answers ->> v_key];
    end if;

    insert into live_event_answers (participant_id, field_id, value)
    values (v_id, v_field.id, coalesce(v_vals, '{}'::text[]))
    on conflict (participant_id, field_id) do update set value = excluded.value;
  end loop;

  --  Required questions are checked here, not only in the form, because the
  --  form is a client and this is the door.
  if exists (
    select 1 from live_event_fields f
    where f.event_id = v_ev.id and f.required
      and not exists (
        select 1 from live_event_answers a
        where a.participant_id = v_id and a.field_id = f.id
          and cardinality(a.value) > 0 and a.value[1] <> ''
      )
  ) then
    raise exception 'Answer the questions marked required.';
  end if;

  return v_id;
end;
$$;

create or replace function public.leave_live_event(p_event uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update live_event_participants
     set state = 'left', left_at = now()
   where event_id = p_event and user_id = auth.uid();
end;
$$;

--  ★ The one endpoint every phone in the room polls.
--
--  Returns jsonb rather than a composite: this shape will change, and
--  `create or replace function` cannot change a return type — which has
--  already cost this codebase a `drop function` once.
--
--  Note the partner block. It is built from a first name plus exactly the
--  answers the host marked `show_to_partner`, and it is the ONLY way one
--  participant learns anything about another. No roster, one seat at a time.
create or replace function public.event_state(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ev      live_events;
  v_me      live_event_participants;
  v_round   live_event_rounds;
  v_pair    live_event_pairings;
  v_other   live_event_participants;
  v_vote_pair uuid;
  v_vote_name text;
  v_out     jsonb;
  v_revealed boolean;
begin
  select * into v_ev from live_events where code = upper(trim(p_code));
  if not found then raise exception 'No event with that code.'; end if;

  --  The event drives itself: whoever asks first starts the next round. The
  --  host's screen being asleep must not stop the room.
  perform public.advance_event_if_due(v_ev.id);
  select * into v_ev from live_events where id = v_ev.id;

  select * into v_me from live_event_participants
   where event_id = v_ev.id and user_id = auth.uid();

  if not found then
    return jsonb_build_object(
      'event', public.event_preview(v_ev.code),
      'me', null,
      'now', now()
    );
  end if;

  select * into v_round from live_event_rounds
   where event_id = v_ev.id order by index desc limit 1;

  if v_round.id is not null then
    select * into v_pair from live_event_pairings
     where round_id = v_round.id
       and (a_participant = v_me.id or b_participant = v_me.id);
  end if;

  if v_pair.id is not null and not v_pair.bye then
    select * into v_other from live_event_participants
     where id = case when v_pair.a_participant = v_me.id
                     then v_pair.b_participant else v_pair.a_participant end;
  end if;

  --  The most recent pairing this person hasn't voted on. Voting stays open
  --  during the round as well as the break: somebody who knows at ninety
  --  seconds shouldn't have to wait for a bell to say so.
  if v_ev.likes_enabled then
    select pr.id,
           (select p2.display_name from live_event_participants p2
             where p2.id = case when pr.a_participant = v_me.id
                                then pr.b_participant else pr.a_participant end)
      into v_vote_pair, v_vote_name
    from live_event_pairings pr
    join live_event_rounds r on r.id = pr.round_id
    where pr.event_id = v_ev.id
      and pr.bye = false
      and (pr.a_participant = v_me.id or pr.b_participant = v_me.id)
      and not exists (
        select 1 from live_event_votes v
        where v.pairing_id = pr.id and v.voter_id = v_me.id
      )
    order by r.index desc limit 1;
  end if;

  v_revealed := v_ev.reveal = 'live'
                or (v_ev.matches_revealed_at is not null and v_ev.reveal <> 'never');

  v_out := jsonb_build_object(
    'now', now(),
    'event', jsonb_build_object(
      'id', v_ev.id, 'code', v_ev.code, 'title', v_ev.title,
      'status', v_ev.status, 'accent', v_ev.accent, 'logo_path', v_ev.logo_path,
      'welcome_line', v_ev.welcome_line, 'venue_label', v_ev.venue_label,
      'round_seconds', v_ev.round_seconds, 'break_seconds', v_ev.break_seconds,
      'planned_rounds', v_ev.planned_rounds,
      'likes_enabled', v_ev.likes_enabled, 'notes_enabled', v_ev.notes_enabled,
      'reveal', v_ev.reveal, 'revealed', v_revealed,
      'broadcast', v_ev.broadcast, 'broadcast_at', v_ev.broadcast_at,
      'org_name', (select h.org_name from event_hosts h where h.user_id = v_ev.host_id)
    ),
    'me', jsonb_build_object(
      'participant_id', v_me.id, 'name', v_me.display_name,
      'badge_no', v_me.badge_no, 'state', v_me.state,
      'has_profile', v_me.profile_id is not null
    ),
    'here', (select count(*) from live_event_participants
              where event_id = v_ev.id and state in ('waiting', 'active')),
    'round', case when v_round.id is null then null else jsonb_build_object(
      'index', v_round.index,
      'starts_at', v_round.starts_at,
      'ends_at', v_round.ends_at,
      'station', v_pair.station,
      'bye', coalesce(v_pair.bye, false),
      'pairing_id', v_pair.id,
      'partner', case when v_other.id is null then null else jsonb_build_object(
        'name', v_other.display_name,
        'badge_no', v_other.badge_no,
        'shown', coalesce((
          select jsonb_agg(jsonb_build_object(
            'label', f.label,
            'value', array_to_string(a.value, ', ')
          ) order by f.position)
          from live_event_answers a
          join live_event_fields f on f.id = a.field_id
          where a.participant_id = v_other.id
            and f.show_to_partner
            and cardinality(a.value) > 0
        ), '[]'::jsonb)
      ) end
    ) end,
    'pending_vote', case when v_vote_pair is null then null else jsonb_build_object(
      'pairing_id', v_vote_pair, 'name', v_vote_name) end,
    'matches', case when not v_revealed then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', other.display_name,
        'both_members', me2.profile_id is not null and other.profile_id is not null,
        'match_id', m.match_id
      ))
      from live_event_matches m
      join live_event_participants me2
        on me2.id = case when m.a_participant = v_me.id then m.a_participant
                         else m.b_participant end
      join live_event_participants other
        on other.id = case when m.a_participant = v_me.id then m.b_participant
                           else m.a_participant end
      where m.event_id = v_ev.id
        and (m.a_participant = v_me.id or m.b_participant = v_me.id)
    ), '[]'::jsonb) end,
    'met', (select count(*) from live_event_pairings pr
             where pr.event_id = v_ev.id and pr.bye = false
               and (pr.a_participant = v_me.id or pr.b_participant = v_me.id))
  );

  return v_out;
end;
$$;

create or replace function public.cast_event_vote(
  p_pairing uuid,
  p_yes     boolean,
  p_note    text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pr live_event_pairings;
  v_me uuid;
  v_likes boolean;
begin
  select * into v_pr from live_event_pairings where id = p_pairing;
  if not found then raise exception 'No such pairing.'; end if;

  select likes_enabled into v_likes from live_events where id = v_pr.event_id;
  if not v_likes then raise exception 'This event isn''t matching people.'; end if;

  v_me := public.my_participant(v_pr.event_id);
  if v_me is null or v_me not in (v_pr.a_participant, coalesce(v_pr.b_participant, v_me)) then
    raise exception 'That wasn''t your conversation.';
  end if;
  if v_me <> v_pr.a_participant and v_me <> v_pr.b_participant then
    raise exception 'That wasn''t your conversation.';
  end if;

  insert into live_event_votes (pairing_id, voter_id, yes, note)
  values (p_pairing, v_me, p_yes, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (pairing_id, voter_id) do update
    set yes = excluded.yes, note = excluded.note;

  perform public.settle_event_pairing(p_pairing);
end;
$$;

--  Somebody's own notes from the night, which is the whole feature for a club
--  that turned matching off. Their rows, nobody else's.
create or replace function public.my_event_notes(p_event uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', other.display_name,
    'note', v.note,
    'yes', v.yes,
    'round', r.index
  ) order by r.index), '[]'::jsonb)
  from live_event_votes v
  join live_event_pairings pr on pr.id = v.pairing_id
  join live_event_rounds r on r.id = pr.round_id
  join live_event_participants me on me.id = v.voter_id
  join live_event_participants other
    on other.id = case when pr.a_participant = v.voter_id
                       then pr.b_participant else pr.a_participant end
  where pr.event_id = p_event and me.user_id = auth.uid();
$$;

-- ══════════════════════════════════════════════════════════════════════════
--  Staff
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.staff_live_events()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'code', e.code, 'title', e.title, 'status', e.status,
      'starts_at', e.starts_at, 'venue_label', e.venue_label,
      'created_at', e.created_at, 'review_note', e.review_note,
      'host_name', h.full_name, 'org_name', h.org_name,
      'host_status', h.status,
      'likes_enabled', e.likes_enabled,
      'here', (select count(*) from live_event_participants p
                where p.event_id = e.id and p.state in ('waiting', 'active'))
    ) order by
      case e.status when 'pending' then 0 when 'running' then 1 else 2 end,
      e.created_at desc)
    from live_events e
    join event_hosts h on h.user_id = e.host_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.staff_set_live_event_status(
  p_event  uuid,
  p_status live_event_status,
  p_note   text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;
  if p_status not in ('approved', 'draft', 'killed', 'ended') then
    raise exception 'Staff set approved, draft, ended or killed.';
  end if;

  update live_events
     set status = p_status,
         review_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), review_note),
         ended_at = case when p_status in ('killed', 'ended') then now() else ended_at end,
         updated_at = now()
   where id = p_event;
end;
$$;

create or replace function public.staff_set_host_status(
  p_host   uuid,
  p_status host_status,
  p_note   text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;

  update event_hosts
     set status = p_status,
         review_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), review_note),
         updated_at = now()
   where user_id = p_host;

  --  A suspended host runs nothing, including whatever is on right now.
  if p_status = 'suspended' then
    update live_events set status = 'killed', ended_at = now(), updated_at = now()
     where host_id = p_host and status in ('approved', 'running', 'paused', 'pending');
  end if;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
--  A host's logo
--
--  Public, like a shopfront and unlike a student photo: this goes on a poster
--  taped to a door. Ownership is the first path segment, the same trick
--  `partner-media` uses, so the policy is one function call rather than a
--  join nobody can read.
-- ══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('event-media', 'event-media', true)
on conflict (id) do nothing;

drop policy if exists "event media: anyone can view" on storage.objects;
create policy "event media: anyone can view"
on storage.objects for select to anon, authenticated
using (bucket_id = 'event-media');

drop policy if exists "event media: your own event" on storage.objects;
create policy "event media: your own event"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-media'
  and public.event_host_can(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "event media: replace your own" on storage.objects;
create policy "event media: replace your own"
on storage.objects for update to authenticated
using (
  bucket_id = 'event-media'
  and public.event_host_can(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "event media: delete your own" on storage.objects;
create policy "event media: delete your own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'event-media'
  and public.event_host_can(((storage.foldername(name))[1])::uuid)
);

-- ══════════════════════════════════════════════════════════════════════════
--  Grants and realtime
-- ══════════════════════════════════════════════════════════════════════════

grant select, insert, update on
  event_hosts, live_events, live_event_cohosts, live_event_fields,
  live_event_participants, live_event_answers, live_event_votes to authenticated;
grant select on
  live_event_rounds, live_event_pairings, live_event_matches to authenticated;
grant delete on live_events, live_event_fields, live_event_cohosts to authenticated;

grant execute on function
  public.event_preview(text)
to anon, authenticated;

grant execute on function
  public.register_event_host(text, text),
  public.my_host(),
  public.create_live_event(text, text, text, timestamptz),
  public.update_live_event(uuid, jsonb),
  public.set_event_fields(uuid, jsonb),
  public.my_live_events(),
  public.host_event(uuid),
  public.submit_live_event(uuid),
  public.start_live_event(uuid),
  public.next_event_round(uuid),
  public.pause_live_event(uuid, boolean),
  public.end_live_event(uuid),
  public.reveal_event_matches(uuid),
  public.host_broadcast(uuid, text),
  public.host_roster(uuid),
  public.host_event_summary(uuid),
  public.host_remove_participant(uuid, uuid),
  public.join_live_event(text, text, jsonb),
  public.leave_live_event(uuid),
  public.event_state(text),
  public.cast_event_vote(uuid, boolean, text),
  public.my_event_notes(uuid),
  public.staff_live_events(),
  public.staff_set_live_event_status(uuid, live_event_status, text),
  public.staff_set_host_status(uuid, host_status, text),
  public.event_host_can(uuid),
  public.my_participant(uuid),
  public.event_join_open(uuid),
  public.is_event_host()
to authenticated;

--  `generate_event_round` and `advance_event_if_due` are deliberately NOT
--  granted: they are called from inside other security-definer functions that
--  have already decided the caller is allowed. Nothing should be able to make
--  the room rotate by asking directly.
revoke execute on function public.generate_event_round(uuid) from public, authenticated, anon;
revoke execute on function public.advance_event_if_due(uuid) from public, authenticated, anon;
revoke execute on function public.promote_event_match(uuid) from public, authenticated, anon;
revoke execute on function public.settle_event_pairing(uuid) from public, authenticated, anon;

--  Realtime makes the transition feel instant. It is an accelerator over the
--  polling floor in `event_state`, never a dependency: a room on bad wifi has
--  to keep working, and a design that only pushes fails silently there.
do $$ begin
  alter publication supabase_realtime add table live_events;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table live_event_rounds;
exception when duplicate_object then null; end $$;

comment on table live_event_participants is
  'A verified campus account with a name and no dating profile. profile_id is '
  'a convenience, filled in by a trigger if they ever become a member.';

comment on function public.host_roster(uuid) is
  'Names, badges and state. Never an email address, never a vote — the '
  'protection is this hand-written select list.';

comment on function public.event_state(text) is
  'The single endpoint every phone polls. Returns jsonb because this shape '
  'will change and create-or-replace cannot change a return type.';
