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
  --
  -- `requires_date` and `per_person_rule` are switched off for the same
  -- reason: this offer is the one every later section unlocks against, and
  -- both defaults would make those sections about the access rules instead of
  -- about what they are testing. Both rules get a section of their own (16).
  insert into partner_offers (partner_id, title, offer_type, percent_off,
                              days_of_week, status, max_monthly_redemptions, terms,
                              requires_date, per_person_rule)
  values (v_partner, 'Loose Leaf Date', 'percent_off', 15,
          array[0,1,2,3,4,5,6], 'active', 100, 'Dine-in only.',
          false, 'unlimited')
  returning id into v_offer;
  perform set_config('test.offer', v_offer::text, false);
end $$;

-- An organic spot that actually matches what someone asked for.
do $$
declare v_campus uuid := current_setting('test.campus')::uuid; v_id uuid;
begin
  insert into date_spots (university_id, name, kind, date_types, vibes,
                          price_level, walk_minutes, is_published)
  values (v_campus, 'Foldover Coffee', 'Coffee', array['coffee','first-date'],
          array['quiet','cozy'], 1, 8, true)
  returning id into v_id;
  perform set_config('test.organic', v_id::text, false);
end $$;

-- ─── 4. relevance beats payment ───────────────────────────────────────────
--  Ada asks for coffee. Jolly Pumpkin is a paying Date Partner with a live
--  offer and featured placement; it does not serve coffee. Foldover is free and
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


-- ═══════════════════════════════════════════════════════════════════════════
--  15 · A first-time staff member can reach the login screen
-- ═══════════════════════════════════════════════════════════════════════════
--
--  The login screen sends its one-time code with account creation switched
--  off, so that typing any address into a login box does not mint an account.
--  That left the one person who most needs to log in — a shift manager added
--  this morning, who has never had an account — with nowhere to go but
--  "Become a Partner", which would have them register their employer twice.
--
--  `partner_invite_open()` is the single question the login screen asks
--  before deciding: is somebody expecting this address? It is callable while
--  signed out, so what it must NOT do is the interesting half.

do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_invite  uuid;
begin
  perform act_as(current_setting('test.biz')::uuid);
  v_invite := invite_partner_member(v_partner, 'NewHire@Jolly.com', 'staff');
  perform set_config('test.open_invite', v_invite::text, false);

  --  Signed out. This is how the login screen actually calls it.
  perform set_config('test.uid', '', false);

  perform assert(partner_invite_open('newhire@jolly.com'),
                 'an invited address is recognised before it has any account');
  perform assert(partner_invite_open('  NewHire@Jolly.COM '),
                 'and is recognised however it was typed');
  perform assert(not partner_invite_open('stranger@nowhere.com'),
                 'an address nobody invited is not');
  perform assert(not partner_invite_open(''), 'nor is an empty string');
  perform assert(not partner_invite_open(null), 'nor is null');
end $$;

--  Knowing you are invited is not being invited. Everything that grants
--  anything still lives behind accept_partner_invite().
do $$
declare n int;
begin
  perform set_config('test.uid', '', false);
  set local role authenticated;

  select count(*) into n from partner_invites;
  perform assert(n = 0,
                 'saying yes to the lookup still reads zero invitation rows');
  perform assert(not partner_can(current_setting('test.partner')::uuid, 'scan'),
                 'and grants no page on the business that invited them');

  reset role;
end $$;

--  It answers for the invitation's *state*, not merely its existence — a spent
--  or lapsed invite must stop opening the door, or revoking one would achieve
--  nothing.
do $$
declare
  v_hire   uuid;
  v_invite uuid := current_setting('test.open_invite')::uuid;
begin
  insert into auth.users (email) values ('newhire@jolly.com') returning id into v_hire;

  perform act_as(v_hire);
  perform accept_partner_invite(v_invite, 'Ray');

  perform set_config('test.uid', '', false);
  perform assert(not partner_invite_open('newhire@jolly.com'),
                 'an accepted invitation stops opening the login screen');

  --  And an expired one, which my_partner_invites() already refuses to show.
  perform act_as(current_setting('test.biz')::uuid);
  v_invite := invite_partner_member(current_setting('test.partner')::uuid,
                                    'lapsed@jolly.com', 'staff');
  update partner_invites set expires_at = now() - interval '1 day' where id = v_invite;

  perform set_config('test.uid', '', false);
  perform assert(not partner_invite_open('lapsed@jolly.com'),
                 'and neither does an expired one');

  --  Revoking is the owner's undo, and it has to reach this too.
  perform act_as(current_setting('test.biz')::uuid);
  perform revoke_partner_invite(v_invite);
  perform set_config('test.uid', '', false);
  perform assert(not partner_invite_open('lapsed@jolly.com'),
                 'and a revoked one is gone from it entirely');
end $$;

--  Tidy up after ourselves: the hire we just added is a real member now, and
--  anything appended after this section should not inherit them by surprise.
do $$
declare v_partner uuid := current_setting('test.partner')::uuid;
begin
  perform act_as(current_setting('test.biz')::uuid);
  delete from partner_members
   where partner_id = v_partner
     and partner_user_id in (select id from partner_users where email = 'newhire@jolly.com');
