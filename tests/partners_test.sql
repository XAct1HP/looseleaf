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

  -- Free to join. Capability no longer depends on paying anything: a business
  -- that has entered no card at all still has the whole feature set. What it
  -- does not have is credit, which is a separate question asked further down.
  perform assert(partner_has(v_partner, 'date_passes'),
                 'the free tier includes Date Passes before any money changes hands');
  perform assert(partner_has(v_partner, 'offers'), 'and offers');
  perform assert(not partner_is_live(v_partner), 'an unapproved partner is not live');

  -- A card on file. In production the webhook writes these three columns and
  -- nothing else may; here the test writes what the webhook would.
  insert into partner_subscriptions (partner_id, plan_id, status, stripe_customer_id,
                                     stripe_subscription_id,
                                     payment_method_brand, payment_method_last4, payment_method_at)
  values (v_partner, 'free', 'active', 'cus_test_partner', 'sub_test_partner',
          'visa', '4242', now());

  perform assert(not partner_is_live(v_partner),
                 'a card is not enough either — a partner still needs approval');

  update partners set status = 'active' where id = v_partner;
  perform assert(partner_is_live(v_partner),
                 'approval alone makes a partner live: being listed is free');

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

  -- Runs every day, deliberately. `issue_date_pass` and `redeem_date_pass`
  -- read the real clock inside the function and can't be handed a timestamp,
  -- so an offer with a day window would make this file pass Sunday to
  -- Thursday and fail on a Friday. The day-window behaviour is tested
  -- separately, against explicit timestamps, in section 6.
  insert into partner_offers (partner_id, title, offer_type, percent_off,
                              days_of_week, status, max_monthly_redemptions, terms)
  values (v_partner, 'Loose Leaf Date', 'percent_off', 15,
          array[0,1,2,3,4,5,6], 'active', 100, 'Dine-in only.')
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

--  Windows are checked against explicit timestamps rather than the real clock,
--  so this section means the same thing whatever day you run it.
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_weeknight uuid;
  v_evening uuid;
begin
  insert into partner_offers (partner_id, title, offer_type, percent_off,
                              days_of_week, status)
  values (v_partner, 'Weeknight Date', 'percent_off', 15, array[0,1,2,3,4], 'active')
  returning id into v_weeknight;

  -- 2026-08-21 is a Friday; 2026-08-19 a Wednesday.
  perform assert(not offer_is_open(v_weeknight, timestamptz '2026-08-21 19:00+00'),
                 'a Sunday–Thursday offer is closed on a Friday');
  perform assert(offer_is_open(v_weeknight, timestamptz '2026-08-19 19:00+00'),
                 'the same offer is open on a Wednesday');

  -- An evening window, and one that crosses midnight.
  insert into partner_offers (partner_id, title, offer_type, percent_off,
                              days_of_week, start_time, end_time, status)
  values (v_partner, 'Late Night', 'percent_off', 10, array[0,1,2,3,4,5,6],
          time '21:00', time '02:00', 'active')
  returning id into v_evening;

  perform assert(offer_is_open(v_evening, timestamptz '2026-08-19 22:30+00'),
                 'a 9pm–2am window is open at half ten');
  perform assert(offer_is_open(v_evening, timestamptz '2026-08-19 01:00+00'),
                 'and still open at one in the morning, past midnight');
  perform assert(not offer_is_open(v_evening, timestamptz '2026-08-19 15:00+00'),
                 'and closed in the afternoon');

  update partner_offers set status = 'ended' where id in (v_weeknight, v_evening);
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
  perform assert((rev ->> 'fee_cents')::int = 150,
                 'staff see the platform redemption fee');
  perform assert((rev -> 'this_month' ->> 'redemptions')::int = 1,
                 'and this month''s redemption count');
  perform assert((rev -> 'this_month' ->> 'cents')::int = 150,
                 'priced at the fee stamped on the row, not recomputed');
  perform assert((rev ->> 'outstanding_cents')::int = 150,
                 'a redemption nobody has paid for yet reads as outstanding');

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

-- ─── 11. the credit ceiling ───────────────────────────────────────────────
--  A free tier still needs a limit, or a business can take the foot traffic
--  and let the card fail. The limit has to behave in one specific way:
--  crossing it stops the offer being *handed out* well before it stops a pass
--  already in somebody's hand being honoured. A student must never be turned
--  away at a counter because the restaurant is behind on an invoice.

