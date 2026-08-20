-- Local verification of the partner platform's load-bearing promises.
-- Run against a database with stubs.sql + every migration applied.

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
  v_campus uuid; v_a uuid; v_b uuid; v_biz uuid; v_staff uuid;
begin
  insert into universities (name, short_name, city, email_domains, areas, is_live)
  values ('Test U', 'TU', 'Testville', array['test.edu'], array['Central'], true)
  returning id into v_campus;

  insert into auth.users (email) values ('ada@test.edu')  returning id into v_a;
  insert into auth.users (email) values ('bo@test.edu')   returning id into v_b;
  insert into auth.users (email) values ('owner@jolly.com') returning id into v_biz;
  insert into auth.users (email) values ('staff@test.edu') returning id into v_staff;

  insert into profiles (id, university_id, first_name, gender, grad_year, major, age)
  values (v_a, v_campus, 'Ada', 'woman', '2027', 'CS', 20),
         (v_b, v_campus, 'Bo',  'man',   '2027', 'History', 21),
         (v_staff, v_campus, 'Sam', 'nonbinary', '2026', 'Staff', 22);

  update profiles set is_admin = true where id = v_staff;

  insert into profile_preferences (profile_id, interested_in, min_age, max_age)
  values (v_a, array['man'], 18, 30), (v_b, array['woman'], 18, 30);

  insert into interests (id, label, emoji) values ('coffee','Coffee','☕'), ('foodie','Foodie','🍽')
  on conflict do nothing;
  insert into profile_interests (profile_id, interest_id) values (v_a, 'coffee'), (v_b, 'coffee');

  perform set_config('test.campus', v_campus::text, false);
  perform set_config('test.ada',    v_a::text, false);
  perform set_config('test.bo',     v_b::text, false);
  perform set_config('test.biz',    v_biz::text, false);
  perform set_config('test.staff',  v_staff::text, false);
end $$;

-- ─── 1. registering a partner ─────────────────────────────────────────────

do $$
declare v_partner uuid; v_campus uuid := current_setting('test.campus')::uuid;
begin
  perform act_as(current_setting('test.biz')::uuid);
  v_partner := register_partner('Sam Owner', 'Jolly Pumpkin', 'brewery');
  perform set_config('test.partner', v_partner::text, false);

  perform assert(exists (select 1 from partner_users where id = auth.uid()),
                 'register_partner creates the partner_user');
  perform assert(exists (select 1 from partner_members
                          where partner_id = v_partner and role = 'owner'),
                 'register_partner makes the caller owner');
  perform assert(is_partner_admin(v_partner), 'owner is a partner admin');
  perform assert(not is_partner_admin(gen_random_uuid()), 'not an admin of a random business');
end $$;

-- A partner account and a member profile are mutually exclusive.
do $$
declare v_campus uuid := current_setting('test.campus')::uuid; ok boolean := false;
begin
  begin
    insert into profiles (id, university_id, first_name, gender, grad_year, major, age)
    values (current_setting('test.biz')::uuid, v_campus, 'Sam', 'man', '2027', 'X', 30);
  exception when others then ok := true;
  end;
  perform assert(ok, 'a partner account cannot also become a member profile');
end $$;

-- ─── 2. the campus domain rule now lives on the profiles policy ───────────

do $$
declare v_campus uuid := current_setting('test.campus')::uuid; v_out uuid; ok boolean := false;
begin
  insert into auth.users (email) values ('stranger@gmail.com') returning id into v_out;
  perform act_as(v_out);
  perform assert(not email_matches_campus(v_campus),
                 'a gmail address does not match a campus');
  perform act_as(current_setting('test.ada')::uuid);
  perform assert(email_matches_campus(v_campus),
                 'a test.edu address matches the Test U campus');
end $$;

-- ─── 3. plan, location, spot, offer ───────────────────────────────────────

do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_campus  uuid := current_setting('test.campus')::uuid;
  v_loc uuid; v_spot uuid; v_offer uuid;
