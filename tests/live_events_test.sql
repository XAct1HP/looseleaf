-- Local verification of the live-events promises.
-- Run against a database with local-stubs.sql + every migration applied.
--
--   psql -d ll -f tests/local-stubs.sql
--   for f in supabase/migrations/*.sql; do psql -d ll -f "$f"; done
--   psql -d ll -c "grant all on all tables in schema public to authenticated"
--   psql -d ll -f tests/live_events_test.sql
--
-- The three sections worth reading first are 5 (no roster), 6 (a host sees no
-- vote and no email) and 8 (the pairing engine). Everything else is plumbing;
-- those three are the feature's actual promises.

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
  perform set_config('test.uid', u::text, false);
end $$;

-- ─── fixtures ─────────────────────────────────────────────────────────────

do $$
declare
  v_campus uuid; v_host uuid; v_staff uuid; v_biz uuid;
begin
  insert into universities (name, short_name, city, email_domains, areas, is_live)
  values ('Event U', 'EU', 'Eventville', array['ev.edu'], array['Central'], true)
  returning id into v_campus;

  insert into auth.users (email) values ('priya@ev.edu')  returning id into v_host;
  insert into auth.users (email) values ('admin@ev.edu')  returning id into v_staff;
  insert into auth.users (email) values ('owner@bar.com') returning id into v_biz;

  insert into profiles (id, university_id, first_name, gender, grad_year, major, age)
  values (v_staff, v_campus, 'Sam', 'nonbinary', '2026', 'Staff', 22);
  update profiles set is_admin = true where id = v_staff;

  perform set_config('test.campus', v_campus::text, false);
  perform set_config('test.host',   v_host::text, false);
  perform set_config('test.staff',  v_staff::text, false);
  perform set_config('test.biz',    v_biz::text, false);
end $$;

-- ─── 1. becoming a host ───────────────────────────────────────────────────

do $$
begin
  perform act_as(current_setting('test.host')::uuid);
  perform register_event_host('Priya R', 'Sigma Marketing');

  perform assert(exists (select 1 from event_hosts where user_id = auth.uid()),
                 'register_event_host creates the host row');
  perform assert(is_event_host(), 'is_event_host() is true for a host');
  perform assert((select status from event_hosts where user_id = auth.uid()) = 'pending',
                 'a new host starts pending, not approved');
end $$;

--  A host is not a member. This is the whole point: a club president should
--  never have to build a dating profile to run a rush event.
do $$
begin
  perform assert(
    not exists (select 1 from profiles where id = current_setting('test.host')::uuid),
    'a host has no profiles row');
end $$;

--  And a business is not a host. Letting a partner_users row also be an
--  event_hosts row would start exactly the ambiguity the partner platform
--  was built to avoid.
do $$
declare ok boolean := false;
begin
  perform act_as(current_setting('test.biz')::uuid);
  perform register_partner('Bar Owner', 'The Bar', 'bar');
  begin
    perform register_event_host('Bar Owner', 'The Bar');
  exception when others then ok := true;
  end;
  perform assert(ok, 'a partner account cannot register as an event host');
end $$;

-- ─── 2. creating and approving an event ───────────────────────────────────

do $$
declare v_ev uuid; v_code text;
begin
  perform act_as(current_setting('test.host')::uuid);
  v_ev := create_live_event('Speed Dating Night', 'Come meet people.', 'Union Room 3', now());
  perform set_config('test.event', v_ev::text, false);

  select code into v_code from live_events where id = v_ev;
  perform set_config('test.code', v_code, false);

  perform assert(length(v_code) = 6, 'the code is six characters');
  perform assert(v_code !~ '[ILOU]', 'the code has no I, L, O or U in it');
  perform assert((select status from live_events where id = v_ev) = 'draft',
                 'a new event is a draft');
  perform assert((select university_id from live_events where id = v_ev)
                 = current_setting('test.campus')::uuid,
                 'the event lands on the host''s campus');
end $$;

--  Joining a draft is impossible, which is what makes staff approval real
--  rather than decorative.
do $$
begin
  perform assert(not event_join_open(current_setting('test.event')::uuid),
                 'a draft event is not joinable');
end $$;

do $$
declare ok boolean := false;
begin
  perform act_as(current_setting('test.host')::uuid);
  perform submit_live_event(current_setting('test.event')::uuid);
  perform assert((select status from live_events where id = current_setting('test.event')::uuid)
                 = 'pending', 'submitting moves a draft to pending');

  --  A host cannot approve their own event.
  begin
    perform staff_set_live_event_status(current_setting('test.event')::uuid, 'approved');
  exception when others then ok := true;
  end;
  perform assert(ok, 'a host cannot approve their own event');

  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_live_event_status(current_setting('test.event')::uuid, 'approved');
  perform assert((select status from live_events where id = current_setting('test.event')::uuid)
                 = 'approved', 'staff approve the event');
  perform assert(event_join_open(current_setting('test.event')::uuid),
                 'an approved event is joinable');
end $$;

-- ─── 3. door questions ────────────────────────────────────────────────────

do $$
declare v_ev uuid := current_setting('test.event')::uuid; v_split uuid;
begin
  perform act_as(current_setting('test.host')::uuid);

  perform set_event_fields(v_ev, jsonb_build_array(
    jsonb_build_object('label', 'I''d like to meet', 'kind', 'choice',
                       'options', jsonb_build_array('Women', 'Men', 'Everyone'),
                       'required', true, 'use_for_pairing', true,
                       'show_to_partner', false),
    jsonb_build_object('label', 'Year', 'kind', 'choice',
                       'options', jsonb_build_array('First', 'Second', 'Third', 'Fourth'),
                       'required', false, 'show_to_partner', true),
    jsonb_build_object('label', 'Secret', 'kind', 'short_text',
                       'required', false, 'show_to_partner', false)
  ));

  perform assert((select count(*) from live_event_fields where event_id = v_ev) = 3,
                 'three fields saved');

  select split_field_id into v_split from live_events where id = v_ev;
  perform assert(v_split = (select id from live_event_fields
                             where event_id = v_ev and position = 0),
                 'the first use_for_pairing field becomes the split field');
  perform set_config('test.f_meet', v_split::text, false);
  perform set_config('test.f_year',
    (select id::text from live_event_fields where event_id = v_ev and position = 1), false);
  perform set_config('test.f_secret',
    (select id::text from live_event_fields where event_id = v_ev and position = 2), false);
end $$;

--  Six is the limit. This is the seam where a rotation timer quietly becomes
--  a general-purpose form builder, so the limit is in the database.
do $$
declare ok boolean := false; v_ev uuid := current_setting('test.event')::uuid; v_arr jsonb;
begin
  perform act_as(current_setting('test.host')::uuid);
  select jsonb_agg(jsonb_build_object('label', 'Q' || i, 'kind', 'short_text'))
    into v_arr from generate_series(1, 7) i;
  begin
    perform set_event_fields(v_ev, v_arr);
  exception when others then ok := true;
  end;
  perform assert(ok, 'seven door questions is refused');
end $$;

-- ─── 4. the door ──────────────────────────────────────────────────────────

--  Ten people, alternating what they want, so `across` has two groups.
do $$
declare
  v_ev uuid := current_setting('test.event')::uuid;
  v_u uuid; v_p uuid; v_meet text; i int;
begin
  for i in 1..10 loop
    insert into auth.users (email) values ('p' || i || '@ev.edu') returning id into v_u;
    perform act_as(v_u);
    v_meet := case when i % 2 = 0 then 'Women' else 'Men' end;

    v_p := join_live_event(
      current_setting('test.code'),
      'Person ' || i,
      jsonb_build_object(
        current_setting('test.f_meet'), v_meet,
        current_setting('test.f_year'), 'Second',
        current_setting('test.f_secret'), 'hidden-' || i,
        gen_random_uuid()::text, 'this key is not a field on this event'
      ));
    perform set_config('test.u' || i, v_u::text, false);
    perform set_config('test.p' || i, v_p::text, false);
  end loop;

  perform assert((select count(*) from live_event_participants where event_id = v_ev) = 10,
                 'ten people joined');
  perform assert((select count(distinct badge_no) from live_event_participants
                   where event_id = v_ev) = 10, 'badge numbers are unique');
  perform assert((select count(*) from live_event_answers a
                   join live_event_participants p on p.id = a.participant_id
                   where p.event_id = v_ev) = 30,
                 'only real fields were stored — an invented key writes nothing');
end $$;

--  A participant is a verified account with no dating profile. That is the
--  reframe the whole feature rests on.
do $$
begin
  perform assert(
    not exists (select 1 from profiles where id = current_setting('test.u1')::uuid),
    'joining an event creates no dating profile');
  perform assert(
    (select profile_id from live_event_participants where id = current_setting('test.p1')::uuid)
    is null,
    'a non-member participant has a null profile_id');
end $$;

--  Required means required, at the door and not only in the form.
do $$
declare v_u uuid; ok boolean := false;
begin
  insert into auth.users (email) values ('lazy@ev.edu') returning id into v_u;
  perform act_as(v_u);
  begin
    perform join_live_event(current_setting('test.code'), 'Lazy', '{}'::jsonb);
  exception when others then ok := true;
  end;
  perform assert(ok, 'a required question must be answered to get in');
end $$;

--  Rejoining is a returning phone, not a second person.
do $$
begin
  perform act_as(current_setting('test.u1')::uuid);
  perform assert(
    join_live_event(current_setting('test.code'), 'Person 1',
      jsonb_build_object(current_setting('test.f_meet'), 'Men'))
    = current_setting('test.p1')::uuid,
    'rejoining returns the same participant row');
end $$;

-- ═══ 5. ★ THE NO-ROSTER RULE ══════════════════════════════════════════════
--
--  The single most important section in this file. A participant can read
--  their own rows and nothing else. There is no query that hands anybody a
--  list of who is in the room.

do $$
declare n int;
begin
  perform act_as(current_setting('test.u1')::uuid);
  set local role authenticated;

  select count(*) into n from live_event_participants;
  perform assert(n = 1, 'a participant sees exactly one participant row: their own');

  select count(*) into n from live_event_answers;
  perform assert(n = 3, 'a participant reads only their own answers');

  select count(*) into n from live_event_votes;
  perform assert(n = 0, 'a participant reads no votes yet, including their own absent ones');

  select count(*) into n from event_hosts;
  perform assert(n = 0, 'a participant reads no host rows');

  select count(*) into n from live_events;
  perform assert(n = 1, 'a participant reads only the event they are in');

  reset role;
end $$;

--  And nobody outside the event reads anything about it.
do $$
declare v_u uuid; n int;
begin
  insert into auth.users (email) values ('outsider@ev.edu') returning id into v_u;
  perform act_as(v_u);
  set local role authenticated;

  select count(*) into n from live_event_participants;
  perform assert(n = 0, 'an outsider reads no participants');
  select count(*) into n from live_events;
  perform assert(n = 0, 'an outsider reads no events');
  select count(*) into n from live_event_pairings;
  perform assert(n = 0, 'an outsider reads no pairings');

  reset role;
end $$;

-- ═══ 6. ★ WHAT A HOST CANNOT SEE ══════════════════════════════════════════

do $$
declare v_roster jsonb;
begin
  perform act_as(current_setting('test.host')::uuid);
  v_roster := host_roster(current_setting('test.event')::uuid);

  perform assert(jsonb_array_length(v_roster) = 10, 'the host sees the room');
  perform assert(v_roster::text not like '%@ev.edu%',
                 'the roster contains no email address');
  perform assert(v_roster::text not like '%hidden-%',
                 'the roster contains no answers');
  perform assert(not (v_roster -> 0 ? 'email'), 'no email key on a roster row');
end $$;

do $$
declare n int;
begin
  perform act_as(current_setting('test.host')::uuid);
  set local role authenticated;

  select count(*) into n from live_event_answers;
  perform assert(n = 0, 'a host reads no answer rows directly');

  select count(*) into n from event_hosts;
  perform assert(n = 1, 'a host reads only their own host row');

  reset role;
end $$;

-- ─── 7. running it ────────────────────────────────────────────────────────

do $$
declare v_ev uuid := current_setting('test.event')::uuid;
begin
  perform act_as(current_setting('test.host')::uuid);
  perform update_live_event(v_ev, jsonb_build_object(
    'round_seconds', 60, 'break_seconds', 0, 'planned_rounds', 9,
    'advance', 'manual', 'pairing_mode', 'mixer'));
  perform start_live_event(v_ev);

  perform assert((select status from live_events where id = v_ev) = 'running',
                 'the event is running');
  perform assert((select count(*) from live_event_rounds where event_id = v_ev) = 1,
                 'starting generates exactly one round');
end $$;

--  A non-host cannot drive somebody else's event.
do $$
declare ok boolean := false;
begin
  perform act_as(current_setting('test.u1')::uuid);
  begin
    perform next_event_round(current_setting('test.event')::uuid);
  exception when others then ok := true;
  end;
  perform assert(ok, 'a participant cannot advance the round');
end $$;

-- ═══ 8. ★ THE PAIRING ENGINE ══════════════════════════════════════════════

--  Ten people, nine rounds: everybody should meet everybody exactly once,
--  with no repeats and no byes. This is the property the whole rotation is
--  for, and it is the one a naive implementation quietly gets wrong.
do $$
declare
  v_ev uuid := current_setting('test.event')::uuid;
  i int; n int;
begin
  perform act_as(current_setting('test.host')::uuid);
  for i in 2..9 loop
    perform next_event_round(v_ev);
  end loop;

  perform assert((select count(*) from live_event_rounds where event_id = v_ev) = 9,
                 'nine rounds for ten people');

  select count(*) into n from live_event_pairings where event_id = v_ev and bye;
  perform assert(n = 0, 'an even room has no byes');

  select count(*) into n from live_event_pairings where event_id = v_ev and repeat;
  perform assert(n = 0, 'nobody was seated with the same person twice');

  --  45 distinct pairs is every pair in a room of ten.
  select count(distinct (least(a_participant, b_participant),
                         greatest(a_participant, b_participant)))
    into n from live_event_pairings where event_id = v_ev and b_participant is not null;
  perform assert(n = 45, 'everyone met everyone: all 45 pairs, each exactly once');

  select count(*) into n from live_event_pairings where event_id = v_ev;
  perform assert(n = 45, 'and no pair was ever seated twice');
end $$;

--  Each round seats everybody, once.
do $$
declare r record; bad int := 0;
begin
  for r in select round_id, count(*) c from live_event_pairings
            where event_id = current_setting('test.event')::uuid
            group by round_id loop
    if r.c <> 5 then bad := bad + 1; end if;
  end loop;
  perform assert(bad = 0, 'every round seats all ten people at five stations');
end $$;

--  Stations are not double-booked inside a round.
do $$
declare n int;
begin
  select count(*) into n from (
    select round_id, station from live_event_pairings
     where event_id = current_setting('test.event')::uuid and station is not null
     group by round_id, station having count(*) > 1) t;
  perform assert(n = 0, 'no station is used twice in the same round');
end $$;

--  A tenth round has nobody new left to meet. It must still seat the room
--  rather than strand anybody — a repeat conversation is a worse round, two
--  byes is a worse night.
do $$
declare v_ev uuid := current_setting('test.event')::uuid; v_last uuid; n int;
begin
  perform act_as(current_setting('test.host')::uuid);
  perform update_live_event(v_ev, jsonb_build_object('planned_rounds', 10));
  perform next_event_round(v_ev);

  select id into v_last from live_event_rounds where event_id = v_ev
   order by index desc limit 1;

  select count(*) into n from live_event_pairings where round_id = v_last and bye;
  perform assert(n = 0, 'a tenth round strands nobody');
  select count(*) into n from live_event_pairings where round_id = v_last and repeat;
  perform assert(n = 5, 'it re-seats the room and marks every pair as a repeat');
end $$;

-- ── odd rooms and byes ────────────────────────────────────────────────────

do $$
declare
  v_ev uuid; v_u uuid; i int; n int; v_max int; v_min int;
begin
  perform act_as(current_setting('test.host')::uuid);
  v_ev := create_live_event('Odd Night', null, 'Room 4', now());
  perform set_config('test.odd', v_ev::text, false);
  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_live_event_status(v_ev, 'approved');

  for i in 1..7 loop
    insert into auth.users (email) values ('odd' || i || '@ev.edu') returning id into v_u;
    perform act_as(v_u);
    perform join_live_event((select code from live_events where id = v_ev),
                            'Odd ' || i, '{}'::jsonb);
  end loop;

  perform act_as(current_setting('test.host')::uuid);
  perform update_live_event(v_ev, jsonb_build_object(
    'round_seconds', 60, 'break_seconds', 0, 'planned_rounds', 7, 'advance', 'manual'));
  perform start_live_event(v_ev);
  for i in 2..7 loop perform next_event_round(v_ev); end loop;

  select count(*) into n from live_event_pairings where event_id = v_ev and bye;
  perform assert(n = 7, 'an odd room has exactly one bye per round');

  select max(bye_count), min(bye_count) into v_max, v_min
  from live_event_participants where event_id = v_ev;
  perform assert(v_max - v_min <= 1,
                 'byes are shared out evenly — nobody sits out twice before everybody once');

  select count(*) into n from live_event_pairings where event_id = v_ev and repeat;
  perform assert(n = 0, 'seven people, seven rounds, no repeats');
end $$;

-- ── the split field: `across` never seats two of the same answer ──────────

do $$
declare
  v_ev uuid; v_u uuid; v_f uuid; i int; n int;
begin
  perform act_as(current_setting('test.host')::uuid);
  v_ev := create_live_event('Rush Mixer', null, 'Chapter Room', now());
  perform set_event_fields(v_ev, jsonb_build_array(
    jsonb_build_object('label', 'I am a', 'kind', 'choice',
      'options', jsonb_build_array('Rush', 'Active'),
      'required', true, 'use_for_pairing', true)));
  select split_field_id into v_f from live_events where id = v_ev;

  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_live_event_status(v_ev, 'approved');

  for i in 1..8 loop
    insert into auth.users (email) values ('rush' || i || '@ev.edu') returning id into v_u;
    perform act_as(v_u);
    perform join_live_event((select code from live_events where id = v_ev), 'R' || i,
      jsonb_build_object(v_f::text, case when i <= 4 then 'Rush' else 'Active' end));
  end loop;

  perform act_as(current_setting('test.host')::uuid);
  perform update_live_event(v_ev, jsonb_build_object(
    'round_seconds', 60, 'break_seconds', 0, 'planned_rounds', 4,
    'advance', 'manual', 'pairing_mode', 'across'));
  perform start_live_event(v_ev);
  for i in 2..4 loop perform next_event_round(v_ev); end loop;

  select count(*) into n
  from live_event_pairings pr
  join live_event_answers aa on aa.participant_id = pr.a_participant and aa.field_id = v_f
  join live_event_answers ab on ab.participant_id = pr.b_participant and ab.field_id = v_f
  where pr.event_id = v_ev and aa.value[1] = ab.value[1];
  perform assert(n = 0, 'across mode never seats two rushes or two actives together');

  select count(*) into n from live_event_pairings where event_id = v_ev and bye;
  perform assert(n = 0, 'four and four pairs off with nobody sitting out');
end $$;

--  Uneven groups: the surplus side takes byes rather than being seated with
--  itself. Losing the constraint would be worse than losing a seat.
do $$
declare
  v_ev uuid; v_u uuid; v_f uuid; i int; n int;
begin
  perform act_as(current_setting('test.host')::uuid);
  v_ev := create_live_event('Lopsided', null, 'Room 9', now());
  perform set_event_fields(v_ev, jsonb_build_array(
    jsonb_build_object('label', 'Side', 'kind', 'choice',
      'options', jsonb_build_array('A', 'B'), 'required', true, 'use_for_pairing', true)));
  select split_field_id into v_f from live_events where id = v_ev;

  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_live_event_status(v_ev, 'approved');

  for i in 1..6 loop
    insert into auth.users (email) values ('lop' || i || '@ev.edu') returning id into v_u;
    perform act_as(v_u);
    perform join_live_event((select code from live_events where id = v_ev), 'L' || i,
      jsonb_build_object(v_f::text, case when i <= 4 then 'A' else 'B' end));
  end loop;

  perform act_as(current_setting('test.host')::uuid);
  perform update_live_event(v_ev, jsonb_build_object(
    'round_seconds', 60, 'break_seconds', 0, 'planned_rounds', 2,
    'advance', 'manual', 'pairing_mode', 'across'));
  perform start_live_event(v_ev);

  select count(*) into n from live_event_pairings
   where event_id = v_ev and bye
     and round_id = (select id from live_event_rounds where event_id = v_ev and index = 1);
  perform assert(n = 2, 'four A''s and two B''s leaves two A''s sitting out');

  select count(*) into n
  from live_event_pairings pr
  join live_event_answers aa on aa.participant_id = pr.a_participant and aa.field_id = v_f
  join live_event_answers ab on ab.participant_id = pr.b_participant and ab.field_id = v_f
  where pr.event_id = v_ev and aa.value[1] = ab.value[1];
  perform assert(n = 0, 'and still never seats two of the same side together');
end $$;

-- ─── 9. votes, and what a no means ────────────────────────────────────────

do $$
declare
  v_ev uuid := current_setting('test.event')::uuid;
  v_pair uuid; v_a uuid; v_b uuid;
begin
  --  Find round 1's first pairing and have both sides say yes.
  select id, a_participant, b_participant into v_pair, v_a, v_b
  from live_event_pairings
  where round_id = (select id from live_event_rounds where event_id = v_ev and index = 1)
  limit 1;
  perform set_config('test.pair', v_pair::text, false);
  perform set_config('test.pa', v_a::text, false);
  perform set_config('test.pb', v_b::text, false);

  perform act_as((select user_id from live_event_participants where id = v_a));
  perform cast_event_vote(v_pair, true, 'green jacket, likes climbing');

  perform assert(not exists (select 1 from live_event_matches
                              where event_id = v_ev
                                and (a_participant = v_a or b_participant = v_a)),
                 'one yes is not a match');

  perform act_as((select user_id from live_event_participants where id = v_b));
  perform cast_event_vote(v_pair, true, null);

  perform assert(exists (select 1 from live_event_matches
                          where event_id = v_ev
                            and a_participant = least(v_a, v_b)
                            and b_participant = greatest(v_a, v_b)),
                 'two yeses make a match');
end $$;

--  A no is invisible forever. Not to the other person, not to the host.
do $$
declare
  v_ev uuid := current_setting('test.event')::uuid;
  v_pair uuid; v_a uuid; v_b uuid; n int;
begin
  select id, a_participant, b_participant into v_pair, v_a, v_b
  from live_event_pairings
  where round_id = (select id from live_event_rounds where event_id = v_ev and index = 2)
  limit 1;

  perform act_as((select user_id from live_event_participants where id = v_a));
  perform cast_event_vote(v_pair, true, null);
  perform act_as((select user_id from live_event_participants where id = v_b));
  perform cast_event_vote(v_pair, false, null);

  perform assert(not exists (select 1 from live_event_matches
                              where event_id = v_ev
                                and a_participant = least(v_a, v_b)
                                and b_participant = greatest(v_a, v_b)),
                 'a yes and a no is not a match');

  --  The person who was turned down reads nothing about it.
  perform act_as((select user_id from live_event_participants where id = v_a));
  set local role authenticated;
  select count(*) into n from live_event_votes;
  perform assert(n = 2, 'you read your own votes and only your own');
  reset role;
end $$;

-- ═══ 10. ★ A HOST SEES COUNTS, NEVER A VOTE ═══════════════════════════════

do $$
declare n int; v_sum jsonb;
begin
  perform act_as(current_setting('test.host')::uuid);
  set local role authenticated;

  select count(*) into n from live_event_votes;
  perform assert(n = 0, 'a host reads ZERO vote rows');

  select count(*) into n from live_event_matches;
  perform assert(n = 0, 'a host reads ZERO match rows');

  reset role;

  v_sum := host_event_summary(current_setting('test.event')::uuid);
  perform assert((v_sum ->> 'matches')::int = 1,
                 'the host is told how many matches there were');
  perform assert((v_sum ->> 'here')::int = 10, 'and how many people are here');
  perform assert((v_sum ->> 'conversations')::int = 50, 'and how many conversations happened');
  perform assert(not (v_sum ? 'who'), 'and nothing that names anybody');
end $$;

--  Another participant cannot read a vote either, in any direction.
do $$
declare n int;
begin
  perform act_as(current_setting('test.u5')::uuid);
  set local role authenticated;
  select count(*) into n from live_event_votes v
   where v.voter_id <> (select id from live_event_participants
                         where event_id = current_setting('test.event')::uuid
                           and user_id = auth.uid());
  perform assert(n = 0, 'nobody reads a vote that is not theirs');
  reset role;
end $$;

-- ─── 11. reveal ───────────────────────────────────────────────────────────

do $$
declare n int; v_me uuid;
begin
  --  reveal = 'end' and the host has not ended it yet.
  perform act_as((select user_id from live_event_participants
                   where id = current_setting('test.pa')::uuid));
  set local role authenticated;
  select count(*) into n from live_event_matches;
  perform assert(n = 0, 'before the reveal, a match is not readable by its own people');
  reset role;

  perform act_as(current_setting('test.host')::uuid);
  perform reveal_event_matches(current_setting('test.event')::uuid);

  perform act_as((select user_id from live_event_participants
                   where id = current_setting('test.pa')::uuid));
  set local role authenticated;
  select count(*) into n from live_event_matches;
  perform assert(n = 1, 'after the reveal, both people can see it');
  reset role;
end $$;

--  reveal = 'never' means never, and `reveal_event_matches` cannot override it.
do $$
declare v_ev uuid;
begin
  perform act_as(current_setting('test.host')::uuid);
  v_ev := create_live_event('Club Night', null, 'Room 1', now());
  perform update_live_event(v_ev, jsonb_build_object(
    'likes_enabled', false, 'reveal', 'never'));
  perform reveal_event_matches(v_ev);
  perform assert((select matches_revealed_at from live_events where id = v_ev) is null,
                 'reveal = never cannot be revealed');
  perform set_config('test.club', v_ev::text, false);
end $$;

--  A club that turned matching off cannot have votes cast at all.
do $$
declare v_ok boolean := false; v_u uuid; v_ev uuid := current_setting('test.club')::uuid;
begin
  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_live_event_status(v_ev, 'approved');

  insert into auth.users (email) values ('club1@ev.edu') returning id into v_u;
  perform act_as(v_u);
  perform join_live_event((select code from live_events where id = v_ev), 'C1', '{}'::jsonb);
  insert into auth.users (email) values ('club2@ev.edu') returning id into v_u;
  perform act_as(v_u);
  perform join_live_event((select code from live_events where id = v_ev), 'C2', '{}'::jsonb);

  perform act_as(current_setting('test.host')::uuid);
  perform update_live_event(v_ev, jsonb_build_object('advance', 'manual', 'planned_rounds', 1));
  perform start_live_event(v_ev);

  perform act_as(v_u);
  begin
    perform cast_event_vote(
      (select id from live_event_pairings where event_id = v_ev limit 1), true, null);
  exception when others then v_ok := true;
  end;
  perform assert(v_ok, 'an event with matching off refuses a vote');
end $$;

-- ─── 12. becoming a member afterwards ─────────────────────────────────────
--
--  The conversion mechanic. Two people matched at the event and neither had a
--  profile, so there is no conversation — that is the honest reason to build
--  one. The moment they both do, the thread opens by itself.

do $$
declare v_a uuid := current_setting('test.pa')::uuid;
        v_b uuid := current_setting('test.pb')::uuid;
begin
  perform assert((select match_id from live_event_matches
                   where a_participant = least(v_a, v_b)
                     and b_participant = greatest(v_a, v_b)) is null,
                 'no profiles, no conversation — the match is a promise');
end $$;

do $$
declare
  v_campus uuid := current_setting('test.campus')::uuid;
  v_ua uuid; v_ub uuid; v_a uuid := current_setting('test.pa')::uuid;
  v_b uuid := current_setting('test.pb')::uuid; v_match uuid;
begin
  select user_id into v_ua from live_event_participants where id = v_a;
  select user_id into v_ub from live_event_participants where id = v_b;

  --  The first one builds a profile. Still no conversation: it takes two.
  insert into profiles (id, university_id, first_name, gender, grad_year, major, age)
  values (v_ua, v_campus, 'Ada', 'woman', '2027', 'CS', 20);

  perform assert((select profile_id from live_event_participants where id = v_a) = v_ua,
                 'building a profile backfills the participant row');
  perform assert((select match_id from live_event_matches
                   where a_participant = least(v_a, v_b)
                     and b_participant = greatest(v_a, v_b)) is null,
                 'one profile is still not a conversation');

  --  The second one does too, and the thread opens.
  insert into profiles (id, university_id, first_name, gender, grad_year, major, age)
  values (v_ub, v_campus, 'Bo', 'man', '2027', 'History', 21);

  select match_id into v_match from live_event_matches
   where a_participant = least(v_a, v_b) and b_participant = greatest(v_a, v_b);

  perform assert(v_match is not null, 'both profiles: the event match becomes a real match');
  perform assert(exists (select 1 from conversations where match_id = v_match),
                 'and a conversation is open before they leave the room');
  perform assert(exists (select 1 from matches
                          where id = v_match
                            and profile_a = least(v_ua, v_ub)
                            and profile_b = greatest(v_ua, v_ub)),
                 'with the canonical a<b ordering the rest of the app expects');
end $$;

-- ─── 13. staff ────────────────────────────────────────────────────────────

do $$
declare ok boolean := false;
begin
  perform act_as(current_setting('test.u1')::uuid);
  begin
    perform staff_live_events();
  exception when others then ok := true;
  end;
  perform assert(ok, 'a participant gets Not authorised from staff_live_events');

  ok := false;
  perform act_as(current_setting('test.host')::uuid);
  begin
    perform staff_live_events();
  exception when others then ok := true;
  end;
  perform assert(ok, 'so does a host');

  perform act_as(current_setting('test.staff')::uuid);
  perform assert(jsonb_array_length(staff_live_events()) >= 4, 'staff see the queue');
end $$;

-- ─── 14. event_state, the one endpoint every phone polls ──────────────────

do $$
declare v_s jsonb; v_shown jsonb;
begin
  perform act_as(current_setting('test.u1')::uuid);
  v_s := event_state(current_setting('test.code'));

  perform assert(v_s -> 'me' ->> 'name' = 'Person 1', 'it knows who is asking');
  perform assert((v_s ->> 'here')::int = 10, 'it reports the headcount');
  perform assert(v_s -> 'round' ->> 'index' = '10', 'it reports the current round');
  perform assert(v_s -> 'round' -> 'partner' ->> 'name' is not null,
                 'it names the one person you are sitting with');

  --  ★ Exactly the fields the host marked show_to_partner. Not the others.
  v_shown := v_s -> 'round' -> 'partner' -> 'shown';
  perform assert(v_shown::text like '%Year%', 'a shown field reaches the other seat');
  perform assert(v_shown::text not like '%Secret%', 'an unshown field does not');
  perform assert(v_shown::text not like '%hidden-%', 'nor does its value');
  perform assert(v_s::text not like '%@ev.edu%', 'no email address anywhere in event_state');
end $$;

--  Somebody who has not joined gets the poster, not the room.
do $$
declare v_u uuid; v_s jsonb;
begin
  insert into auth.users (email) values ('curious@ev.edu') returning id into v_u;
  perform act_as(v_u);
  v_s := event_state(current_setting('test.code'));
  perform assert(v_s -> 'me' = 'null'::jsonb, 'a non-participant is nobody in the room');
  perform assert(v_s -> 'event' ->> 'title' = 'Speed Dating Night',
                 'but they can still read the poster');
  perform assert(not (v_s ? 'here'), 'and they are not told how many people are inside');
end $$;

--  event_preview is the pre-registration surface: readable signed out, and it
--  is not a roster either.
do $$
declare v_p jsonb;
begin
  perform set_config('test.uid', '', false);
  v_p := event_preview(current_setting('test.code'));
  perform assert(v_p ->> 'title' = 'Speed Dating Night', 'the poster reads signed out');
  perform assert(v_p ->> 'org_name' = 'Sigma Marketing', 'and names the club');
  perform assert(jsonb_array_length(v_p -> 'fields') = 3, 'and carries the door questions');
  perform assert(not (v_p ? 'here') and not (v_p ? 'participants'),
                 'and says nothing about who is coming');
end $$;

-- ─── 15. leaving, and the automatic advance ───────────────────────────────

do $$
declare v_ev uuid := current_setting('test.event')::uuid; n int;
begin
  perform act_as(current_setting('test.u9')::uuid);
  perform leave_live_event(v_ev);
  perform assert((select state from live_event_participants
                   where id = current_setting('test.p9')::uuid) = 'left',
                 'leaving marks you left');

  perform act_as(current_setting('test.host')::uuid);
  perform update_live_event(v_ev, jsonb_build_object('planned_rounds', 11));
  perform next_event_round(v_ev);

  select count(*) into n from live_event_pairings
   where round_id = (select id from live_event_rounds where event_id = v_ev
                      order by index desc limit 1);
  perform assert(n = 5, 'nine people left in the room: four pairs and a bye');

  select count(*) into n from live_event_pairings
   where round_id = (select id from live_event_rounds where event_id = v_ev
                      order by index desc limit 1)
     and (a_participant = current_setting('test.p9')::uuid
          or b_participant = current_setting('test.p9')::uuid);
  perform assert(n = 0, 'and somebody who left is not seated');
end $$;

--  Auto-advance: the event drives itself so a sleeping host phone cannot
--  stop the room. Rewinding the clock is how we test that without waiting.
do $$
declare
  v_ev uuid; v_u uuid; i int; v_before int; v_after int;
begin
  perform act_as(current_setting('test.host')::uuid);
  v_ev := create_live_event('Auto Night', null, 'Room 7', now());
  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_live_event_status(v_ev, 'approved');

  for i in 1..4 loop
    insert into auth.users (email) values ('auto' || i || '@ev.edu') returning id into v_u;
    perform act_as(v_u);
    perform join_live_event((select code from live_events where id = v_ev),
                            'A' || i, '{}'::jsonb);
    perform set_config('test.auto_u', v_u::text, false);
  end loop;

  perform act_as(current_setting('test.host')::uuid);
  perform update_live_event(v_ev, jsonb_build_object(
    'round_seconds', 120, 'break_seconds', 30, 'planned_rounds', 3, 'advance', 'auto'));
  perform start_live_event(v_ev);

  select count(*) into v_before from live_event_rounds where event_id = v_ev;

  --  A participant asks what's happening, mid-round: nothing changes.
  perform act_as(current_setting('test.auto_u')::uuid);
  perform event_state((select code from live_events where id = v_ev));
  select count(*) into v_after from live_event_rounds where event_id = v_ev;
  perform assert(v_after = v_before, 'polling mid-round does not advance anything');

  --  Now the round and its break have gone by.
  update live_event_rounds
     set starts_at = starts_at - interval '5 minutes',
         ends_at   = ends_at   - interval '5 minutes'
   where event_id = v_ev;

  perform event_state((select code from live_events where id = v_ev));
  select count(*) into v_after from live_event_rounds where event_id = v_ev;
  perform assert(v_after = v_before + 1,
                 'a participant''s poll starts the next round — the host''s screen is not load-bearing');
end $$;

--  And it stops at planned_rounds rather than running forever.
do $$
declare v_ev uuid; v_code text; n int;
begin
  select id, code into v_ev, v_code from live_events where title = 'Auto Night';
  for n in 1..4 loop
    update live_event_rounds
       set starts_at = starts_at - interval '5 minutes',
           ends_at   = ends_at   - interval '5 minutes'
     where event_id = v_ev;
    perform act_as(current_setting('test.auto_u')::uuid);
    perform event_state(v_code);
  end loop;

  select count(*) into n from live_event_rounds where event_id = v_ev;
  perform assert(n = 3, 'it stops at planned_rounds');
  perform assert((select status from live_events where id = v_ev) = 'ended',
                 'and ends the event rather than spinning');
end $$;

-- ─── 16. the door closes ──────────────────────────────────────────────────

do $$
declare v_ev uuid; v_u uuid; ok boolean := false;
begin
  perform act_as(current_setting('test.host')::uuid);
  v_ev := create_live_event('Closed Door', null, 'Room 2', now());
  perform update_live_event(v_ev, jsonb_build_object('join_opens', 'until_start'));
  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_live_event_status(v_ev, 'approved');

  insert into auth.users (email) values ('early@ev.edu') returning id into v_u;
  perform act_as(v_u);
  perform join_live_event((select code from live_events where id = v_ev), 'Early', '{}'::jsonb);

  insert into auth.users (email) values ('early2@ev.edu') returning id into v_u;
  perform act_as(v_u);
  perform join_live_event((select code from live_events where id = v_ev), 'Early2', '{}'::jsonb);

  perform act_as(current_setting('test.host')::uuid);
  perform start_live_event(v_ev);

  insert into auth.users (email) values ('late@ev.edu') returning id into v_u;
  perform act_as(v_u);
  begin
    perform join_live_event((select code from live_events where id = v_ev), 'Late', '{}'::jsonb);
  exception when others then ok := true;
  end;
  perform assert(ok, 'join_opens = until_start shuts the door when the event starts');
end $$;

--  A killed event admits nobody.
do $$
declare v_ev uuid := current_setting('test.club')::uuid; v_u uuid; ok boolean := false;
begin
  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_live_event_status(v_ev, 'killed', 'Reported by three people.');

  insert into auth.users (email) values ('afterkill@ev.edu') returning id into v_u;
  perform act_as(v_u);
  begin
    perform join_live_event((select code from live_events where id = v_ev), 'Nope', '{}'::jsonb);
  exception when others then ok := true;
  end;
  perform assert(ok, 'a killed event admits nobody');
end $$;

-- ─── 17. suspending a host ────────────────────────────────────────────────
--
--  Last, deliberately: this kills every event the host has, so anything that
--  reads one of them has to have run already. Suspension is a blunt
--  instrument on purpose — a host we have stopped trusting should not have a
--  room still running somewhere on campus.

do $$
begin
  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_host_status(current_setting('test.host')::uuid, 'suspended');

  perform assert((select status from live_events where id = current_setting('test.odd')::uuid)
                 = 'killed',
                 'suspending a host kills their events, including one mid-round');
  perform assert((select status from live_events where id = current_setting('test.event')::uuid)
                 = 'killed',
                 'all of them, not just the one that was running');

  perform assert(not event_join_open(current_setting('test.event')::uuid),
                 'and nobody else gets in');

  perform staff_set_host_status(current_setting('test.host')::uuid, 'approved');
  perform assert((select status from event_hosts
                   where user_id = current_setting('test.host')::uuid) = 'approved',
                 'a host can be reinstated');
  perform assert((select status from live_events where id = current_setting('test.event')::uuid)
                 = 'killed',
                 'but a killed event stays killed — reinstating is not undoing');
end $$;

do $$ begin raise notice '─────────────────────────────────────'; end $$;
do $$ begin raise notice 'live events: all assertions passed.'; end $$;