do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  s record;
begin
  select * into s from partner_credit_state(v_partner);
  perform assert(s.tier_id = 'new', 'a new business starts on the bottom rung');
  perform assert(s.limit_cents = 2500, 'and is extended the new-partner ceiling');
  perform assert(s.has_card, 'the card written in section 3 is seen');
  perform assert(s.fee_cents = 150, 'the fee is the platform fee');
  perform assert(s.can_issue and s.can_redeem, 'with room left, the business can trade');
  perform assert(s.unbilled_cents = 150,
                 'the one redemption from section 7 is outstanding, at the fee it was stamped with');
end $$;

--  No card is a different problem from no room, and has to say so — the
--  person reading it has to know whether to add a card or pay a bill.
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  s record;
begin
  update partner_subscriptions set payment_method_at = null where partner_id = v_partner;

  select * into s from partner_credit_state(v_partner);
  perform assert(not s.can_issue and not s.can_redeem, 'no card, no Date Passes');
  perform assert(s.reason = 'no_card', 'and the reason names that problem, not the ceiling');

  update partner_subscriptions set payment_method_at = now() where partner_id = v_partner;
end $$;

--  Up against the ceiling: the offer stops being offered, issued passes keep
--  working. Filler redemptions stand in for a busy fortnight.
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_offer   uuid := current_setting('test.offer')::uuid;
  v_pass    uuid;
  s record; n int;
begin
  insert into date_passes (code, offer_id, partner_id, issued_to, expires_at, status)
  values ('LL-FILLER1', v_offer, v_partner, current_setting('test.ada')::uuid,
          now() + interval '7 days', 'redeemed')
  returning id into v_pass;

  insert into date_pass_redemptions
    (pass_id, partner_id, offer_id, redeemed_at, fee_cents, bill_status)
  select v_pass, v_partner, v_offer, now(), 150, 'invoiced' from generate_series(1, 16);

  select * into s from partner_credit_state(v_partner);
  perform assert(s.unbilled_cents = 2550,
                 'outstanding is the sum of every redemption not yet paid for');
  perform assert(not s.can_issue, 'over the ceiling, the offer stops being handed out');
  perform assert(s.can_redeem, 'but a pass already issued is still honoured');
  perform assert(s.reason = 'at_limit', 'and the two states are told apart');
  perform assert(s.remaining_cents = 0, 'with no headroom left');
end $$;

--  The student-facing consequence, which is the whole point: it quietly stops
--  being offered rather than failing in front of somebody.
do $$
declare n int; v_offer uuid := current_setting('test.offer')::uuid; ok boolean := false;
begin
  perform act_as(current_setting('test.ada')::uuid);

  set local role authenticated;
  select count(*) into n from public_offers where id = v_offer;
  reset role;
  perform assert(n = 0, 'an offer over the ceiling is not shown to students at all');

  begin
    perform issue_date_pass(v_offer, null, 'planner');
  exception when others then
    ok := sqlerrm like '%isn''t running right now%';
  end;
  perform assert(ok,
    'and unlocking it is refused in the same words as an offer that ran out — '
    'a student is never told about a business''s billing');
end $$;

--  Past the grace band on top of the ceiling, the counter finally refuses —
--  and refuses in a sentence, not an exception, because somebody is reading
--  it off a phone with a customer in front of them.
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_offer   uuid := current_setting('test.offer')::uuid;
  v_pass    uuid;
  s record; r record;
begin
  select id into v_pass from date_passes where code = 'LL-FILLER1';

  insert into date_pass_redemptions
    (pass_id, partner_id, offer_id, redeemed_at, fee_cents, bill_status)
  select v_pass, v_partner, v_offer, now(), 150, 'invoiced' from generate_series(1, 8);

  select * into s from partner_credit_state(v_partner);
  perform assert(not s.can_redeem, 'past the grace band, redemption stops as well');
  perform assert(s.reason = 'over_limit', 'named separately from merely being at the limit');

  perform act_as(current_setting('test.biz')::uuid);
  select * into r from redeem_date_pass(v_partner, 'LL-ANYTHING', null);
  perform assert(not r.ok, 'the scanner refuses');
  perform assert(r.reason like '%invoice%',
                 'with something a person behind a counter can actually act on');
end $$;

