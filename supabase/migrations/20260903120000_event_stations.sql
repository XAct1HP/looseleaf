-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Live events, second pass                                                ║
-- ║  1. No login at the door — a name is the whole thing.                    ║
-- ║  2. A second format: stations with named facilitators.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
--  Both changes come from putting the thing in front of somebody who would
--  actually run one.
--
--  ── 1. The door ──────────────────────────────────────────────────────────
--
--  The verified-email door was built to solve a problem that turned out not to
--  exist. The reasoning was "a verified campus account means a real student";
--  in practice the QR code is printed on paper and taped to a door inside a
--  building on campus, and the set of people who can scan it is already the set
--  of people standing in that room. The email step was buying a guarantee the
--  room was giving us for free, and charging forty people a minute each for it.
--
--  So a participant is now **a name and a token**. No `auth.users` row, no
--  email, no login. The token is a capability: a uuid minted server-side,
--  handed back once, kept in that browser's localStorage, and it *is* the
--  identity. Whoever holds it is that participant.
--
--  This does not weaken the no-roster rule; it strengthens the reason for it.
--  Every participant-facing function below is security definer and takes the
--  token, and none of these tables is readable by `anon` at all. There is no
--  policy to widen by accident because there is no policy.
--
--  What it costs: we can no longer link a match to an account automatically,
--  because there is no account. Two things cover it — a signed-in Looseleaf
--  member who joins still gets their `profile_id` attached, and anybody else
--  can claim their night afterwards from the same browser
--  (`claim_event_participation`). The conversion moment moves from the door to
--  the exit screen, which is where it belonged anyway.
--
--  ── 2. Stations ──────────────────────────────────────────────────────────
--
--  "Meet the members" is not speed dating with the labels changed. The real
--  shape is: a fixed set of tables, each with a club member sitting at it, and
--  everybody else rotating around them. The member is often not registered for
--  the event at all — they are staff for the night — so they were never going
--  to appear in a roster of participants.
--
--  So a station is a row the host types: a label ("Station 7", "How to pitch")
--  and a name. Rounds spread every attendee across the stations as evenly as
--  the numbers allow, never repeating a station until somebody has seen them
--  all. **Nobody sits out.** A bye is a concept from the pairs format and does
--  not exist here.

-- ──────────────────────────────────────────────────────────────────────────
--  Format
-- ──────────────────────────────────────────────────────────────────────────

alter table live_events
  add column if not exists format text not null default 'pairs'
    check (format in ('pairs', 'stations'));

comment on column live_events.format is
  'pairs = speed dating, everyone meets one person per round. '
  'stations = fixed tables with named facilitators, everyone rotates.';

-- ──────────────────────────────────────────────────────────────────────────
--  Stations
--
--  `host_name` is free text on purpose. The member running a table is staff
--  for the night, not an attendee — they are very often not registered for the
--  event and should not have to be. Making this a reference to a participant
--  would have forced every club to sign its own exec board in as guests.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists live_event_stations (
  id        uuid primary key default gen_random_uuid(),
  event_id  uuid not null references live_events (id) on delete cascade,
  position  int not null check (position between 0 and 59),
  label     text not null check (length(label) between 1 and 60),
  host_name text check (host_name is null or length(host_name) <= 60),
  note      text check (note is null or length(note) <= 160),
  created_at timestamptz not null default now(),
  unique (event_id, position)
);

create index if not exists les_event_idx on live_event_stations (event_id, position);

--  Where somebody sat in a round. The stations equivalent of a pairing, and
--  deliberately its own table: a pairing is two people, a seating is a person
--  and a place, and squeezing one into the other would have meant a nullable
--  column that means two different things.
create table if not exists live_event_seatings (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references live_event_rounds (id) on delete cascade,
  event_id       uuid not null references live_events (id) on delete cascade,
  participant_id uuid not null references live_event_participants (id) on delete cascade,
  station_id     uuid not null references live_event_stations (id) on delete cascade,
  unique (round_id, participant_id)
);

create index if not exists lesg_event_idx on live_event_seatings (event_id);
create index if not exists lesg_station_idx on live_event_seatings (participant_id, station_id);