begin
  perform act_as(current_setting('test.biz')::uuid);

  -- Nothing paid yet: no entitlements, not live.
  perform assert(partner_entitlements(v_partner) = '{}'::jsonb,
                 'an unpaid partner has no entitlements');
  perform assert(not partner_is_live(v_partner), 'an unapproved partner is not live');

  insert into partner_subscriptions (partner_id, plan_id, status, current_period_end)
  values (v_partner, 'date-partner', 'active', now() + interval '30 days');

  perform assert(not partner_is_live(v_partner),
                 'paying is not enough — a partner still needs approval');

  update partners set status = 'active' where id = v_partner;
  perform assert(partner_is_live(v_partner), 'approved and paid = live');
  perform assert(partner_has(v_partner, 'date_passes'), 'the top plan includes Date Passes');

  insert into partner_locations (partner_id, university_id, address_line, walk_minutes,
                                 distance_miles, price_level, is_primary)
  values (v_partner, v_campus, '311 S Main St', 9, 0.8, 2, true)
  returning id into v_loc;

  v_spot := save_date_spot(v_loc, jsonb_build_object(
    'name', 'Jolly Pumpkin', 'kind', 'Food & Drinks',
    'note', 'Never a bad table',
    'date_types', jsonb_build_array('dinner','drinks','first-date'),
    'vibes', jsonb_build_array('social','foodie'),
    'price_level', 2, 'walk_minutes', 9, 'distance_miles', 0.8,
    'is_published', true));

  perform set_config('test.loc', v_loc::text, false);
  perform set_config('test.spot', v_spot::text, false);

  perform assert((select partner_id from date_spots where id = v_spot) = v_partner,
                 'save_date_spot attributes the spot to the right business');
  perform assert((select university_id from date_spots where id = v_spot) = v_campus,
                 'the spot inherits the campus of its address');

  insert into partner_offers (partner_id, title, offer_type, percent_off,
                              days_of_week, status, max_monthly_redemptions, terms)
  values (v_partner, 'Weeknight Date', 'percent_off', 15,
          array[0,1,2,3,4], 'active', 100, 'Dine-in only.')
  returning id into v_offer;
  perform set_config('test.offer', v_offer::text, false);
end $$;

-- An organic spot that actually matches what someone asked for.
do $$
declare v_campus uuid := current_setting('test.campus')::uuid; v_id uuid;
begin
  insert into date_spots (university_id, name, kind, date_types, vibes,
                          price_level, walk_minutes, is_published)
  values (v_campus, 'Vertex Coffee', 'Coffee', array['coffee','first-date'],
          array['quiet','cozy'], 1, 8, true)
  returning id into v_id;
  perform set_config('test.organic', v_id::text, false);
end $$;

-- ─── 4. relevance beats payment ───────────────────────────────────────────
--  Ada asks for coffee. Jolly Pumpkin is a paying Date Partner with a live
--  offer and featured placement; it does not serve coffee. Vertex is free and
--  does. The free one must win, and the paid one must not appear at all.

do $$
declare
  r record; v_first uuid; v_paid_shown boolean := false; n int := 0;
begin
  perform act_as(current_setting('test.ada')::uuid);

  for r in select * from recommend_date_spots('coffee', array['cozy'], 2, null, now(), null, 'planner', 10)
  loop
    n := n + 1;
    if n = 1 then v_first := r.spot_id; end if;
    if r.spot_id = current_setting('test.spot')::uuid then v_paid_shown := true; end if;
  end loop;

  perform assert(v_first = current_setting('test.organic')::uuid,
                 'asked for coffee: the free coffee shop ranks first, over a paying brewery');
  perform assert(not v_paid_shown,
                 'a paying partner that does not fit the request is not shown at all');
end $$;

--  Same partner, a request it genuinely fits: now it should appear.
do $$
declare v_first uuid;
begin
  perform act_as(current_setting('test.ada')::uuid);
  select spot_id into v_first
  from recommend_date_spots('dinner', array['social'], 3, null, now(), null, 'planner', 10)
  limit 1;
  perform assert(v_first = current_setting('test.spot')::uuid,
                 'asked for dinner: the partner that actually fits ranks first');
end $$;

--  Within a set that all match, money still cannot close a relevance gap.
--  Two dinner spots: a free one that is closer, cheaper and matches both
--  vibes, and a paying Featured partner that matches neither. The free one
--  wins, because the most a plan can add is 10 and the gap here is larger.
do $$
declare v_campus uuid := current_setting('test.campus')::uuid; v_free uuid; v_first uuid;
begin
  insert into date_spots (university_id, name, kind, date_types, vibes,
                          price_level, walk_minutes, is_published)
  values (v_campus, 'The Free Table', 'Food', array['dinner'],
          array['cozy','quiet'], 1, 3, true)
  returning id into v_free;

  perform act_as(current_setting('test.ada')::uuid);
  select spot_id into v_first
  from recommend_date_spots('dinner', array['cozy','quiet'], 1, null, now(), null, 'planner', 10)
  limit 1;

  perform assert(v_first = v_free,
                 'a free spot that fits better still outranks a paying Featured Partner');

  delete from date_spots where id = v_free;