end $$;

-- ═════════════════════════════════════════════════════════════════════════
--  16. how often one person may use an offer, and where from
-- ═════════════════════════════════════════════════════════════════════════
--
--  Both halves of 20260827120000. The cooldown is exercised by moving a
--  redemption's timestamp backwards rather than by waiting, and the "where
--  from" half needs a real conversation, so this section builds Ada and Bo a
--  match to plan inside.

do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_ada uuid := current_setting('test.ada')::uuid;
  v_bo  uuid := current_setting('test.bo')::uuid;
  v_match uuid;
  v_conv uuid;
begin
  insert into matches (profile_a, profile_b)
  values (least(v_ada, v_bo), greatest(v_ada, v_bo))
  returning id into v_match;

  insert into conversations (match_id) values (v_match) returning id into v_conv;
  perform set_config('test.conv', v_conv::text, false);
end $$;

--  16a. requires_date: a perk you can only unlock while planning something
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_conv uuid := current_setting('test.conv')::uuid;
  v_offer uuid;
  r record;
  ok boolean := false;
begin
  insert into partner_offers (partner_id, title, offer_type, percent_off,
                              days_of_week, status, requires_date, per_person_rule)
  values (v_partner, 'Date night, dessert on us', 'percent_off', 20,
          array[0,1,2,3,4,5,6], 'active', true, 'unlimited')
  returning id into v_offer;

  perform act_as(current_setting('test.ada')::uuid);

  begin
    perform issue_date_pass(v_offer, null, 'discovery');
  exception when others then ok := true;
  end;
  perform assert(ok, 'a date-only offer cannot be unlocked from browsing');

  --  And not by handing it a conversation you are not in, which is the
  --  interesting half — the id is a uuid somebody could paste.
  ok := false;
  begin
    perform issue_date_pass(v_offer, gen_random_uuid(), 'planner');
  exception when others then ok := true;
  end;
  perform assert(ok, 'nor with a conversation id that is not yours');

  select * into r from issue_date_pass(v_offer, v_conv, 'planner');
  perform assert(r.pass_code like 'LL-%', 'but it unlocks inside a real conversation');
  perform assert((select conversation_id from date_passes where id = r.pass_id) = v_conv,
                 'and the pass remembers the date it belongs to');

  --  Bo is in the same conversation; Sam the student is not.
  perform act_as(current_setting('test.staff')::uuid);
  ok := false;
  begin
    perform issue_date_pass(v_offer, v_conv, 'planner');
  exception when others then ok := true;
  end;
  perform assert(ok, 'somebody outside the conversation cannot unlock through it');

  update partner_offers set status = 'ended' where id = v_offer;
end $$;

--  16b. per_person_rule: once ever, once in a while, or as often as you like
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_ada uuid := current_setting('test.ada')::uuid;
  v_offer uuid;
  r record;
  v_code text;
  ok boolean := false;
begin
  insert into partner_offers (partner_id, title, offer_type, percent_off,
                              days_of_week, status, requires_date,
                              per_person_rule, per_person_cooldown_days)
  values (v_partner, 'Once a month', 'percent_off', 10,
          array[0,1,2,3,4,5,6], 'active', false, 'cooldown', 30)
  returning id into v_offer;

  perform act_as(v_ada);
  select * into r from issue_date_pass(v_offer, null, 'discovery');
  v_code := r.pass_code;
  perform assert(v_code like 'LL-%', 'the first unlock is free of any rule');

  --  Redeem it, which is the event the clock runs from.
  perform act_as(current_setting('test.biz')::uuid);
  perform redeem_date_pass(v_partner, v_code, 1000);

  perform act_as(v_ada);
  begin
    perform issue_date_pass(v_offer, null, 'discovery');
  exception when others then ok := true;
  end;
  perform assert(ok, 'a used offer cannot simply be unlocked again');
  perform assert((select count(*) from date_passes
                   where offer_id = v_offer and issued_to = v_ada) = 1,
                 'and no second pass was minted trying');

  --  Twenty-nine days later: still inside the window.
  update date_pass_redemptions set redeemed_at = now() - interval '29 days'
   where offer_id = v_offer;
  update date_passes set redeemed_at = now() - interval '29 days'
   where offer_id = v_offer;

  ok := false;
  begin
    perform issue_date_pass(v_offer, null, 'discovery');
  exception when others then ok := true;
  end;
  perform assert(ok, 'twenty-nine days into a thirty-day cooldown is still no');

  --  Thirty-one days later: yes.
  update date_pass_redemptions set redeemed_at = now() - interval '31 days'
   where offer_id = v_offer;
  update date_passes set redeemed_at = now() - interval '31 days'
   where offer_id = v_offer;

  select * into r from issue_date_pass(v_offer, null, 'discovery');
  perform assert(r.pass_code <> v_code, 'past the cooldown it unlocks again, as a new pass');

  --  The unlock that never got used is not a use: expire it and try again.
  update date_passes
     set status = 'expired',
         issued_at = now() - interval '30 days',
         expires_at = now() - interval '1 day'
   where id = r.pass_id;
  select * into r from issue_date_pass(v_offer, null, 'discovery');
  perform assert(r.pass_code is not null,
                 'unlocking and never going does not spend the allowance');

  update partner_offers set status = 'ended' where id = v_offer;