-- ──────────────────────────────────────────────────────────────────────────
--  The token
-- ──────────────────────────────────────────────────────────────────────────

alter table live_event_participants
  add column if not exists join_token uuid not null default gen_random_uuid();

create unique index if not exists lep_token_idx on live_event_participants (join_token);

--  `user_id` was the identity; now it is an optional extra that a signed-in
--  member happens to carry. Postgres allows many nulls in a unique index, so
--  the (event_id, user_id) uniqueness still stops one *account* joining twice
--  while letting any number of anonymous people in.
alter table live_event_participants alter column user_id drop not null;

comment on column live_event_participants.join_token is
  'The participant''s identity. A capability held in one browser''s '
  'localStorage — whoever has it is that participant. Never displayed.';

-- ──────────────────────────────────────────────────────────────────────────
--  RLS
--
--  Nothing changes for hosts and staff. For participants, the policies that
--  keyed on `auth.uid()` now simply match nothing, which is correct: an
--  anonymous participant reads NO table directly and reaches everything
--  through the security-definer functions below. There is no policy for anon
--  to widen by accident because there is no policy at all.
-- ──────────────────────────────────────────────────────────────────────────

alter table live_event_stations enable row level security;
alter table live_event_seatings enable row level security;

drop policy if exists "stations: the event's people" on live_event_stations;
create policy "stations: the event's people" on live_event_stations
  for select to authenticated
  using (public.event_host_can(event_id));

drop policy if exists "stations: the host writes" on live_event_stations;
create policy "stations: the host writes" on live_event_stations
  for all to authenticated
  using (public.event_host_can(event_id)) with check (public.event_host_can(event_id));

drop policy if exists "seatings: the host's schedule" on live_event_seatings;
create policy "seatings: the host's schedule" on live_event_seatings
  for select to authenticated
  using (public.event_host_can(event_id));

grant select, insert, update, delete on live_event_stations to authenticated;
grant select on live_event_seatings to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
--  Token helpers
-- ──────────────────────────────────────────────────────────────────────────

