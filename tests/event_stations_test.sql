-- The second pass: no login at the door, and the stations format.
-- Run after local-stubs.sql + every migration, like the others.
--
-- Two things are being proven here, and they are the two the first version
-- got wrong:
--
--   §1–3  A participant needs no account at all — and the absence of an
--         account must not become an absence of privacy. `anon` reads no
--         table; a token reaches only its own row.
--   §4–6  Stations: everybody is seated every round, groups stay even, and
--         nobody revisits a table until they have seen them all.

\set ON_ERROR_STOP on
\pset pager off

create or replace function assert(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $$;

create or replace function act_as(u uuid) returns void
language plpgsql as $$
begin
  perform set_config('test.uid', coalesce(u::text, ''), false);
end $$;

-- ─── fixtures ─────────────────────────────────────────────────────────────

do $$
declare v_campus uuid; v_host uuid; v_staff uuid;
begin
  insert into universities (name, short_name, city, email_domains, areas, is_live)
  values ('Station U', 'SU', 'Stationville', array['su.edu'], array['Central'], true)
  returning id into v_campus;

  insert into auth.users (email) values ('host@su.edu')  returning id into v_host;
  insert into auth.users (email) values ('admin@su.edu') returning id into v_staff;

  insert into profiles (id, university_id, first_name, gender, grad_year, major, age)
  values (v_staff, v_campus, 'Sam', 'nonbinary', '2026', 'Staff', 22);
  update profiles set is_admin = true where id = v_staff;

  perform set_config('test.campus', v_campus::text, false);
  perform set_config('test.host',   v_host::text, false);
  perform set_config('test.staff',  v_staff::text, false);
end $$;

-- ═══ 1. ★ NO LOGIN AT THE DOOR ════════════════════════════════════════════

do $$
declare v_ev uuid; v_res jsonb;
begin
  perform act_as(current_setting('test.host')::uuid);
  perform register_event_host('Club Lead', 'Debate Society');
  v_ev := create_live_event('Speed Night', null, 'Room 1', now());
  perform set_config('test.ev', v_ev::text, false);
  perform set_config('test.code', (select code from live_events where id = v_ev), false);

  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_live_event_status(v_ev, 'approved');

  --  Nobody at all: no auth.uid(), no account, no email.
  perform act_as(null);
  perform assert(auth.uid() is null, 'the caller really is anonymous');

  v_res := join_live_event(current_setting('test.code'), 'Ada');
  perform set_config('test.t1', v_res ->> 'token', false);
  perform set_config('test.p1', v_res ->> 'participant_id', false);

  perform assert(v_res ? 'token', 'joining hands back a token');
  perform assert((v_res ->> 'token')::uuid is not null, 'and it is a real one');
  perform assert(
    (select user_id from live_event_participants where id = (v_res ->> 'participant_id')::uuid)
    is null,
    'an anonymous participant has no account attached');
  perform assert(
    (select display_name from live_event_participants
      where id = (v_res ->> 'participant_id')::uuid) = 'Ada',
    'and the name is all we asked for');
end $$;

--  A name is not optional. It is the only thing we do ask for.
do $$
declare ok boolean := false;
begin
  perform act_as(null);
  begin
    perform join_live_event(current_setting('test.code'), '   ');
  exception when others then ok := true;
  end;
  perform assert(ok, 'a blank name is refused');
end $$;

--  Same browser, same token, same person — not a second badge.
do $$
declare v_res jsonb;
begin
  perform act_as(null);
  v_res := join_live_event(current_setting('test.code'), 'Ada B',
                           '{}'::jsonb, current_setting('test.t1')::uuid);
  perform assert((v_res ->> 'participant_id')::uuid = current_setting('test.p1')::uuid,
                 'rejoining with the token returns the same participant');
  perform assert((select count(*) from live_event_participants
                   where event_id = current_setting('test.ev')::uuid) = 1,
                 'and does not create a second one');
  perform assert((select display_name from live_event_participants
                   where id = current_setting('test.p1')::uuid) = 'Ada B',
                 'while still letting them fix their name');
end $$;

-- ═══ 2. ★ NO ACCOUNT MUST NOT MEAN NO PRIVACY ═════════════════════════════
--
--  Run this with `anon` holding the same table grants Supabase hands out by
--  default (see the harness note in tests/README.md). That is deliberate: if
--  the harness left the grants off, these would pass by permission error and
--  prove nothing about the thing that actually protects us in production,
--  which is RLS. We want anon to be *allowed to ask* and told nothing.

do $$
declare n int;
begin
  perform act_as(null);
  set local role anon;

  select count(*) into n from live_event_participants;
  perform assert(n = 0, 'anon reads ZERO participant rows');

  select count(*) into n from live_events;
  perform assert(n = 0, 'anon reads ZERO event rows');

  select count(*) into n from live_event_stations;
  perform assert(n = 0, 'anon reads ZERO station rows');

  select count(*) into n from live_event_seatings;
  perform assert(n = 0, 'anon reads ZERO seating rows');

  select count(*) into n from live_event_votes;
  perform assert(n = 0, 'anon reads ZERO votes');

  reset role;
end $$;

--  Everything an attendee can see comes through one function, scoped by their
--  token — and a token nobody holds sees nothing.
do $$
declare v_s jsonb;
begin
  perform act_as(null);
  v_s := event_state(current_setting('test.code'), current_setting('test.t1')::uuid);
  perform assert(v_s -> 'me' ->> 'name' = 'Ada B', 'the token identifies its own participant');

  v_s := event_state(current_setting('test.code'), gen_random_uuid());
  perform assert(v_s -> 'me' = 'null'::jsonb, 'a token nobody holds is nobody');
  perform assert(not (v_s ? 'here'), 'and is told nothing about who is inside');

  v_s := event_state(current_setting('test.code'), null);
  perform assert(v_s -> 'me' = 'null'::jsonb, 'and no token at all is nobody too');
end $$;

--  One person's token cannot vote as another, and cannot read their notes.
do $$
declare v_res jsonb; ok boolean := false; v_pair uuid;
begin
  perform act_as(null);
  v_res := join_live_event(current_setting('test.code'), 'Bo');
  perform set_config('test.t2', v_res ->> 'token', false);
  perform set_config('test.p2', v_res ->> 'participant_id', false);

  perform act_as(current_setting('test.host')::uuid);
  perform update_live_event(current_setting('test.ev')::uuid,
    jsonb_build_object('round_seconds', 60, 'break_seconds', 0,
                       'planned_rounds', 1, 'advance', 'manual'));
  perform start_live_event(current_setting('test.ev')::uuid);

  select id into v_pair from live_event_pairings
   where event_id = current_setting('test.ev')::uuid limit 1;

  perform act_as(null);
  perform cast_event_vote(v_pair, true, 'nice', current_setting('test.t1')::uuid);

  perform assert(
    jsonb_array_length(my_event_notes(current_setting('test.ev')::uuid,
                                      current_setting('test.t1')::uuid)) = 1,
    'your token reads your own note');
  perform assert(
    jsonb_array_length(my_event_notes(current_setting('test.ev')::uuid,
                                      current_setting('test.t2')::uuid)) = 0,
    'and somebody else''s token reads none of it');

  begin
    perform cast_event_vote(v_pair, true, null, gen_random_uuid());
  exception when others then ok := true;
  end;
  perform assert(ok, 'a stranger''s token cannot vote on your conversation');
end $$;

-- ═══ 3. claiming a night afterwards ═══════════════════════════════════════
--
--  The price of having no account at the door: a match between two people
--  with no profiles is a promise until somebody makes one.

do $$
declare v_pair uuid;
begin
  select id into v_pair from live_event_pairings
   where event_id = current_setting('test.ev')::uuid limit 1;

  perform act_as(null);
  perform cast_event_vote(v_pair, true, null, current_setting('test.t2')::uuid);

  perform assert(exists (select 1 from live_event_matches
                          where event_id = current_setting('test.ev')::uuid),
                 'two anonymous yeses still make a match');
  perform assert((select match_id from live_event_matches
                   where event_id = current_setting('test.ev')::uuid) is null,
                 'but no conversation — neither of them has a profile');
end $$;

do $$
declare
  v_campus uuid := current_setting('test.campus')::uuid;
  v_ua uuid; v_ub uuid; v_n int;
begin
  --  Ada makes an account, back in the same browser, and spends her token.
  insert into auth.users (email) values ('ada@su.edu') returning id into v_ua;
  perform act_as(v_ua);
  insert into profiles (id, university_id, first_name, gender, grad_year, major, age)
  values (v_ua, v_campus, 'Ada', 'woman', '2027', 'CS', 20);

  v_n := claim_event_participation(array[current_setting('test.t1')::uuid]);
  perform assert(v_n = 1, 'the token attaches her night to the new account');
  perform assert((select profile_id from live_event_participants
                   where id = current_setting('test.p1')::uuid) = v_ua,
                 'and backfills the profile');
  perform assert((select match_id from live_event_matches
                   where event_id = current_setting('test.ev')::uuid) is null,
                 'one profile is still not a conversation');

  --  Bo does the same.
  insert into auth.users (email) values ('bo@su.edu') returning id into v_ub;
  perform act_as(v_ub);
  insert into profiles (id, university_id, first_name, gender, grad_year, major, age)
  values (v_ub, v_campus, 'Bo', 'man', '2027', 'History', 21);

  perform claim_event_participation(array[current_setting('test.t2')::uuid]);

  perform assert((select match_id from live_event_matches
                   where event_id = current_setting('test.ev')::uuid) is not null,
                 'both profiles: the thread opens');
end $$;

--  A token is spent once. A shared laptop must not let the next person walk
--  off with the last person's matches.
do $$
declare v_u uuid; v_n int;
begin
  insert into auth.users (email) values ('thief@su.edu') returning id into v_u;
  perform act_as(v_u);
  v_n := claim_event_participation(array[current_setting('test.t1')::uuid]);
  perform assert(v_n = 0, 'an already-claimed token claims nothing');
  perform assert((select user_id from live_event_participants
                   where id = current_setting('test.p1')::uuid) <> v_u,
                 'and the row still belongs to whoever claimed it first');
end $$;

-- ═══ 4. ★ STATIONS ════════════════════════════════════════════════════════

do $$
declare v_ev uuid; v_res jsonb; i int;
begin
  perform act_as(current_setting('test.host')::uuid);
  v_ev := create_live_event('Meet the Members', null, 'Chapter Room', now());
  perform set_config('test.sv', v_ev::text, false);
  perform update_live_event(v_ev, jsonb_build_object(
    'format', 'stations', 'likes_enabled', false, 'reveal', 'never',
    'round_seconds', 60, 'break_seconds', 0, 'planned_rounds', 4,
    'advance', 'manual'));

  perform set_event_stations(v_ev, jsonb_build_array(
    jsonb_build_object('label', 'How to pitch',   'host_name', 'Priya'),
    jsonb_build_object('label', 'Comp team',      'host_name', 'Devon'),
    jsonb_build_object('label', 'Socials',        'host_name', 'Noor'),
    jsonb_build_object('label', 'Station 4',      'host_name', 'Eli')
  ));

  perform assert((select count(*) from live_event_stations where event_id = v_ev) = 4,
                 'four stations saved');
  perform assert((select station_count from live_events where id = v_ev) = 4,
                 'and the count is mirrored onto the event');
  perform assert((select host_name from live_event_stations
                   where event_id = v_ev and position = 0) = 'Priya',
                 'a station carries a name the host typed');

  --  The facilitator is staff for the night, not an attendee.
  perform assert((select count(*) from live_event_participants where event_id = v_ev) = 0,
                 'naming a member does not sign them up as a guest');

  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_live_event_status(v_ev, 'approved');

  --  Eleven people over four tables: deliberately not divisible.
  perform act_as(null);
  for i in 1..11 loop
    v_res := join_live_event((select code from live_events where id = v_ev), 'P' || i);
    perform set_config('test.st' || i, v_res ->> 'token', false);
  end loop;
end $$;

--  Nobody sits out. Ever. This is the whole point of the format.
do $$
declare v_ev uuid := current_setting('test.sv')::uuid; i int; r record; bad int := 0;
begin
  perform act_as(current_setting('test.host')::uuid);
  perform start_live_event(v_ev);
  for i in 2..4 loop perform next_event_round(v_ev); end loop;

  perform assert((select count(*) from live_event_rounds where event_id = v_ev) = 4,
                 'four rounds run');

  for r in select round_id, count(*) c from live_event_seatings
            where event_id = v_ev group by round_id loop
    if r.c <> 11 then bad := bad + 1; end if;
  end loop;
  perform assert(bad = 0, 'every round seats all eleven people — nobody ever sits out');

  perform assert((select count(*) from live_event_pairings where event_id = v_ev) = 0,
                 'and the pairs engine never ran: no byes exist in this format');
end $$;

--  Groups stay as even as eleven over four allows: 3,3,3,2 every round.
do $$
declare r record; bad int := 0;
begin
  for r in
    select round_id, min(c) lo, max(c) hi from (
      select sg.round_id, sg.station_id, count(*) c
      from live_event_seatings sg
      where sg.event_id = current_setting('test.sv')::uuid
      group by sg.round_id, sg.station_id
    ) t group by round_id
  loop
    if r.hi - r.lo > 1 then bad := bad + 1; end if;
  end loop;
  perform assert(bad = 0, 'no table is ever more than one person bigger than another');
end $$;

--  Four rounds, four stations: everybody sees each exactly once.
do $$
declare n int;
begin
  select count(*) into n from (
    select participant_id, station_id, count(*) c
    from live_event_seatings
    where event_id = current_setting('test.sv')::uuid
    group by participant_id, station_id having count(*) > 1
  ) t;
  perform assert(n = 0, 'nobody visits the same table twice');

  select count(*) into n from (
    select participant_id from live_event_seatings
    where event_id = current_setting('test.sv')::uuid
    group by participant_id having count(distinct station_id) = 4
  ) t;
  perform assert(n = 11, 'and everybody has been to all four');
end $$;

--  A latecomer is caught up rather than slotted in at the back.
do $$
declare v_ev uuid := current_setting('test.sv')::uuid; v_res jsonb; n int; v_tok uuid;
begin
  perform act_as(null);
  v_res := join_live_event((select code from live_events where id = v_ev), 'Late');
  v_tok := (v_res ->> 'token')::uuid;

  perform act_as(current_setting('test.host')::uuid);
  perform update_live_event(v_ev, jsonb_build_object('planned_rounds', 5));
  perform next_event_round(v_ev);

  select count(*) into n from live_event_seatings sg
   join live_event_rounds r on r.id = sg.round_id
   where sg.event_id = v_ev and r.index = 5;
  perform assert(n = 12, 'a latecomer is seated in the very next round');

  perform assert(
    (event_state((select code from live_events where id = v_ev), v_tok)
      -> 'round' -> 'place' ->> 'label') is not null,
    'and their phone tells them which table');
end $$;

-- ═══ 5. what a station tells you, and what it does not ════════════════════

do $$
declare v_s jsonb; v_place jsonb;
begin
  perform act_as(null);
  v_s := event_state((select code from live_events where id = current_setting('test.sv')::uuid),
                     current_setting('test.st1')::uuid);

  v_place := v_s -> 'round' -> 'place';
  perform assert(v_place ->> 'label' is not null, 'you are told the table');
  perform assert(v_place ->> 'host_name' is not null, 'and who is running it');
  perform assert(v_place ? 'with', 'and how many others are there');

  --  ★ A count, never a list. Sitting at the same table as somebody is not
  --  consent to appear on their screen.
  perform assert(v_s::text not like '%"P2"%' and v_s::text not like '%"P3"%',
                 'but NEVER the names of the others at your table');
  perform assert(v_s -> 'round' -> 'partner' = 'null'::jsonb,
                 'there is no partner in the stations format');
  perform assert((v_s -> 'event' ->> 'format') = 'stations', 'and the format is declared');
end $$;

--  Matching is a pairs idea, and the database refuses it here rather than
--  leaving it to the UI to hide the button.
do $$
declare ok boolean := false; v_ev uuid := current_setting('test.sv')::uuid;
begin
  perform act_as(current_setting('test.host')::uuid);
  perform update_live_event(v_ev, jsonb_build_object('likes_enabled', true));

  perform act_as(null);
  perform assert(
    (event_state((select code from live_events where id = v_ev),
                 current_setting('test.st1')::uuid)
      -> 'event' ->> 'likes_enabled') = 'false',
    'a stations event never offers matching, even if the flag is on');
end $$;

-- ═══ 6. renaming a table mid-event ════════════════════════════════════════
--
--  The subtle one. A station that is deleted and recreated gets a new id, and
--  every seating from earlier rounds points at the old one — so a host fixing
--  a typo would silently wipe the record of who had already been where, and
--  the next round would send the whole room back round again.

do $$
declare v_ev uuid := current_setting('test.sv')::uuid; v_ids uuid[]; v_after uuid[]; n int;
begin
  select array_agg(id order by position) into v_ids
  from live_event_stations where event_id = v_ev;

  perform act_as(current_setting('test.host')::uuid);
  perform set_event_stations(v_ev, (
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'label', case when s.position = 0 then 'How to pitch (fixed)' else s.label end,
      'host_name', s.host_name
    ) order by s.position)
    from live_event_stations s where s.event_id = v_ev
  ));

  select array_agg(id order by position) into v_after
  from live_event_stations where event_id = v_ev;

  perform assert(v_ids = v_after, 'renaming a table keeps its id');
  perform assert((select label from live_event_stations
                   where event_id = v_ev and position = 0) = 'How to pitch (fixed)',
                 'and the new name sticks');

  select count(*) into n from live_event_seatings where event_id = v_ev;
  perform assert(n = 56, 'and every seating from earlier rounds survives it');