end $$;

--  once, and unlimited
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_ada uuid := current_setting('test.ada')::uuid;
  v_once uuid; v_free uuid;
  r record; v_code text;
  ok boolean := false;
begin
  insert into partner_offers (partner_id, title, offer_type, percent_off,
                              days_of_week, status, requires_date, per_person_rule)
  values (v_partner, 'First visit only', 'percent_off', 25,
          array[0,1,2,3,4,5,6], 'active', false, 'once')
  returning id into v_once;

  perform act_as(v_ada);
  select * into r from issue_date_pass(v_once, null, 'discovery');
  v_code := r.pass_code;
  perform act_as(current_setting('test.biz')::uuid);
  perform redeem_date_pass(v_partner, v_code, 1000);

  perform act_as(v_ada);
  begin
    perform issue_date_pass(v_once, null, 'discovery');
  exception when others then ok := true;
  end;
  perform assert(ok, 'a once-per-person offer is once, full stop');

  --  Not even a year later.
  update date_pass_redemptions set redeemed_at = now() - interval '400 days'
   where offer_id = v_once;
  ok := false;
  begin
    perform issue_date_pass(v_once, null, 'discovery');
  exception when others then ok := true;
  end;
  perform assert(ok, 'and it does not quietly lapse after a year');

  --  Bo, who has never been, is unaffected — the rule is per person.
  perform act_as(current_setting('test.bo')::uuid);
  select * into r from issue_date_pass(v_once, null, 'discovery');
  perform assert(r.pass_code like 'LL-%', 'somebody else''s use costs you nothing');

  --  Unlimited still means unlimited.
  insert into partner_offers (partner_id, title, offer_type, percent_off,
                              days_of_week, status, requires_date, per_person_rule)
  values (v_partner, 'Come every night', 'percent_off', 5,
          array[0,1,2,3,4,5,6], 'active', false, 'unlimited')
  returning id into v_free;

  perform act_as(v_ada);
  select * into r from issue_date_pass(v_free, null, 'discovery');
  v_code := r.pass_code;
  perform act_as(current_setting('test.biz')::uuid);
  perform redeem_date_pass(v_partner, v_code, 1000);
  perform act_as(v_ada);
  select * into r from issue_date_pass(v_free, null, 'discovery');
  perform assert(r.pass_code <> v_code, 'an unlimited offer hands out a second pass');

  update partner_offers set status = 'ended' where id in (v_once, v_free);
end $$;

--  16c. the rules are readable by the person they apply to, the caps are not
do $$
declare n int;
begin
  perform act_as(current_setting('test.ada')::uuid);
  set local role authenticated;

  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'public_offers'
    and column_name in ('requires_date', 'per_person_rule', 'per_person_cooldown_days');
  perform assert(n = 3, 'a student can read the rules they are subject to');

  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'public_offers'
    and (column_name like 'max_%' or column_name like '%_count' or column_name = 'status');
  perform assert(n = 0, 'and still none of the business''s caps or counts');

  reset role;
end $$;

-- ═════════════════════════════════════════════════════════════════════════
--  17. a manager who registers the business
-- ═════════════════════════════════════════════════════════════════════════
--
--  20260827130000. The founding manager holds the account until an owner
--  joins, and hands it over the moment one does.

do $$
declare
  v_mgr uuid; v_partner uuid; v_pages text[];
begin
  insert into auth.users (email) values ('gm@bellrose.com') returning id into v_mgr;
  perform act_as(v_mgr);

  v_partner := register_partner('Nia Manager', 'Bellrose', 'restaurant', 'manager');
  perform set_config('test.mgr', v_mgr::text, false);
  perform set_config('test.mgr_partner', v_partner::text, false);

  perform assert((select role from partner_members
                   where partner_id = v_partner and partner_user_id = v_mgr) = 'manager',
                 'registering as a manager makes you a manager, not an owner');
  perform assert(not exists (select 1 from partner_members
                              where partner_id = v_partner and role = 'owner'),
                 'and the business has no owner at all yet');

  v_pages := partner_my_pages(v_partner);
  perform assert(v_pages @> array['overview','spot','offers','scan',
                                  'redemptions','analytics','team','billing'],
                 'the founding manager reaches every page of the dashboard');
  perform assert('settings' = any (v_pages),
                 'including Settings, or they could never invite an owner');
  perform assert(partner_can(v_partner, 'billing'),
                 'so they can set up the card themselves');
  perform assert(is_partner_admin(v_partner),
                 'and edit the Date Spot they just described');
end $$;

--  Settings is still not a grant. Writing it into the column by hand does
--  nothing — for this manager or any other.
do $$
declare
  v_partner uuid := current_setting('test.mgr_partner')::uuid;
  v_other uuid;
  ok boolean := false;