--  Resolve a caller to a participant row: by token first, then — for a
--  signed-in Looseleaf member who has lost their localStorage — by account.
create or replace function public.participant_for(p_event uuid, p_token uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select p.id
  from live_event_participants p
  where p.event_id = p_event
    and (
      (p_token is not null and p.join_token = p_token)
      or (p_token is null and auth.uid() is not null and p.user_id = auth.uid())
    )
  limit 1;
$$;

-- ──────────────────────────────────────────────────────────────────────────
--  The pairing engine, extended
-- ──────────────────────────────────────────────────────────────────────────

--  Stations: everybody gets a seat, every round.
--
--  Greedy rather than a modular cycle (`(i + round) mod stations`), for the
--  same reason the pairs engine is greedy: a cycle needs a stable index per
--  person, and the roster is not stable. Somebody who arrives at round three
--  has no index, and giving them one displaces everybody after them.
--
--  So: order by how many stations each person has already seen (fewest first,
--  so a latecomer catches up), and give each one the emptiest station they
--  have not visited. That keeps the groups even *and* stops repeats, and a
--  latecomer simply slots into the gaps.
create or replace function public.generate_station_round(p_event uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ev       live_events;
  v_stations uuid[];
  v_counts   int[];
  v_ids      uuid[];
  v_n        int;
  v_s        int;
  v_i        int;
  v_j        int;
  v_best     int;
  v_best_load int;
  v_visited  boolean;
  v_round_id uuid;
  v_index    int;
  v_starts   timestamptz;
begin
  select * into v_ev from live_events where id = p_event for update;
  if not found then raise exception 'No such event.'; end if;

  select array_agg(s.id order by s.position) into v_stations
  from live_event_stations s where s.event_id = p_event;

  v_s := coalesce(array_length(v_stations, 1), 0);
  if v_s = 0 then
    raise exception 'Add at least one station before starting.';
  end if;

  select array_agg(p.id order by
           (select count(*) from live_event_seatings sg
             where sg.participant_id = p.id) asc,
           md5(p.id::text || v_ev.seed::text))
    into v_ids
  from live_event_participants p
  where p.event_id = p_event and p.state in ('waiting', 'active');

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 1 then
    raise exception 'Nobody is here yet.';
  end if;

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

  v_counts := array_fill(0, array[v_s]);

  for v_i in 1..v_n loop
    v_best := 0;
    v_best_load := null;

    --  First choice: an unvisited station with the smallest group so far.
    for v_j in 1..v_s loop
      select exists (
        select 1 from live_event_seatings sg
        where sg.participant_id = v_ids[v_i] and sg.station_id = v_stations[v_j]
      ) into v_visited;
      continue when v_visited;

      if v_best_load is null or v_counts[v_j] < v_best_load then
        v_best := v_j;
        v_best_load := v_counts[v_j];
      end if;
    end loop;

    --  They have seen every station. Rather than sit them out — which is the
    --  one thing this format must never do — put them wherever there is most
    --  room and let them go round again.
    if v_best = 0 then
      for v_j in 1..v_s loop
        if v_best_load is null or v_counts[v_j] < v_best_load then
          v_best := v_j;
          v_best_load := v_counts[v_j];
        end if;
      end loop;
    end if;

    insert into live_event_seatings (round_id, event_id, participant_id, station_id)
    values (v_round_id, p_event, v_ids[v_i], v_stations[v_best]);

    v_counts[v_best] := v_counts[v_best] + 1;

    update live_event_participants
       set state = 'active', last_station = v_best
     where id = v_ids[v_i];
  end loop;

  return v_round_id;
end;
$$;

comment on function public.generate_station_round(uuid) is
  'Stations format: every attendee gets a seat every round, groups as even as '
  'the numbers allow, no station repeated until they have all been seen.';

--  One entry point, so callers never have to know which format they are in.
create or replace function public.generate_round_for(p_event uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_format text;
begin
  select format into v_format from live_events where id = p_event;
  if v_format = 'stations' then
    return public.generate_station_round(p_event);
  end if;
  return public.generate_event_round(p_event);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
--  Everything that generated a round now goes through the fork
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.advance_event_if_due(p_event uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ev    live_events;
  v_last  live_event_rounds;
  v_count int;
  v_here  int;
  v_min   int;
begin
  select * into v_ev from live_events where id = p_event;
  if not found or v_ev.status <> 'running' or v_ev.advance <> 'auto' then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('live_event:' || p_event::text));

  select * into v_ev from live_events where id = p_event;
  if v_ev.status <> 'running' then return; end if;

  select * into v_last from live_event_rounds
   where event_id = p_event order by index desc limit 1;

  if found and now() < v_last.ends_at + make_interval(secs => v_ev.break_seconds) then
    return;
  end if;

  select count(*) into v_count from live_event_rounds where event_id = p_event;

  if v_ev.planned_rounds is not null and v_count >= v_ev.planned_rounds then
    update live_events set status = 'ended', ended_at = now(), updated_at = now()
     where id = p_event;
    return;
  end if;

  select count(*) into v_here from live_event_participants
   where event_id = p_event and state in ('waiting', 'active');

  --  Pairs needs two people to hold a round. Stations needs one, because the
  --  other side of the table is a member of the club who was never counted.
  v_min := case when v_ev.format = 'stations' then 1 else 2 end;

  if v_here < v_min then
    if v_count > 0 then
      update live_events set status = 'ended', ended_at = now(), updated_at = now()
       where id = p_event;
    end if;
    return;
  end if;

  perform public.generate_round_for(p_event);
end;
$$;

create or replace function public.start_live_event(p_event uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_ev live_events; v_here int; v_min int;
begin
  if not public.event_host_can(p_event) then raise exception 'Not your event.'; end if;

  select * into v_ev from live_events where id = p_event;
  if v_ev.status not in ('approved', 'paused') then
    raise exception 'This event is not ready to start.';
  end if;

  if v_ev.format = 'stations'
     and not exists (select 1 from live_event_stations where event_id = p_event) then
    raise exception 'Add at least one station before starting.';
  end if;

  select count(*) into v_here from live_event_participants
   where event_id = p_event and state in ('waiting', 'active');

  v_min := case when v_ev.format = 'stations' then 1 else 2 end;
  if v_here < v_min then
    raise exception 'Nobody is here yet.';
  end if;

  update live_events
     set status = 'running',
         started_at = coalesce(started_at, now()),
         paused_at = null,
         updated_at = now()
   where id = p_event;

  if not exists (select 1 from live_event_rounds where event_id = p_event) then
    perform public.generate_round_for(p_event);
  end if;
end;
$$;

create or replace function public.next_event_round(p_event uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_count int; v_planned int;
begin
  if not public.event_host_can(p_event) then raise exception 'Not your event.'; end if;

  select count(*) into v_count from live_event_rounds where event_id = p_event;
  select planned_rounds into v_planned from live_events where id = p_event;

  if v_planned is not null and v_count >= v_planned then
    update live_events set status = 'ended', ended_at = now(), updated_at = now()
     where id = p_event;
    return;
  end if;

  update live_event_rounds set ends_at = least(ends_at, now())
   where event_id = p_event
     and index = (select max(index) from live_event_rounds where event_id = p_event);

  perform public.generate_round_for(p_event);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
--  The format is a setting, so `update_live_event` has to know about it
--
--  It did not, which meant a host could pick "Meet the members" in the editor,
--  save, and get a speed dating event with the label changed — silently, with
--  no error anywhere. A patch function that quietly drops keys it does not
--  recognise is a patch function that will do this again, so `format` is
--  listed here and the switch is refused once the room is running.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.update_live_event(
  p_event uuid,
  p_patch jsonb
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_status live_event_status; v_started timestamptz; v_format text;
begin
  if not public.event_host_can(p_event) then
    raise exception 'Not your event.';
  end if;

  select status, started_at, format into v_status, v_started, v_format
  from live_events where id = p_event;

  if v_status in ('ended', 'killed') then
    raise exception 'That event is over.';
  end if;

  --  Changing the format mid-event would leave half the night's rounds in one
  --  shape and half in another, and every screen would have to cope with both.
  if p_patch ? 'format'
     and (p_patch ->> 'format') is distinct from v_format
     and v_started is not null then
    raise exception 'The format is fixed once the event has started.';
  end if;

  update live_events set
    title          = coalesce(p_patch ->> 'title', title),
    blurb          = coalesce(p_patch ->> 'blurb', blurb),
    venue_label    = coalesce(p_patch ->> 'venue_label', venue_label),
    starts_at      = coalesce((p_patch ->> 'starts_at')::timestamptz, starts_at),
    format         = coalesce(p_patch ->> 'format', format),
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

-- ──────────────────────────────────────────────────────────────────────────
--  Stations, edited by the host
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.set_event_stations(p_event uuid, p_stations jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_s jsonb;
  v_i int := 0;
  v_keep uuid[] := '{}';
  v_id uuid;
begin
  if not public.event_host_can(p_event) then
    raise exception 'Not your event.';
  end if;
  if jsonb_array_length(p_stations) > 60 then
    raise exception 'Sixty tables is the limit.';
  end if;

  for v_s in select * from jsonb_array_elements(p_stations) loop
    --  Existing rows are updated rather than replaced, because a station that
    --  is deleted and recreated loses its id — and every seating from earlier
    --  rounds points at that id. Renaming a table mid-event would otherwise
    --  wipe the record of who had already been to it, and the next round would
    --  send everybody back round again.
    v_id := nullif(v_s ->> 'id', '')::uuid;

    if v_id is not null and exists (
      select 1 from live_event_stations where id = v_id and event_id = p_event
    ) then
      update live_event_stations
         set position = v_i,
             label = trim(v_s ->> 'label'),
             host_name = nullif(trim(coalesce(v_s ->> 'host_name', '')), ''),
             note = nullif(trim(coalesce(v_s ->> 'note', '')), '')
       where id = v_id;
    else
      insert into live_event_stations (event_id, position, label, host_name, note)
      values (
        p_event, v_i,
        trim(v_s ->> 'label'),
        nullif(trim(coalesce(v_s ->> 'host_name', '')), ''),
        nullif(trim(coalesce(v_s ->> 'note', '')), '')
      )
      returning id into v_id;
    end if;

    v_keep := v_keep || v_id;
    v_i := v_i + 1;
  end loop;

  delete from live_event_stations
   where event_id = p_event and not (id = any (v_keep));

  update live_events set station_count = v_i, updated_at = now() where id = p_event;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
--  Joining, without a login
-- ──────────────────────────────────────────────────────────────────────────

drop function if exists public.join_live_event(text, text, jsonb);

create or replace function public.join_live_event(
  p_code    text,
  p_name    text,
  p_answers jsonb default '{}'::jsonb,
  p_token   uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_ev    live_events;
  v_id    uuid;
  v_token uuid;
  v_badge int;
  v_key   text;
  v_field live_event_fields;
  v_vals  text[];
begin
  select * into v_ev from live_events where code = upper(trim(p_code));
  if not found then raise exception 'No event with that code.'; end if;

  --  A business account has no business being a guest at a dating event.
  if v_uid is not null and exists (select 1 from partner_users where id = v_uid) then
    raise exception 'Partner accounts can''t join an event as a guest.';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'We need something to call you.';
  end if;

  --  Returning phone, not a second person.
  v_id := public.participant_for(v_ev.id, p_token);

  if v_id is null then
    if not public.event_join_open(v_ev.id) then
      raise exception 'Joining is closed for this event.';
    end if;

    select coalesce(max(p.badge_no), 0) + 1 into v_badge
    from live_event_participants p where p.event_id = v_ev.id;

    insert into live_event_participants
      (event_id, user_id, profile_id, display_name, badge_no)
    values (
      v_ev.id,
      v_uid,
      (select id from profiles where id = v_uid),
      trim(p_name),
      v_badge
    )
    returning id, join_token into v_id, v_token;
  else
    update live_event_participants
       set display_name = trim(p_name),
           state = case when state = 'left' then 'waiting' else state end,
           left_at = null,
           --  A member who signs in later gets linked without rejoining.
           user_id = coalesce(user_id, v_uid),
           profile_id = coalesce(profile_id, (select id from profiles where id = v_uid))
     where id = v_id
    returning join_token into v_token;
  end if;

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

  return jsonb_build_object('participant_id', v_id, 'token', v_token);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
--  The one endpoint every phone polls, now token-addressed
-- ──────────────────────────────────────────────────────────────────────────

drop function if exists public.event_state(text);

create or replace function public.event_state(p_code text, p_token uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ev      live_events;
  v_me      live_event_participants;
  v_round   live_event_rounds;
  v_pair    live_event_pairings;
  v_seat    live_event_seatings;
  v_station live_event_stations;
  v_other   live_event_participants;
  v_vote_pair uuid;
  v_vote_name text;
  v_out     jsonb;
  v_revealed boolean;
  v_me_id   uuid;
begin
  select * into v_ev from live_events where code = upper(trim(p_code));
  if not found then raise exception 'No event with that code.'; end if;

  perform public.advance_event_if_due(v_ev.id);
  select * into v_ev from live_events where id = v_ev.id;

  v_me_id := public.participant_for(v_ev.id, p_token);

  if v_me_id is null then
    return jsonb_build_object(
      'event', public.event_preview(v_ev.code),
      'me', null,
      'now', now()
    );
  end if;

  select * into v_me from live_event_participants where id = v_me_id;

  select * into v_round from live_event_rounds
   where event_id = v_ev.id order by index desc limit 1;

  if v_round.id is not null and v_ev.format = 'stations' then
    select * into v_seat from live_event_seatings
     where round_id = v_round.id and participant_id = v_me.id;
    if v_seat.id is not null then
      select * into v_station from live_event_stations where id = v_seat.station_id;
    end if;
  elsif v_round.id is not null then
    select * into v_pair from live_event_pairings
     where round_id = v_round.id
       and (a_participant = v_me.id or b_participant = v_me.id);

    if v_pair.id is not null and not v_pair.bye then
      select * into v_other from live_event_participants
       where id = case when v_pair.a_participant = v_me.id
                       then v_pair.b_participant else v_pair.a_participant end;
    end if;
  end if;

  --  Voting is a pairs-format idea. At a station you met a table, not a
  --  person, and asking "would you like to see them again" about four people
  --  and a facilitator is a question with no honest answer.
  if v_ev.likes_enabled and v_ev.format = 'pairs' then
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
      'planned_rounds', v_ev.planned_rounds, 'format', v_ev.format,
      'likes_enabled', v_ev.likes_enabled and v_ev.format = 'pairs',
      'notes_enabled', v_ev.notes_enabled,
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
      'station', case when v_ev.format = 'stations' then v_station.position + 1
                      else v_pair.station end,
      'bye', case when v_ev.format = 'stations' then false
                  else coalesce(v_pair.bye, false) end,
      'pairing_id', v_pair.id,
      --  Stations format: where you are and who is running it. Deliberately
      --  NOT the other people sitting there — a list of who is at your table
      --  is still a list, and the no-roster rule does not get an exception for
      --  being in the same room as somebody.
      'place', case when v_station.id is null then null else jsonb_build_object(
        'label', v_station.label,
        'host_name', v_station.host_name,
        'note', v_station.note,
        'with', (select count(*) - 1 from live_event_seatings sg
                  where sg.round_id = v_round.id and sg.station_id = v_station.id)
      ) end,
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
    'met', case when v_ev.format = 'stations'
      then (select count(*) from live_event_seatings sg where sg.participant_id = v_me.id)
      else (select count(*) from live_event_pairings pr
             where pr.event_id = v_ev.id and pr.bye = false
               and (pr.a_participant = v_me.id or pr.b_participant = v_me.id))
      end
  );

  return v_out;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
--  Voting and leaving, token-addressed
-- ──────────────────────────────────────────────────────────────────────────

drop function if exists public.cast_event_vote(uuid, boolean, text);

create or replace function public.cast_event_vote(
  p_pairing uuid,
  p_yes     boolean,
  p_note    text default null,
  p_token   uuid default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pr live_event_pairings;
  v_me uuid;
  v_ok boolean;
begin
  select * into v_pr from live_event_pairings where id = p_pairing;
  if not found then raise exception 'No such pairing.'; end if;

  select likes_enabled and format = 'pairs' into v_ok
  from live_events where id = v_pr.event_id;
  if not coalesce(v_ok, false) then
    raise exception 'This event isn''t matching people.';
  end if;

  v_me := public.participant_for(v_pr.event_id, p_token);
  if v_me is null or (v_me <> v_pr.a_participant and v_me <> coalesce(v_pr.b_participant, v_me)) then
    raise exception 'That wasn''t your conversation.';
  end if;
  if v_me <> v_pr.a_participant and v_me is distinct from v_pr.b_participant then
    raise exception 'That wasn''t your conversation.';
  end if;

  insert into live_event_votes (pairing_id, voter_id, yes, note)
  values (p_pairing, v_me, p_yes, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (pairing_id, voter_id) do update
    set yes = excluded.yes, note = excluded.note;

  perform public.settle_event_pairing(p_pairing);
end;
$$;

drop function if exists public.leave_live_event(uuid);

create or replace function public.leave_live_event(p_event uuid, p_token uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := public.participant_for(p_event, p_token);
  if v_me is null then return; end if;
  update live_event_participants
     set state = 'left', left_at = now()
   where id = v_me;
end;
$$;

drop function if exists public.my_event_notes(uuid);

create or replace function public.my_event_notes(p_event uuid, p_token uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := public.participant_for(p_event, p_token);
  if v_me is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', other.display_name,
      'note', v.note,
      'yes', v.yes,
      'round', r.index
    ) order by r.index)
    from live_event_votes v
    join live_event_pairings pr on pr.id = v.pairing_id
    join live_event_rounds r on r.id = pr.round_id
    join live_event_participants other
      on other.id = case when pr.a_participant = v.voter_id
                         then pr.b_participant else pr.a_participant end
    where pr.event_id = p_event and v.voter_id = v_me
  ), '[]'::jsonb);
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
--  Claiming a night afterwards
--
--  The cost of having no account at the door. Somebody who matched with two
--  people and then decides they want a Looseleaf profile has nothing linking
--  the two — so the browser that holds the tokens hands them over once, at
--  signup, and every match those tokens were waiting on opens.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.claim_event_participation(p_tokens uuid[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_n int := 0;
  v_row uuid;
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  if p_tokens is null or cardinality(p_tokens) = 0 then return 0; end if;

  --  Only onto rows that nobody has claimed. A token is a capability and this
  --  is the one place it is spent; letting it re-point an already-claimed row
  --  would let a shared browser walk off with somebody else's matches.
  update live_event_participants
     set user_id = v_uid,
         profile_id = coalesce(profile_id, (select id from profiles where id = v_uid))
   where join_token = any (p_tokens)
     and user_id is null;

  get diagnostics v_n = row_count;

  for v_row in
    select m.id from live_event_matches m
    join live_event_participants a on a.id = m.a_participant
    join live_event_participants b on b.id = m.b_participant
    where m.match_id is null
      and (a.join_token = any (p_tokens) or b.join_token = any (p_tokens))
      and a.profile_id is not null and b.profile_id is not null
  loop
    perform public.promote_event_match(v_row);
  end loop;

  return v_n;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
--  The host's view gains the stations
-- ──────────────────────────────────────────────────────────────────────────

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
    'stations', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.position)
      from live_event_stations s where s.event_id = e.id), '[]'::jsonb),
    'host', (select jsonb_build_object('org_name', h.org_name, 'full_name', h.full_name,
                                       'status', h.status)
               from event_hosts h where h.user_id = e.host_id)
  ) into v_out
  from live_events e where e.id = p_event;

  return v_out;
end;
$$;

--  The roster gains where each person is sitting, by label rather than number,
--  because a host looking for somebody scans for "How to pitch" and not "3".
--  Still no email address, still no vote.
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
      'place', (
        select s.label
        from live_event_seatings sg
        join live_event_stations s on s.id = sg.station_id
        join live_event_rounds r on r.id = sg.round_id
        where sg.participant_id = p.id
        order by r.index desc limit 1
      ),
      'joined_at', p.joined_at
    ) order by p.badge_no)
    from live_event_participants p where p.event_id = p_event
  ), '[]'::jsonb);
end;
$$;

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
    'seatings',   (select count(*) from live_event_seatings where event_id = p_event),
    'stations',   (select count(*) from live_event_stations where event_id = p_event),
    'byes',       (select count(*) from live_event_pairings
                    where event_id = p_event and bye = true),
    'matches',    (select count(*) from live_event_matches where event_id = p_event),
    'members',    (select count(*) from live_event_participants
                    where event_id = p_event and profile_id is not null)
  ) into v_out;

  return v_out;
end;
$$;

--  The preview says which format it is, so the join screen can promise the
--  right thing before anybody commits to typing their name.
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
    'format', e.format,
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

-- ──────────────────────────────────────────────────────────────────────────
--  Grants
--
--  `anon` gets exactly four verbs: look at the poster, come in, ask what is
--  happening, and leave. Every one of them is security definer and scoped by
--  the token. No table, no view, no roster.
-- ──────────────────────────────────────────────────────────────────────────

grant execute on function
  public.event_preview(text),
  public.join_live_event(text, text, jsonb, uuid),
  public.event_state(text, uuid),
  public.cast_event_vote(uuid, boolean, text, uuid),
  public.leave_live_event(uuid, uuid),
  public.my_event_notes(uuid, uuid)
to anon, authenticated;

grant execute on function
  public.set_event_stations(uuid, jsonb),
  public.claim_event_participation(uuid[]),
  public.participant_for(uuid, uuid)
to authenticated;

revoke execute on function public.generate_station_round(uuid) from public, authenticated, anon;
revoke execute on function public.generate_round_for(uuid) from public, authenticated, anon;

comment on function public.join_live_event(text, text, jsonb, uuid) is
  'A name and nothing else. Returns the participant id and the token that IS '
  'their identity for the rest of the night.';

comment on function public.claim_event_participation(uuid[]) is
  'Spends the browser''s tokens onto a freshly-created account, and opens any '
  'match that was only waiting on both sides having a profile.';