end $$;

--  Removing one really does remove it.
do $$
declare v_ev uuid := current_setting('test.sv')::uuid;
begin
  perform act_as(current_setting('test.host')::uuid);
  perform set_event_stations(v_ev, (
    select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label,
                                        'host_name', s.host_name) order by s.position)
    from live_event_stations s where s.event_id = v_ev and s.position < 3
  ));
  perform assert((select count(*) from live_event_stations where event_id = v_ev) = 3,
                 'dropping a station from the list deletes it');
  perform assert((select station_count from live_events where id = v_ev) = 3,
                 'and the mirrored count follows');
end $$;

--  A stations event with no stations cannot start — better a clear refusal
--  than a room of people staring at an empty screen.
do $$
declare v_ev uuid; ok boolean := false; v_res jsonb;
begin
  perform act_as(current_setting('test.host')::uuid);
  v_ev := create_live_event('Empty', null, null, now());
  perform update_live_event(v_ev, jsonb_build_object('format', 'stations'));
  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_live_event_status(v_ev, 'approved');

  perform act_as(null);
  v_res := join_live_event((select code from live_events where id = v_ev), 'Solo');

  perform act_as(current_setting('test.host')::uuid);
  begin
    perform start_live_event(v_ev);
  exception when others then ok := true;
  end;
  perform assert(ok, 'a stations event with no stations refuses to start');