begin
  perform act_as(current_setting('test.mgr')::uuid);

  --  A second manager, who did not register anything.
  insert into auth.users (email) values ('shift@bellrose.com') returning id into v_other;
  insert into partner_users (id, email, full_name) values (v_other, 'shift@bellrose.com', 'Shift Lead');
  insert into partner_members (partner_id, partner_user_id, role)
  values (v_partner, v_other, 'manager');

  perform act_as(v_other);
  perform assert(not partner_can(v_partner, 'settings'),
                 'a manager who did not register the place holds no account');
  perform assert(partner_can(v_partner, 'billing'),
                 'though they reach what the manager grid actually grants');

  update partners
     set role_pages = '{"manager": ["settings","billing"], "staff": ["scan"]}'::jsonb
   where id = v_partner;
  perform assert(not partner_can(v_partner, 'settings'),
                 'and writing settings into the grid by hand still grants nothing');

  begin
    perform set_partner_role_pages(v_partner, 'manager', array['team']);
  exception when others then ok := true;
  end;
  perform assert(ok, 'nor can they edit the grid');

  --  Put the founding manager's grid back the way registration left it.
  perform act_as(current_setting('test.mgr')::uuid);
  perform set_partner_role_pages(v_partner, 'manager',
    array['overview','spot','offers','scan','redemptions','analytics','team','billing']);
  perform assert(partner_can(v_partner, 'settings'),
                 'the founding manager can still edit it');

  delete from partner_members
   where partner_id = v_partner and partner_user_id = v_other;
end $$;

--  Handing the business over: they can invite an owner, and the moment that
--  owner exists the account is not theirs any more.
do $$
declare
  v_partner uuid := current_setting('test.mgr_partner')::uuid;
  v_mgr uuid := current_setting('test.mgr')::uuid;
  v_owner uuid; v_invite uuid;
  ok boolean := false;
begin
  perform act_as(v_mgr);

  begin
    perform set_partner_member_role(v_partner, v_mgr, 'owner');
  exception when others then ok := true;
  end;
  perform assert(ok, 'the founding manager cannot promote themselves to owner');

  v_invite := invite_partner_member(v_partner, 'boss@bellrose.com', 'owner');
  perform assert(v_invite is not null, 'but they can invite the actual owner');

  insert into auth.users (email) values ('boss@bellrose.com') returning id into v_owner;
  perform act_as(v_owner);
  insert into partner_users (id, email, full_name)
  values (v_owner, 'boss@bellrose.com', 'Ola Owner');
  perform accept_partner_invite(v_invite);

  perform assert(partner_can(v_partner, 'settings'), 'the owner who accepts holds the account');

  perform act_as(v_mgr);
  perform assert(not partner_can(v_partner, 'settings'),
                 'and the founding manager becomes an ordinary manager again');
  perform assert(partner_can(v_partner, 'team'),
                 'keeping exactly what the grid grants them');
  perform assert((select role_pages from my_partners() where id = v_partner) is null,
                 'the grid stops being theirs to read');

  ok := false;
  begin
    perform invite_partner_member(v_partner, 'second@bellrose.com', 'owner');
  exception when others then ok := true;
  end;
  perform assert(ok, 'and inviting another owner is the owner''s job now');

  --  The owner narrows them, and it takes effect immediately.
  perform act_as(v_owner);
  perform set_partner_role_pages(v_partner, 'manager', array['team']);
  perform act_as(v_mgr);
  perform assert(not partner_can(v_partner, 'billing'),
                 'an owner can take billing back off the manager who signed up');
  perform assert(partner_can(v_partner, 'scan'),
                 'and cannot take the scanner off anybody');
end $$;

--  Registering as staff is not a thing, and an owner registration is
--  unchanged from every earlier section in this file.
do $$
declare v_x uuid; ok boolean := false;
begin
  insert into auth.users (email) values ('nobody@else.com') returning id into v_x;
  perform act_as(v_x);
  begin
    perform register_partner('No Body', 'Somewhere', 'cafe', 'staff');
  exception when others then ok := true;
  end;
  perform assert(ok, 'you cannot register a business as its staff');
  perform assert(not exists (select 1 from partners where name = 'Somewhere'),
                 'and nothing was created trying');
end $$;

-- ═════════════════════════════════════════════════════════════════════════
--  18. the compatibility engine
-- ═════════════════════════════════════════════════════════════════════════
--
--  20260828120000. Discover is five people a day on a campus of fifty, and a
--  person you passed on never returns — so the *ordering* is the product, and
--  an ordering nobody checks is a rumour.
--
--  This section builds its own campus rather than borrowing the partner one,
--  because deck size is a function of how many people are on it.

do $$
declare
  v_campus uuid;
  v_uid uuid;
  i int;