--  The Date Spot stays up through all of it. Being listed is free, so
--  withholding it is not leverage Loose Leaf actually has — and pulling it
--  would punish the students who were looking for somewhere to go.
do $$
declare n int;
begin
  perform act_as(current_setting('test.ada')::uuid);

  select count(*) into n
  from recommend_date_spots('dinner', '{}', null, null, now(), null, 'planner', 10)
  where spot_id = current_setting('test.spot')::uuid;
  perform assert(n = 1, 'a partner over its credit limit stays in recommendations');

  set local role authenticated;
  select count(*) into n from date_spots where id = current_setting('test.spot')::uuid;
  reset role;
  perform assert(n = 1, 'and in the spots directory');
end $$;

-- ─── 11b. the ladder moves on its own ─────────────────────────────────────
--  A business that has paid three invoices is a different credit risk from
--  one that has paid none, and nobody at Loose Leaf should have to notice.

do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_tier text;
begin
  update date_pass_redemptions set stripe_invoice_id = 'in_test_1'
   where partner_id = v_partner and bill_status = 'invoiced';

  -- Stripe raises a $0 invoice at subscription start and for any quiet month.
  -- Being open and selling nothing must not buy credit.
  perform record_partner_invoice_paid(v_partner, 'in_test_0', 0);
  perform assert((select tier_id from partner_credit where partner_id = v_partner) = 'new',
                 'a $0 invoice does not move a partner up the ladder');
  perform assert((select paid_invoice_count from partner_credit where partner_id = v_partner) = 0,
                 'nor count as an invoice paid');

  v_tier := record_partner_invoice_paid(v_partner, 'in_test_1', 3600);
  perform assert(v_tier = 'known', 'one paid invoice moves a partner up a rung');
  perform assert(partner_credit_limit_cents(v_partner) = 7500,
                 'and the ceiling rises with it, with no intervention');
  perform assert(partner_unbilled_cents(v_partner) = 150,
                 'settled redemptions stop counting as exposure');

  update partner_credit
     set paid_invoice_count = 3, paid_cents_total = 20000, last_failure_at = null
   where partner_id = v_partner;
  perform assert(refresh_partner_credit(v_partner) = 'trusted',
                 'three invoices and $150 lifetime reaches Trusted');
  perform assert(partner_credit_limit_cents(v_partner) = 20000, 'worth $200 of credit');
end $$;

--  And falls on its own too. Every rung above the first requires a clean
--  record, so one failure is a demotion — but not a suspension, because a
--  card expiring should not switch a restaurant off overnight.
do $$
declare v_partner uuid := current_setting('test.partner')::uuid;
begin
  perform record_partner_invoice_failed(v_partner, 'in_test_2', 1, false);
  perform assert((select tier_id from partner_credit where partner_id = v_partner) = 'new',
                 'one failed invoice drops a partner to the bottom rung');
  perform assert((select suspended_at from partner_credit where partner_id = v_partner) is null,
                 'but does not suspend them');

  perform record_partner_invoice_failed(v_partner, 'in_test_2', 2, false);
  perform record_partner_invoice_failed(v_partner, 'in_test_2', 3, false);
  perform assert((select suspended_at from partner_credit where partner_id = v_partner) is not null,
                 'three in a row does');
  perform assert(not partner_can_redeem(v_partner), 'and a suspension stops the scanner');

  perform record_partner_invoice_paid(v_partner, 'in_test_3', 500);
  perform assert((select suspended_at from partner_credit where partner_id = v_partner) is null,
                 'paying lifts it again without anyone intervening');
  perform assert(partner_can_redeem(v_partner), 'and the scanner comes back');
end $$;

--  A staff suspension is a different thing from an unpaid one, and paying an
--  invoice must not quietly undo a human decision.
do $$
declare v_partner uuid := current_setting('test.partner')::uuid;
begin
  perform act_as(current_setting('test.staff')::uuid);
  perform staff_set_partner_credit(v_partner, null, null, true, 'Under review');
  perform assert(not partner_can_issue(v_partner), 'staff can stop a business trading');

  perform record_partner_invoice_paid(v_partner, 'in_test_4', 150);
  perform assert((select suspended_at from partner_credit where partner_id = v_partner) is not null,
                 'and paying an invoice does not undo that decision');

  perform staff_set_partner_credit(v_partner, null, null, false, null);
  perform assert(partner_can_issue(v_partner), 'only a human lifts a human suspension');

  -- A staff override beats the ladder in both directions.
  perform staff_set_partner_credit(v_partner, 100000, null, null, null);
  perform assert(partner_credit_limit_cents(v_partner) = 100000, 'an override raises the ceiling');
  perform staff_set_partner_credit(v_partner, -1, null, null, null);
  perform assert(partner_credit_limit_cents(v_partner) < 100000, 'and -1 hands it back to the ladder');