end $$;

--  One person and one table is a legitimate round. Pairs needs two; stations
--  does not, because the other side of the table is a club member who was
--  never counted as an attendee.
do $$
declare v_ev uuid; v_res jsonb;
begin
  perform act_as(current_setting('test.host')::uuid);
  v_ev := create_live_event('Just one', null, null, now());
  perform update_live_event(v_ev, jsonb_build_object(
    'format', 'stations', 'advance', 'manual', 'planned_rounds', 1, 'round_seconds', 60));
  perform set_event_stations(v_ev, jsonb_build_array(
    jsonb_build_object('label', 'The only table', 'host_name', 'Kai')));

  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_live_event_status(v_ev, 'approved');

  perform act_as(null);
  v_res := join_live_event((select code from live_events where id = v_ev), 'Only');

  perform act_as(current_setting('test.host')::uuid);
  perform start_live_event(v_ev);
  perform assert((select count(*) from live_event_seatings where event_id = v_ev) = 1,
                 'one attendee and one table is a round');
end $$;

-- ═══ 7. the host still sees no more than before ═══════════════════════════

do $$
declare v_roster jsonb; v_sum jsonb;
begin
  perform act_as(current_setting('test.host')::uuid);
  v_roster := host_roster(current_setting('test.sv')::uuid);

  perform assert(jsonb_array_length(v_roster) = 12, 'the host sees the room');
  perform assert(v_roster::text like '%How to pitch%',
                 'and which table each person is at, by name');
  perform assert(v_roster::text not like '%@su.edu%', 'still no email address');
  perform assert(not (v_roster -> 0 ? 'join_token'),
                 '★ and never a join token — that is somebody''s identity');

  v_sum := host_event_summary(current_setting('test.sv')::uuid);
  perform assert((v_sum ->> 'stations')::int = 3, 'the summary counts the tables');
  perform assert((v_sum ->> 'seatings')::int > 0, 'and the seats filled');
end $$;

--  The token must not leak through the one function attendees do call.
do $$
declare v_s jsonb;
begin
  perform act_as(null);
  v_s := event_state((select code from live_events where id = current_setting('test.sv')::uuid),
                     current_setting('test.st1')::uuid);
  perform assert(v_s::text not like '%join_token%', 'event_state never echoes a token back');
end $$;

do $$ begin raise notice '─────────────────────────────────────'; end $$;
do $$ begin raise notice 'stations + open door: all assertions passed.'; end $$;