begin
  insert into universities (name, short_name, city, email_domains, areas, is_live, open_threshold)
  values ('Deck U', 'DU', 'Deckville', array['deck.edu'], array['North','South'], true, 50)
  returning id into v_campus;
  perform set_config('test.deck_campus', v_campus::text, false);

  --  Fifty people, alternating gender, all of them looking for everyone, so
  --  the pool is the whole campus and the arithmetic is the only variable.
  for i in 1..50 loop
    insert into auth.users (email) values ('deck' || i || '@deck.edu') returning id into v_uid;
    insert into profiles (id, university_id, first_name, gender, grad_year, major, age,
                          area, orgs, intention, onboarded_at)
    values (v_uid, v_campus, 'Person' || i,
            case when i % 2 = 0 then 'woman' else 'man' end,
            (2026 + (i % 4))::text, 'Major' || (i % 7), 19 + (i % 4),
            case when i % 2 = 0 then 'North' else 'South' end,
            case when i % 5 = 0 then array['Rowing'] else '{}'::text[] end,
            case when i % 3 = 0 then 'relationship'::intention else 'seeing'::intention end,
            now());
    insert into profile_preferences (profile_id, interested_in, min_age, max_age)
    values (v_uid, array['everyone'], 18, 30);
    --  Interests spread so that some pairs overlap and some don't.
    insert into profile_interests (profile_id, interest_id)
    select v_uid, id from interests where sort in (10 + (i % 5) * 10, 90, 130 + (i % 3));
    if i = 1 then perform set_config('test.deck_me', v_uid::text, false); end if;
    if i = 2 then perform set_config('test.deck_her', v_uid::text, false); end if;
  end loop;
end $$;

--  18a. how many people a day
do $$
declare
  v_campus uuid := current_setting('test.deck_campus')::uuid;
  v_uid uuid;
  i int;
begin
  perform assert(campus_member_count(v_campus) = 50, 'the test campus has fifty people on it');
  perform assert(deck_size_for(v_campus) = 5, 'a campus of fifty shows five people a day');

  for i in 51..60 loop
    insert into auth.users (email) values ('deck' || i || '@deck.edu') returning id into v_uid;
    insert into profiles (id, university_id, first_name, gender, grad_year, major, age, onboarded_at)
    values (v_uid, v_campus, 'Extra' || i, 'woman', '2027', 'Major', 20, now());
    insert into profile_preferences (profile_id, interested_in) values (v_uid, array['everyone']);
  end loop;
  perform assert(deck_size_for(v_campus) = 6, 'sixty people, six a day');

  for i in 61..100 loop
    insert into auth.users (email) values ('deck' || i || '@deck.edu') returning id into v_uid;
    insert into profiles (id, university_id, first_name, gender, grad_year, major, age, onboarded_at)
    values (v_uid, v_campus, 'Extra' || i, 'man', '2027', 'Major', 20, now());
    insert into profile_preferences (profile_id, interested_in) values (v_uid, array['everyone']);
  end loop;
  perform assert(deck_size_for(v_campus) = 10, 'a hundred people, ten a day');

  for i in 101..180 loop
    insert into auth.users (email) values ('deck' || i || '@deck.edu') returning id into v_uid;
    insert into profiles (id, university_id, first_name, gender, grad_year, major, age, onboarded_at)
    values (v_uid, v_campus, 'Extra' || i, 'woman', '2027', 'Major', 20, now());
    insert into profile_preferences (profile_id, interested_in) values (v_uid, array['everyone']);
  end loop;
  perform assert(deck_size_for(v_campus) = 10,
                 'and ten is the ceiling however big the campus gets');

  --  Back to fifty for everything below: the extras were only ever arithmetic.
  delete from profiles where university_id = v_campus and first_name like 'Extra%';
  perform assert(deck_size_for(v_campus) = 5, 'back to five a day');
end $$;

--  18b. the deck itself
do $$
declare
  v_me uuid := current_setting('test.deck_me')::uuid;
  n int; m int;
  first_call uuid[];
  second_call uuid[];
begin
  perform act_as(v_me);

  select array_agg(id order by id) into first_call from get_deck();
  perform assert(cardinality(first_call) = 5, 'the first look hands you exactly five people');

  select array_agg(id order by id) into second_call from get_deck();
  perform assert(first_call = second_call,
                 'and asking again the same day is the same five, not five more');
  select count(*) into n from deck_views where profile_id = v_me;
  perform assert(n = 5, 'five assignments written, once');

  --  Acting on one and coming back does not top the day up: the day's ration
  --  is what was handed out, not what is left in your hand.
  perform mark_deck_acted(first_call[1]);
  select count(*) into n from get_deck();
  perform assert(n = 4, 'deciding about somebody takes them out of the deck');
  select count(*) into m from deck_views where profile_id = v_me;
  perform assert(m = 5, 'and does not pull a replacement in the same day');

  --  Tomorrow. Backdating today's rows is exactly what tomorrow looks like
  --  from here, and it does not need the clock to move.
  update deck_views set seen_at = seen_at - interval '1 day' where profile_id = v_me;
  select count(*) into n from get_deck();
  perform assert(n = 5, 'the next day tops you back up to five');
  select count(*) into m from deck_views where profile_id = v_me;
  perform assert(m = 6, 'by adding exactly the one you decided about');

  --  And the person you passed on never comes back.
  perform assert(not exists (select 1 from get_deck() g where g.id = first_call[1]),
                 'somebody you passed on is not offered again');

  --  An untouched pile does not grow without limit either.
  update deck_views set seen_at = seen_at - interval '2 days' where profile_id = v_me;
  select count(*) into n from get_deck();
  perform assert(n = 5, 'a day you never opened does not stack up to ten tomorrow');