end $$;

-- ─── 5. a dismissal is remembered ─────────────────────────────────────────

do $$
declare n_before int; n_after int;
begin
  perform act_as(current_setting('test.ada')::uuid);
  select count(*) into n_before
  from recommend_date_spots('dinner', '{}', null, null, now(), null, 'planner', 10);

  perform log_recommendation(current_setting('test.spot')::uuid, 'planner', null, 1, 90, 'dismissed');

  select count(*) into n_after
  from recommend_date_spots('dinner', '{}', null, null, now(), null, 'planner', 10);

  perform assert(n_after = n_before - 1,
                 'a spot someone waved away is not offered again');

  delete from recommendation_events where viewer = auth.uid() and outcome = 'dismissed';
end $$;

-- ─── 6. offer windows ─────────────────────────────────────────────────────

do $$
declare v_offer uuid := current_setting('test.offer')::uuid;
begin
  -- Sunday–Thursday offer, asked about on a Friday.
  perform assert(not offer_is_open(v_offer, timestamptz '2026-08-21 19:00+00'),
                 'a Sunday–Thursday offer is closed on a Friday');
  perform assert(offer_is_open(v_offer, timestamptz '2026-08-19 19:00+00'),
                 'the same offer is open on a Wednesday');
  perform assert(days_label(array[0,1,2,3,4]) = 'Sunday–Thursday',
                 'days_label reads like English');
  perform assert(days_label(array[0,1,2,3,4,5,6]) = 'Any day',
                 'every day reads as Any day');
end $$;

-- ─── 7. issuing and redeeming a pass ──────────────────────────────────────

do $$
declare r record; v_code text;
begin
  perform act_as(current_setting('test.ada')::uuid);
  select * into r from issue_date_pass(current_setting('test.offer')::uuid, null, 'planner');
  v_code := r.pass_code;
  perform set_config('test.code', v_code, false);

  perform assert(v_code like 'LL-%', 'a pass code is recognisably a Loose Leaf one');
  perform assert(r.pass_expires_at > now(), 'a fresh pass has a future expiry');

  -- Asking twice hands back the same ticket rather than minting another.
  select * into r from issue_date_pass(current_setting('test.offer')::uuid, null, 'planner');
  perform assert(r.pass_code = v_code, 'unlocking the same offer twice returns the same pass');
  perform assert((select count(*) from date_passes where issued_to = auth.uid()) = 1,
                 'and does not create a second one');
end $$;

do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_code text := current_setting('test.code');
  r record;
begin
  perform act_as(current_setting('test.biz')::uuid);

  select * into r from partner_lookup_pass(v_partner, v_code);
  perform assert(r.valid, 'the business sees a valid pass');
  perform assert(r.offer_summary = '15% off', 'and the offer it is for');

  -- lowercase, and without the LL- prefix, the way somebody would type it
  select * into r from partner_lookup_pass(v_partner, lower(replace(v_code, 'LL-', '')));
  perform assert(r.valid, 'a hand-typed code is forgiving about case and prefix');

  select * into r from redeem_date_pass(v_partner, v_code, 4200);
  perform assert(r.ok, 'redemption succeeds once');

  select * into r from redeem_date_pass(v_partner, v_code, 4200);
  perform assert(not r.ok and r.reason = 'Already used.',
                 'and refuses the second time — the pass is single-use');

  perform assert((select count(*) from date_pass_redemptions
                   where pass_id = (select id from date_passes where code = v_code)) = 1,
                 'exactly one redemption is recorded');
  perform assert((select stage from partner_events
                   where partner_id = v_partner order by id desc limit 1) = 'verified_date',
                 'a verified date lands in the funnel');
end $$;

-- A code from another business is reported as unknown, not as "not yours".
do $$
declare r record; v_other uuid;
begin
  perform act_as(current_setting('test.biz')::uuid);
  insert into partners (name, category, status) values ('Somewhere Else', 'cafe', 'active')
  returning id into v_other;
  insert into partner_members (partner_id, partner_user_id, role)
  values (v_other, auth.uid(), 'owner');
  insert into partner_subscriptions (partner_id, plan_id, status)
  values (v_other, 'date-partner', 'active');

  select * into r from partner_lookup_pass(v_other, current_setting('test.code'));
  perform assert(not r.valid and r.reason = 'We don''t recognise that code.',
                 'a pass for another business reads as unknown, leaking nothing');
end $$;

-- ─── 8. privacy: what a partner cannot reach ──────────────────────────────

