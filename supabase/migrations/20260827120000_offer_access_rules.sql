-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — how often one person can use an offer, and where from
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Two holes in the Date Pass rules, both found by using the app rather than
--  by reading it.
--
--  1. **A redeemed pass was a reset button.** `date_passes_one_live_uidx` stops
--     somebody holding two live passes for the same offer, which reads like a
--     limit and is not one: the moment a pass is scanned it stops being `issued`
--     and the index lets the next one through. The same person could eat the
--     same free dessert every night of the week, and every one of those nights
--     bills the restaurant $1.50. What the index actually enforces is "one
--     ticket at a time", not "one perk per person".
--
--  2. **An offer could be unlocked with no date involved.** Anybody signed in
--     could open Campus → Date Spots, walk down the list and unlock every perk
--     on it. That is a coupon book with a dating app attached, which is
--     backwards: the perk exists to make a date easier to say yes to, and a
--     business paying per redemption is paying for *dates*, not for downloads.
--
--  Both answers are the same shape: the business decides, per offer, and the
--  database enforces it. Neither is a plan feature and neither is for sale.
--
--    per_person_rule            'once' · 'cooldown' · 'unlimited'
--    per_person_cooldown_days   how long 'cooldown' waits (default 30)
--    requires_date              unlockable only while planning with a match
--
--  Defaults are the careful end — once a month, dates only — because these
--  columns land on offers that already exist, and the direction that costs a
--  partner money if it's wrong is the loose one.
--
--  The clock runs from the **redemption**, not from the unlock. Unlocking and
--  never going is not a use of anything: the pass expires on its own and the
--  person is free to unlock it again. Only walking in counts, which is the
--  same event the partner is invoiced for, so the rule a restaurant sets and
--  the line on their bill are counting the same thing.
-- ═══════════════════════════════════════════════════════════════════════════

alter table partner_offers
  add column if not exists per_person_rule text not null default 'cooldown',
  add column if not exists per_person_cooldown_days int not null default 30,
  add column if not exists requires_date boolean not null default true;