end $$;

--  18c. preferences are checked both ways
do $$
declare
  v_me  uuid := current_setting('test.deck_me')::uuid;
  v_her uuid := current_setting('test.deck_her')::uuid;
  ok boolean;
begin
  perform act_as(v_me);
  update profile_preferences set interested_in = array['woman'] where profile_id = v_me;
  update deck_views set acted_at = now() where profile_id = v_me;

  perform assert(not exists (select 1 from deck_candidates() c where c.gender <> 'woman'),
                 'you are only shown people you asked for');

  --  She is looking for women; he is not one. The old deck showed her to him
  --  anyway and spent a fifth of his day doing it.
  update profile_preferences set interested_in = array['woman'] where profile_id = v_her;
  perform assert(not exists (select 1 from deck_candidates() c where c.id = v_her),
                 'and never shown somebody whose own settings rule you out');

  update profile_preferences set interested_in = array['everyone'] where profile_id = v_her;
  perform assert(exists (select 1 from deck_candidates() c where c.id = v_her),
                 'once she is open to everyone, she is back');

  --  Age is checked both ways too.
  update profile_preferences set min_age = 30, max_age = 40 where profile_id = v_her;
  perform assert(not exists (select 1 from deck_candidates() c where c.id = v_her),
                 'and the same for an age range that excludes you');
  update profile_preferences set min_age = 18, max_age = 30 where profile_id = v_her;
end $$;

--  18d. scoring
do $$
declare
  v_me  uuid := current_setting('test.deck_me')::uuid;
  v_her uuid := current_setting('test.deck_her')::uuid;
  v_third uuid;
  a int; b int; c int;
begin
  perform act_as(v_me);

  perform assert(compatibility(v_me, v_her) = compatibility(v_her, v_me),
                 'compatibility means the same thing from either side');

  --  Nobody has filled the survey in yet, and it still produces a real answer
  --  rather than zero — the unanswered half leaves the denominator too.
  a := compatibility(v_me, v_her);
  perform assert(a between 1 and 99, 'a pair with no survey between them still scores');

  --  Give her every answer he has. It can only go up.
  insert into profile_survey (profile_id, ideal_dates, budget_level, drinks,
                              going_out, chronotype, planning, group_size, texting, conversation)
  values (v_me,  array['coffee','walk'], 2, 'sometimes',
          'homebody', 'night', 'planner', 'one-on-one', 'texter', 'deep'),
         (v_her, array['coffee','walk'], 2, 'sometimes',
          'homebody', 'night', 'planner', 'one-on-one', 'texter', 'deep');

  b := compatibility(v_me, v_her);
  perform assert(b > a, 'answering the survey the same way raises the score');

  --  Somebody who answered it the opposite way scores below both.
  select id into v_third from profiles
   where university_id = current_setting('test.deck_campus')::uuid
     and id not in (v_me, v_her) limit 1;
  insert into profile_survey (profile_id, ideal_dates, budget_level,
                              going_out, chronotype, planning, group_size, texting, conversation)
  values (v_third, array['clubbing-not-a-real-token'], 4,
          'out-out', 'early', 'spontaneous', 'big-group', 'in-person', 'light');
  c := compatibility(v_me, v_third);
  perform assert(c < b, 'and answering it the opposite way lowers it');

  --  A middle answer is compatible with both ends, not a shrug.
  perform assert(trait_agreement('night', 'night') = 2, 'two night owls agree completely');
  perform assert(trait_agreement('night', 'either') = 1, 'an "either" is halfway to both');
  perform assert(trait_agreement('night', 'early') = 0, 'the two ends do not');
  perform assert(trait_agreement('night', null) is null,
                 'and an unanswered question is not a disagreement');

  --  Someone who skipped the survey entirely is not buried beneath everyone
  --  who filled it in. This is the whole reason the score is a percentage of
  --  what was achievable rather than a raw total.
  perform assert(compatibility(v_me, (select id from profiles
                                       where university_id = current_setting('test.deck_campus')::uuid
                                         and id not in (v_me, v_her, v_third)
                                       limit 1)) > 1,
                 'skipping the survey does not park you at the bottom forever');
end $$;

--  18e. ordering people has no price
do $$
declare src text := '';
declare f text;
begin
  foreach f in array array['get_deck', 'deck_candidates', 'compatibility',
                           'compatibility_reasons', 'deck_size_for', 'deck_status']
  loop
    select src || string_agg(pg_get_functiondef(p.oid), ' ') into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f;
  end loop;

  perform assert(src !~* 'partner_plans|partner_subscriptions|partner_credit|date_spots|partner_offers',
                 'nothing that orders people mentions a table with a price on it');
  perform assert(src ~* 'profile_interests', 'and it does read what people said they like');
end $$;

--  18f. somewhere for the two of them to go
do $$
declare
  v_campus uuid := current_setting('test.campus')::uuid;
  v_ada uuid := current_setting('test.ada')::uuid;
  v_bo  uuid := current_setting('test.bo')::uuid;
  v_conv uuid := current_setting('test.conv')::uuid;
  v_coffee uuid;
  v_bar uuid;
  n int;