end $$;

--  A student cannot read, let alone move, any of this.
do $$
declare n int; ok boolean := false;
begin
  perform act_as(current_setting('test.ada')::uuid);

  set local role authenticated;
  select count(*) into n from partner_credit;
  reset role;
  perform assert(n = 0, 'a student reads no credit rows');

  begin
    perform staff_set_partner_credit(current_setting('test.partner')::uuid, 999999, null, null, null);
  exception when others then ok := true;
  end;
  perform assert(ok, 'and cannot raise anybody''s credit limit');

  ok := false;
  begin
    perform partner_billing_summary(current_setting('test.partner')::uuid);
  exception when others then ok := true;
  end;
  perform assert(ok, 'or read a business''s billing summary');
end $$;

--  Put the ledger back where the later sections expect it.
do $$
declare v_partner uuid := current_setting('test.partner')::uuid;
begin
  delete from date_pass_redemptions
   where partner_id = v_partner
     and pass_id = (select id from date_passes where code = 'LL-FILLER1');
  delete from date_passes where code = 'LL-FILLER1';
  update partner_credit
     set consecutive_failures = 0, last_failure_at = null, suspended_at = null,
         suspend_reason = null, limit_override_cents = null
   where partner_id = v_partner;
  perform refresh_partner_credit(v_partner);
end $$;

-- ─── 12. the team ─────────────────────────────────────────────────────────
--  An invite is an intention, not a capability. Nothing about it grants
--  access until accept_partner_invite() re-checks the address against the
--  token of whoever is actually signed in.

do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_shift uuid; v_invite uuid; ok boolean := false;
begin
  insert into auth.users (email) values ('shift@jolly.com') returning id into v_shift;
  perform set_config('test.shift', v_shift::text, false);

  perform act_as(current_setting('test.biz')::uuid);
  v_invite := invite_partner_member(v_partner, 'Shift@Jolly.com  ', 'staff');
  perform set_config('test.invite', v_invite::text, false);

  perform assert((select email from partner_invites where id = v_invite) = 'shift@jolly.com',
                 'an invited address is normalised before it is stored');
  perform assert((select count(*) from partner_members where partner_id = v_partner) = 1,
                 'inviting somebody does not put them on the team');

  begin
    perform invite_partner_member(v_partner, 'not-an-email', 'staff');
  exception when others then ok := true;
  end;
  perform assert(ok, 'a malformed address is refused');
end $$;

--  Somebody else holding the invite id gets nothing from it.
do $$
declare ok boolean := false;
begin
  perform act_as(current_setting('test.ada')::uuid);
  perform assert((select count(*) from my_partner_invites()) = 0,
                 'an invitation does not show up for the wrong address');
  begin
    perform accept_partner_invite(current_setting('test.invite')::uuid);
  exception when others then ok := true;
  end;
  perform assert(ok, 'and cannot be accepted by the wrong person');
end $$;

--  The right person accepts.
do $$
declare v_partner uuid;
begin
  perform act_as(current_setting('test.shift')::uuid);
  perform assert((select count(*) from my_partner_invites()) = 1,
                 'the invited address sees exactly one invitation');

  v_partner := accept_partner_invite(current_setting('test.invite')::uuid, 'Dee');
  perform assert(v_partner = current_setting('test.partner')::uuid,
                 'accepting returns the business they joined');
  perform assert(is_partner_member(v_partner), 'and they are now a member');
  perform assert(not is_partner_admin(v_partner), 'as staff, not as an admin');
  perform assert((select count(*) from my_partner_invites()) = 0,
                 'and the invitation is spent');
end $$;

--  What staff can and cannot do.
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  n int; ok boolean := false; r record;
begin
  perform act_as(current_setting('test.shift')::uuid);

  -- The whole reason the role exists: scanning still works.
  select * into r from partner_lookup_pass(v_partner, current_setting('test.code'));
  perform assert(r.status = 'redeemed', 'staff can look a pass up');

  set local role authenticated;
  select count(*) into n from date_passes;
  perform assert(n = 0, 'staff read no date_passes either');
  select count(*) into n from profiles;
  perform assert(n = 0, 'and no student profiles');
  reset role;

  begin
    perform invite_partner_member(v_partner, 'someone@else.com', 'owner');
  exception when others then ok := true;
  end;
  perform assert(ok, 'staff cannot add people');

  ok := false;
  begin
    perform save_date_spot(current_setting('test.loc')::uuid, '{"name":"Hijacked"}'::jsonb);
  exception when others then ok := true;
  end;
  perform assert(ok, 'staff cannot edit the Date Spot');