do $$ begin
  alter table partner_offers add constraint partner_offers_per_person_rule_check
    check (per_person_rule in ('once', 'cooldown', 'unlimited'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table partner_offers add constraint partner_offers_cooldown_days_check
    check (per_person_cooldown_days between 1 and 365);
exception when duplicate_object then null; end $$;

comment on column partner_offers.per_person_rule is
  'How often one person may redeem this offer: once ever, once per '
  'per_person_cooldown_days, or as often as they like.';
comment on column partner_offers.requires_date is
  'True: only unlockable from a conversation the person is actually in — a '
  'match or an accepted mutual. False: unlockable from browsing Date Spots.';

-- ─── when this person last actually walked in ─────────────────────────────
--
--  Deliberately not granted to anybody. It reads one person's redemption
--  history for one offer, which is a dating-adjacent fact about a named
--  student; the only caller is `issue_date_pass`, which is security definer
--  and already knows who it is acting for.

create or replace function public.offer_last_redeemed_at(p_offer uuid, p_person uuid)
returns timestamptz
language sql stable security definer set search_path = public as $$
  select max(r.redeemed_at)
  from date_pass_redemptions r
  join date_passes d on d.id = r.pass_id
  where r.offer_id = p_offer and d.issued_to = p_person;
$$;

revoke execute on function public.offer_last_redeemed_at(uuid, uuid)
  from anon, authenticated, public;

-- ─── issuing, with both rules ─────────────────────────────────────────────
--
--  Order matters and is worth stating. A pass somebody is already holding is
--  handed back before either rule is consulted: they have the ticket, asking
--  for it twice is not a second unlock, and refusing it would strand a student
--  who opened the Date Spot to re-read the terms. Everything after that point
--  is about *minting* a new one.

create or replace function public.issue_date_pass(
  p_offer        uuid,
  p_conversation uuid default null,
  p_surface      text default 'planner'
)
-- OUT names are prefixed because plpgsql lets them shadow column references
-- inside the body, and `expires_at` appears in both.
returns table (
  pass_id         uuid,
  pass_code       text,
  pass_expires_at timestamptz,
  offer_title     text,
  partner_name    text
)
language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := auth.uid();
  o         partner_offers%rowtype;
  v_pass    uuid;
  v_code    text;
  v_loc     uuid;
  v_match   uuid;
  v_tries   int := 0;
  v_last    timestamptz;
  v_again   timestamptz;
begin
  if v_me is null or not exists (select 1 from profiles where id = v_me) then
    raise exception 'Not signed in.';
  end if;

  select * into o from partner_offers where id = p_offer;
  if not found then raise exception 'That offer is no longer available.'; end if;

  if not public.partner_has(o.partner_id, 'date_passes') then
    raise exception 'That offer is no longer available.';
  end if;
  if not public.offer_is_open(p_offer, now()) then
    raise exception 'That offer isn''t running right now.';
  end if;

  -- The credit ceiling, unchanged from 20260824120000. Same sentence as an
  -- offer that has run out for the month, because from where the student is
  -- standing it is the same thing.
  if not public.partner_can_issue(o.partner_id) then
    raise exception 'That offer isn''t running right now.';
  end if;

  -- Already holding a live one? Hand it back.
  select id into v_pass from date_passes
   where offer_id = p_offer and issued_to = v_me and status = 'issued'
     and expires_at > now();
  if v_pass is not null then
    return query
      select d.id, d.code, d.expires_at, o.title, p.name
      from date_passes d join partners p on p.id = d.partner_id
      where d.id = v_pass;
    return;
  end if;

  -- Where it may be unlocked from. `in_conversation()` is the same check the
  -- messages policies use, so a conversation id somebody guessed or copied out
  -- of a friend's screen buys them nothing.
  if p_conversation is not null and not public.in_conversation(p_conversation) then
    p_conversation := null;
  end if;

  if o.requires_date and p_conversation is null then
    raise exception
      'This perk is for a date you''re planning — open it from a chat with your match.';
  end if;

  -- How often one person may use it.
  if o.per_person_rule <> 'unlimited' then
    v_last := public.offer_last_redeemed_at(p_offer, v_me);

    if v_last is not null then
      if o.per_person_rule = 'once' then
        raise exception 'You''ve already used this one, and it''s one per person.';
      end if;

      v_again := v_last + make_interval(days => o.per_person_cooldown_days);
      if v_again > now() then
        raise exception 'You''ve used this one recently. You can unlock it again on %.',
          to_char(v_again, 'FMMonth FMDD');
      end if;
    end if;
  end if;

  if p_conversation is not null then
    select cv.match_id into v_match from conversations cv where cv.id = p_conversation;
  end if;

  select l.id into v_loc from partner_locations l
   where l.partner_id = o.partner_id
   order by l.is_primary desc, l.created_at
   limit 1;

  loop
    v_tries := v_tries + 1;
    v_code := public.generate_pass_code();
    begin
      insert into date_passes (
        code, offer_id, partner_id, partner_location_id,
        issued_to, conversation_id, match_id, expires_at, issue_surface
      )
      values (
        v_code, p_offer, o.partner_id, coalesce(o.partner_location_id, v_loc),
        v_me, p_conversation, v_match,
        now() + make_interval(days => o.pass_valid_days), p_surface
      )
      returning id into v_pass;
      exit;
    exception when unique_violation then
      if v_tries >= 5 then raise; end if;
    end;
  end loop;

  insert into partner_events (partner_id, date_spot_id, offer_id, stage)
  select o.partner_id, d.id, p_offer, 'offer_unlock'
  from date_spots d where d.partner_id = o.partner_id
  limit 1;

  return query
    select d.id, d.code, d.expires_at, o.title, p.name
    from date_passes d join partners p on p.id = d.partner_id
    where d.id = v_pass;
end;
$$;

-- ─── what a student is allowed to know about the rules ────────────────────
--
--  A rule somebody is subject to is not a commercial secret, and a button that
--  can only fail is worse than a sentence explaining why. So the three new
--  columns join the view — and the caps, counts and internal status stay off
--  it exactly as before. `create or replace view` only allows columns to be
--  added at the end, which is why they are.

create or replace view public.public_offers as
  select
    o.id, o.partner_id, o.title, o.offer_type, o.percent_off,
    o.amount_off_cents, o.min_spend_cents, o.free_item, o.description,
    o.terms, o.days_of_week, o.start_time, o.end_time,
    o.requires_date, o.per_person_rule, o.per_person_cooldown_days
  from public.partner_offers o
  where o.status = 'active'
    and public.partner_is_live(o.partner_id)
    and public.partner_has(o.partner_id, 'offers')
    -- Kept from 20260824120000: an over-limit partner quietly stops being
    -- offered. Dropping it here would have re-opened the credit ceiling.
    and public.partner_can_issue(o.partner_id);

grant select on public.public_offers to authenticated;