begin
  --  A coffee place and a bar, both perfectly ordinary, neither a partner.
  insert into date_spots (university_id, name, kind, date_types, vibes, price_level,
                          walk_minutes, is_published)
  values (v_campus, 'Quiet Cup', 'Coffee', array['coffee','first-date','study'],
          array['cozy','quiet'], 1, 4, true)
  returning id into v_coffee;

  insert into date_spots (university_id, name, kind, date_types, vibes, price_level,
                          walk_minutes, is_published, min_age)
  values (v_campus, 'The Tap', 'Bar', array['drinks','late-night'],
          array['social'], 2, 6, true, 21)
  returning id into v_bar;

  --  Ada is 20. The bar is 21+, and nothing had ever read that column.
  perform act_as(v_ada);
  perform assert(not exists (
    select 1 from recommend_date_spots(null, '{}', null, null, now(), null, 'discovery', 20) r
    where r.spot_id = v_bar),
    'a twenty-one-plus place is not suggested to somebody who is twenty');

  update profiles set age = 22 where id in (v_ada, v_bo);
  perform assert(exists (
    select 1 from recommend_date_spots(null, '{}', null, null, now(), null, 'discovery', 20) r
    where r.spot_id = v_bar),
    'and is suggested once they are old enough');

  --  Ada does not drink. A drinks-only place stops being a suggestion for her.
  insert into profile_survey (profile_id, ideal_dates, budget_level, drinks)
  values (v_ada, array['coffee','walk'], 1, 'never')
  on conflict (profile_id) do update set drinks = 'never';

  perform assert(not exists (
    select 1 from recommend_date_spots(null, '{}', null, null, now(), null, 'discovery', 20) r
    where r.spot_id = v_bar),
    'and not suggested at all to somebody who said no to drinks');

  --  What the two of them agree on beats what only one of them said. Bo says
  --  coffee too, so "surprise us" in their conversation puts the coffee place
  --  in front of everything else on this campus.
  insert into profile_survey (profile_id, ideal_dates, budget_level, drinks)
  values (v_bo, array['coffee','dinner'], 2, 'sometimes')
  on conflict (profile_id) do update set ideal_dates = array['coffee','dinner'];

  perform assert(
    (select r.spot_id from recommend_date_spots(null, '{}', null, null, now(), v_conv, 'planner', 20) r
     limit 1) = v_coffee,
    'asking for nothing in particular suggests what they both said they liked');

  --  And the couple's own answers never lift a business past a place that
  --  actually fits: the ceiling on what money moves is unchanged.
  perform assert(exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'recommend_date_spots'
      and pg_get_functiondef(p.oid) ~ 'k_partner_cap int := 10'),
    'and the entire commercial contribution is still capped at ten');

  perform set_config('test.coffee_spot', v_coffee::text, false);
end $$;

--  18g. a partner saying who they are good for can only narrow
do $$
declare
  v_partner uuid := current_setting('test.partner')::uuid;
  v_ada uuid := current_setting('test.ada')::uuid;
  before_n int;
  after_n int;
begin
  perform act_as(v_ada);
  select count(*) into before_n
  from recommend_date_spots(null, '{}', null, null, now(), null, 'discovery', 20);

  perform act_as(current_setting('test.biz')::uuid);
  update partner_targeting set interests = array['motorcycles'] where partner_id = v_partner;

  perform act_as(v_ada);
  select count(*) into after_n
  from recommend_date_spots(null, '{}', null, null, now(), null, 'discovery', 20);
  perform assert(after_n <= before_n,
                 'a business naming who it suits can only remove itself from suggestions');

  --  Give Ada that interest and it comes back — but never higher than it was.
  insert into profile_interests (profile_id, interest_id) values (v_ada, 'motorcycles')
  on conflict do nothing;
  perform assert((select count(*) from recommend_date_spots(null, '{}', null, null, now(), null, 'discovery', 20))
                 >= after_n,
                 'and matching it puts the business back where it already was');

  perform act_as(current_setting('test.biz')::uuid);
  update partner_targeting set interests = '{}' where partner_id = v_partner;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
--  19. Date Spots we add ourselves
-- ═══════════════════════════════════════════════════════════════════════════
--  20260828130000. `seed.sql` used to ship eight real Ann Arbor businesses as
--  "organic" Date Spots — none of which had heard of Loose Leaf. They are
--  deleted, and Backstage → Spots replaces them: ordinary `date_spots` rows
--  with no partner behind them, added by a person who has been there.
--
--  Everything that keeps that honest is checked here, because all of it is
--  one careless `create policy` away from not being true any more.

do $$
declare
  v_staff  uuid := current_setting('test.staff')::uuid;
  v_campus uuid := current_setting('test.campus')::uuid;
  v_house  uuid;