end $$;

--  A business must always have somebody who can pay the bill.
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_owner uuid := current_setting('test.biz')::uuid;
  ok boolean := false;
begin
  perform act_as(v_owner);

  begin
    perform set_partner_member_role(v_partner, v_owner, 'staff');
  exception when others then ok := true;
  end;
  perform assert(ok, 'the last owner cannot demote themselves');

  ok := false;
  begin
    perform remove_partner_member(v_partner, v_owner);
  exception when others then ok := true;
  end;
  perform assert(ok, 'nor remove themselves');

  -- Promote, and now it is allowed.
  perform set_partner_member_role(v_partner, current_setting('test.shift')::uuid, 'owner');
  perform set_partner_member_role(v_partner, v_owner, 'manager');
  perform assert((select role from partner_members
                   where partner_id = v_partner and partner_user_id = v_owner) = 'manager',
                 'with a second owner in place, the first can step down');

  perform assert((select count(*) from partner_team(v_partner)) = 2,
                 'the team lists both people');

  -- Put it back so later reads see the original shape.
  perform act_as(current_setting('test.shift')::uuid);
  perform set_partner_member_role(v_partner, v_owner, 'owner');
  perform remove_partner_member(v_partner, current_setting('test.shift')::uuid);
  perform assert((select count(*) from partner_members where partner_id = v_partner) = 1,
                 'and somebody can always leave on their own');
end $$;

-- ─── 13. what each role can actually reach ────────────────────────────────
--  The bug this section exists for: roles used to come in two flavours —
--  "admin" (owner or manager) and "member" — so a staff login could read the
--  overview, the analytics and the redemption ledger, and a manager could
--  rewrite the Date Spot. Permission is now a role *plus a grant*, and every
--  policy and RPC routes through partner_can().

do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_staff uuid := current_setting('test.shift')::uuid;
  v_mgr uuid;
begin
  -- Put the shift worker back, and add a manager beside them.
  perform act_as(current_setting('test.biz')::uuid);
  insert into partner_members (partner_id, partner_user_id, role)
  values (v_partner, v_staff, 'staff')
  on conflict (partner_id, partner_user_id) do update set role = 'staff';

  insert into auth.users (email) values ('mgr@jolly.com') returning id into v_mgr;
  insert into partner_users (id, email, full_name) values (v_mgr, 'mgr@jolly.com', 'Mo');
  insert into partner_members (partner_id, partner_user_id, role)
  values (v_partner, v_mgr, 'manager');
  perform set_config('test.mgr', v_mgr::text, false);

  perform assert(partner_my_role(v_partner) = 'owner', 'the owner reads as an owner');
  perform assert(array_length(partner_my_pages(v_partner), 1) = 9,
                 'an owner reaches every page');
  perform assert(partner_can(v_partner, 'settings'), 'including settings');
end $$;

--  Staff: the scanner, and nothing else.
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  ok boolean; n int;
begin
  perform act_as(current_setting('test.shift')::uuid);

  perform assert(partner_my_pages(v_partner) = array['scan'],
                 'staff reach exactly one page: the scanner');
  perform assert(partner_can(v_partner, 'scan'), 'and scanning works');
  perform assert(not partner_can(v_partner, 'overview'), 'no overview');
  perform assert(not partner_can(v_partner, 'analytics'), 'no analytics');
  perform assert(not partner_can(v_partner, 'redemptions'), 'no redemption ledger');
  perform assert(not partner_can(v_partner, 'team'), 'no team');
  perform assert(not partner_can(v_partner, 'billing'), 'no billing');
  perform assert(not partner_can(v_partner, 'settings'), 'no settings');

  -- And the refusals are the database's, not the navigation's.
  foreach ok in array array[true] loop
    begin ok := false; perform partner_overview(v_partner);
    exception when others then ok := true; end;
    perform assert(ok, 'staff calling partner_overview is refused');

    begin ok := false; perform partner_funnel(v_partner, 30);
    exception when others then ok := true; end;
    perform assert(ok, 'staff calling partner_funnel is refused');

    begin ok := false; perform save_date_spot(current_setting('test.loc')::uuid, '{}'::jsonb);
    exception when others then ok := true; end;
    perform assert(ok, 'staff cannot save the Date Spot');
  end loop;

  select count(*) into n from partner_redemptions(v_partner, 50, 0);
  perform assert(n = 0, 'staff read no redemption rows');

  set local role authenticated;
  select count(*) into n from partner_subscriptions;
  perform assert(n = 0, 'staff read no billing');
  select count(*) into n from partner_offers where partner_id = v_partner;
  perform assert(n = 0, 'staff read no offers — not even their employer''s caps');
  reset role;