do $$
declare n int;
begin
  perform act_as(current_setting('test.biz')::uuid);
  set local role authenticated;

  select count(*) into n from date_passes;
  perform assert(n = 0, 'a partner reads no rows at all from date_passes');

  select count(*) into n from profiles;
  perform assert(n = 0, 'a partner reads no student profiles');

  select count(*) into n from messages;
  perform assert(n = 0, 'a partner reads no messages');

  select count(*) into n from likes;
  perform assert(n = 0, 'a partner reads no likes');

  select count(*) into n from recommendation_events;
  perform assert(n = 0, 'a partner reads no recommendation trail');

  reset role;
end $$;

--  What it *can* reach: its own redemptions, with no person in them.
do $$
declare r record; n int := 0;
begin
  perform act_as(current_setting('test.biz')::uuid);
  for r in select * from partner_redemptions(current_setting('test.partner')::uuid, 50, 0) loop
    n := n + 1;
    perform assert(length(r.pass_ref) = 4, 'the ledger shows only the last four of a code');
  end loop;
  perform assert(n = 1, 'the business sees its one redemption');
end $$;

--  And the shape of that ledger contains no user column, checked against the
--  catalog rather than by reading the source.
do $$
declare bad text;
begin
  select string_agg(p.parameter_name, ', ') into bad
  from information_schema.parameters p
  join information_schema.routines r
    on r.specific_name = p.specific_name
  where r.routine_schema = 'public'
    and r.routine_name in ('partner_redemptions', 'partner_lookup_pass')
    and p.parameter_mode = 'OUT'
    and p.parameter_name ~* 'profile|viewer|issued_to|conversation|match|student|first_name|email';
  perform assert(bad is null,
                 'no partner-facing function returns a column that names a person');
end $$;

-- ─── 9. privacy: what a student cannot reach ──────────────────────────────

do $$
declare n int; ok boolean := false;
begin
  perform act_as(current_setting('test.ada')::uuid);
  set local role authenticated;

  select count(*) into n from partner_subscriptions;
  perform assert(n = 0, 'a student reads no partner billing');

  select count(*) into n from partner_events;
  perform assert(n = 0, 'a student reads no partner analytics');

  select count(*) into n from date_pass_redemptions;
  perform assert(n = 0, 'a student reads no redemption ledger');

  select count(*) into n from date_passes;
  perform assert(n = 1, 'a student reads their own pass, and only theirs');

  reset role;

  begin
    perform partner_overview(current_setting('test.partner')::uuid);
  exception when others then ok := true;
  end;
  perform assert(ok, 'a student calling partner_overview is refused');
end $$;

-- ─── 10. staff oversight ──────────────────────────────────────────────────

do $$
declare n int; rev jsonb;
begin
  perform act_as(current_setting('test.staff')::uuid);
  select count(*) into n from staff_partner_queue('all');
  perform assert(n = 2, 'staff see every partner');

  rev := staff_partner_revenue();
  perform assert((rev ->> 'mrr_cents')::int = 39800,
                 'staff see MRR summed from the plans actually subscribed');

  perform staff_set_partner_status(current_setting('test.partner')::uuid, 'suspended', 'Test');
  perform assert(not partner_is_live(current_setting('test.partner')::uuid),
                 'a suspended partner stops being live immediately');
  perform staff_set_partner_status(current_setting('test.partner')::uuid, 'active', null);
end $$;

do $$
declare ok boolean := false;
begin
  perform act_as(current_setting('test.ada')::uuid);
  begin
    perform staff_set_partner_status(current_setting('test.partner')::uuid, 'active', null);
  exception when others then ok := true;
  end;
  perform assert(ok, 'a student cannot approve a business');
end $$;

-- ─── 11. a lapsed subscription pulls the spot from discovery ──────────────

do $$
declare n int;
begin
  update partner_subscriptions set status = 'past_due'
   where partner_id = current_setting('test.partner')::uuid;

  perform act_as(current_setting('test.ada')::uuid);
  select count(*) into n
  from recommend_date_spots('dinner', '{}', null, null, now(), null, 'planner', 10)
  where spot_id = current_setting('test.spot')::uuid;

  perform assert(n = 0, 'a partner whose payment failed drops out of recommendations');

  set local role authenticated;
  select count(*) into n from date_spots where id = current_setting('test.spot')::uuid;
  perform assert(n = 0, 'and out of the spots directory');
  reset role;

  update partner_subscriptions set status = 'active'
   where partner_id = current_setting('test.partner')::uuid;
end $$;

\echo ''
\echo 'All partner invariants held.'