begin
  perform act_as(v_staff);
  set local role authenticated;

  insert into date_spots (university_id, name, kind, note, date_types, vibes,
                          price_level, walk_minutes, suggestable, added_by)
  values (v_campus, 'The Reading Room', 'Coffee',
          'Quiet enough to actually hear each other',
          array['coffee', 'first-date'], array['quiet', 'cozy'], 1, 6, false, v_staff)
  returning id into v_house;

  reset role;
  perform assert(v_house is not null,
                 'staff can add a Date Spot with no business behind it');
  perform set_config('test.house_spot', v_house::text, false);
end $$;

--  19a. and nobody else can
do $$
declare
  ok boolean := false;
  v_campus uuid := current_setting('test.campus')::uuid;
begin
  perform act_as(current_setting('test.ada')::uuid);
  set local role authenticated;
  begin
    insert into date_spots (university_id, name, kind)
    values (v_campus, 'Ada''s Coffee Empire', 'Coffee');
  exception when others then ok := true;
  end;
  reset role;
  perform assert(ok, 'a student cannot add one');
end $$;

--  19b. Backstage reaches the spots we added and no others. A business's own
--  card is the business's, and the policy is `partner_id is null` rather than
--  a disabled button, so this holds however the client is rewritten.
do $$
declare n int;
begin
  perform act_as(current_setting('test.staff')::uuid);
  set local role authenticated;
  update date_spots set note = 'edited from Backstage'
   where id = current_setting('test.spot')::uuid;
  get diagnostics n = row_count;
  reset role;
  perform assert(n = 0, 'Backstage cannot edit a partner''s own Date Spot');
end $$;

--  19c. A spot nobody signed can never be sponsored. Asserted with RLS *off*,
--  as the table owner, so what refuses it is the check constraint and not the
--  policy — the policy could be dropped tomorrow and this would still hold.
do $$
declare ok boolean := false;
begin
  begin
    update date_spots
       set is_sponsored = true, sponsor_name = 'Somebody Who Never Agreed'
     where id = current_setting('test.house_spot')::uuid;
  exception when others then ok := true;
  end;
  perform assert(ok,
    'a spot with no business behind it cannot be marked sponsored — a constraint, not a policy');
end $$;

--  19d. It sits where somebody is browsing, and stays out of the answer to a
--  question. Without `suggestable` this spot would rank near the top of a
--  coffee request: it matches the date type, it is a six-minute walk, and it
--  is on Ada's campus. So a zero here is the filter working and not an
--  accident of scoring.
do $$
declare
  v_house uuid := current_setting('test.house_spot')::uuid;
  n int;
begin
  perform act_as(current_setting('test.ada')::uuid);
  set local role authenticated;

  perform assert(exists (select 1 from date_spots where id = v_house),
                 'a student browsing Date Spots can see it');

  select count(*) into n
  from recommend_date_spots('coffee', '{}', null, null, now(), null, 'discovery', 20) r
  where r.spot_id = v_house;
  perform assert(n = 0, 'but it is never an answer to "where should we go?"');
  reset role;
end $$;

--  19e. …unless somebody deliberately turns it on, which is a row edit.
do $$
declare
  v_house uuid := current_setting('test.house_spot')::uuid;
  n int;
begin
  perform act_as(current_setting('test.staff')::uuid);
  set local role authenticated;
  update date_spots set suggestable = true where id = v_house;
  reset role;

  perform act_as(current_setting('test.ada')::uuid);
  set local role authenticated;
  select count(*) into n
  from recommend_date_spots('coffee', '{}', null, null, now(), null, 'discovery', 20) r
  where r.spot_id = v_house;
  reset role;
  perform assert(n = 1, 'turning it on takes a row edit and no deploy');
end $$;

--  19f. A folder name that is not a uuid is nobody's — it must not raise.
--  The three partner-media policies used to cast the first path segment
--  straight to uuid, so one folder named anything else would have taken every
--  upload in the bucket down with it, including the businesses' own.
do $$
begin
  perform assert(partner_folder_admin('house') = false,
                 'a storage folder that is not a uuid belongs to nobody, and does not raise');
  perform assert(partner_folder_admin(null) = false, 'nor does a missing one');
  perform assert(partner_folder_admin('00000000-0000-4000-8000-000000000000') = false,
                 'and the house folder belongs to no business either');
end $$;

--  19g. Removing one is the fastest thing on the page, and a date somebody
--  already planned around it survives. The foreign key had no action before
--  this migration, which would have made the remove button fail against a
--  plan nobody remembers making.
do $$
declare
  v_house uuid := current_setting('test.house_spot')::uuid;
  v_plan  uuid;
  n int;
begin
  insert into date_plans (conversation_id, proposed_by, date_type, when_text, spot_id)
  values (current_setting('test.conv')::uuid, current_setting('test.ada')::uuid,
          'coffee', 'Thursday after class', v_house)
  returning id into v_plan;

  perform act_as(current_setting('test.staff')::uuid);
  set local role authenticated;
  delete from date_spots where id = v_house;
  get diagnostics n = row_count;
  reset role;

  perform assert(n = 1, 'staff can remove a spot they added');
  perform assert(exists (select 1 from date_plans where id = v_plan and spot_id is null),
                 'and a date planned around it keeps the plan, loses the spot');
end $$;

\echo ''
\echo 'All partner invariants held.'