end $$;

--  Manager: the scanner and the team, and nothing else until it's handed over.
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  ok boolean := false; n int;
begin
  perform act_as(current_setting('test.mgr')::uuid);

  perform assert(partner_my_pages(v_partner) = array['scan','team'],
                 'a manager reaches the scanner and the team');
  perform assert(not partner_can(v_partner, 'spot'), 'not the Date Spot');
  perform assert(not partner_can(v_partner, 'offers'), 'not the offers');
  perform assert(not partner_can(v_partner, 'billing'), 'not billing');
  perform assert(not partner_can(v_partner, 'settings'), 'and never settings');

  begin
    perform save_date_spot(current_setting('test.loc')::uuid, '{"name":"Hijacked"}'::jsonb);
  exception when others then ok := true;
  end;
  perform assert(ok, 'a manager cannot rewrite the Date Spot by default');

  set local role authenticated;
  select count(*) into n from partner_subscriptions;
  perform assert(n = 0, 'nor read the billing state');
  reset role;

  perform assert((select count(*) from partner_team(v_partner)) = 3,
                 'but they can see the team');
end $$;

--  A manager hires and fires, but cannot manufacture an owner.
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_inv uuid; ok boolean := false;
begin
  perform act_as(current_setting('test.mgr')::uuid);

  v_inv := invite_partner_member(v_partner, 'newhire@jolly.com', 'staff');
  perform assert(v_inv is not null, 'a manager can invite staff');
  perform revoke_partner_invite(v_inv);

  begin
    perform invite_partner_member(v_partner, 'sneaky@jolly.com', 'owner');
  exception when others then ok := true;
  end;
  perform assert(ok, 'a manager cannot invite an owner');

  ok := false;
  begin
    perform set_partner_member_role(v_partner, current_setting('test.mgr')::uuid, 'owner');
  exception when others then ok := true;
  end;
  perform assert(ok, 'nor promote themselves to one');

  ok := false;
  begin
    perform remove_partner_member(v_partner, current_setting('test.biz')::uuid);
  exception when others then ok := true;
  end;
  perform assert(ok, 'nor remove the owner');

  -- Moving staff around is exactly their job, though.
  perform set_partner_member_role(v_partner, current_setting('test.shift')::uuid, 'manager');
  perform set_partner_member_role(v_partner, current_setting('test.shift')::uuid, 'staff');
  perform assert(true, 'a manager can move somebody between staff and manager');
end $$;

--  The owner hands billing over, and it takes effect immediately.
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_pages jsonb; n int; ok boolean := false;
begin
  perform act_as(current_setting('test.biz')::uuid);
  v_pages := set_partner_role_pages(v_partner, 'manager', array['scan','team','billing']);
  perform assert(v_pages -> 'manager' ? 'billing', 'the grant is stored');

  perform act_as(current_setting('test.mgr')::uuid);
  perform assert(partner_can(v_partner, 'billing'), 'the manager can now reach billing');
  set local role authenticated;
  select count(*) into n from partner_subscriptions;
  perform assert(n = 1, 'and actually read the subscription');
  reset role;

  -- Settings is never grantable, however it is asked for.
  perform act_as(current_setting('test.biz')::uuid);
  perform set_partner_role_pages(v_partner, 'manager', array['scan','team','billing','settings']);
  perform act_as(current_setting('test.mgr')::uuid);
  perform assert(not partner_can(v_partner, 'settings'),
                 'settings cannot be granted, whatever is written to the column');

  -- And a manager cannot rewrite the grid to widen themselves.
  begin
    perform set_partner_role_pages(v_partner, 'manager', array['scan','team','billing','spot','offers']);
  exception when others then ok := true;
  end;
  perform assert(ok, 'only an owner edits what the team can see');

  -- Put it back.
  perform act_as(current_setting('test.biz')::uuid);
  perform set_partner_role_pages(v_partner, 'manager', array['scan','team']);
  perform act_as(current_setting('test.mgr')::uuid);
  perform assert(not partner_can(v_partner, 'billing'), 'and revoking it takes effect too');
end $$;

--  Scanning still works for everybody who is meant to have it — the point of
--  the staff role would be lost otherwise.
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  r record;
begin
  perform act_as(current_setting('test.shift')::uuid);
  select * into r from partner_lookup_pass(v_partner, current_setting('test.code'));
  perform assert(r.status = 'redeemed', 'staff can still look a pass up');

  perform act_as(current_setting('test.mgr')::uuid);
  select * into r from partner_lookup_pass(v_partner, current_setting('test.code'));
  perform assert(r.status = 'redeemed', 'and so can a manager');
end $$;

--  Students still see live offers — through the view, not the table.
do $$
declare n int;
begin
  perform act_as(current_setting('test.ada')::uuid);
  set local role authenticated;

  select count(*) into n from partner_offers;
  perform assert(n = 0, 'a student reads no rows from the offers table');

  select count(*) into n from public_offers
   where partner_id = current_setting('test.partner')::uuid;
  perform assert(n = 1, 'but does see the live offer through the public view');

  reset role;
end $$;

--  And the view cannot be used to reach a cap, because the column isn't in it.
do $$
declare bad text;
begin
  select string_agg(column_name, ', ') into bad
  from information_schema.columns
  where table_schema = 'public' and table_name = 'public_offers'
    and column_name ~ 'max_|new_customers|multi_use|pass_valid|status';
  perform assert(bad is null, 'the public offer view exposes no commercial limits');
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
--  14 · Scanning is a property of membership, not a grant
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Everything below exists because a member of staff signed in and was told
--  they had no access to anything. Two separate mistakes made that possible:
--  the grid could be written without `scan`, and the client removed the tab
--  when the plan didn't include Date Passes. The second is a client concern,
--  but the first is enforced here.

--  An owner cannot strip the scanner from a role, even by asking for exactly
--  that.
do $$
declare v_partner uuid := current_setting('test.partner')::uuid; v_pages jsonb;
begin
  perform act_as(current_setting('test.biz')::uuid);

  v_pages := set_partner_role_pages(v_partner, 'staff', array['analytics']);
  perform assert(v_pages -> 'staff' ? 'scan',
                 'set_partner_role_pages puts the scanner back');

  v_pages := set_partner_role_pages(v_partner, 'staff', array[]::text[]);
  perform assert(v_pages -> 'staff' ? 'scan',
                 'even asked for nothing at all');
end $$;

--  And writing the column by hand doesn't get round it either.
do $$
declare v_partner uuid := current_setting('test.partner')::uuid;
begin
  update partners
     set role_pages = '{"manager": [], "staff": []}'::jsonb
   where id = v_partner;

  perform act_as(current_setting('test.shift')::uuid);
  perform assert(partner_can(v_partner, 'scan'),
                 'a member with an empty grid can still scan');
  perform assert(partner_my_pages(v_partner) = array['scan'],
                 'and the scanner is exactly what they reach');
  perform assert(not partner_can(v_partner, 'overview'),
                 'nothing else leaked in with it');

  perform act_as(current_setting('test.mgr')::uuid);
  perform assert(partner_my_pages(v_partner) = array['scan'],
                 'the same holds for a manager stripped to nothing');
end $$;

--  Nobody outside the business gets it from this rule.
do $$
declare v_partner uuid := current_setting('test.partner')::uuid;
begin
  perform act_as(current_setting('test.ada')::uuid);
  perform assert(not partner_can(v_partner, 'scan'),
                 'a student still cannot scan for somebody else''s business');
  perform assert(partner_my_pages(v_partner) = '{}'::text[],
                 'and reaches no pages at all');
end $$;

--  Put the defaults back for anything that runs after this.
do $$
declare v_partner uuid := current_setting('test.partner')::uuid;
begin
  perform act_as(current_setting('test.biz')::uuid);
  perform set_partner_role_pages(v_partner, 'manager', array['scan','team']);
  perform set_partner_role_pages(v_partner, 'staff', array['scan']);
end $$;

\echo ''
\echo 'All partner invariants held.'
