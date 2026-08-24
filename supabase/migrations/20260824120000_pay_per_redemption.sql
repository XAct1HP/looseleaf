-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — Loose Leaf for Partners: pay per redemption
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Replaces the three-tier subscription with a single free tier that bills
--  $1.50 when a Date Pass is actually redeemed. Joining costs nothing, being
--  listed costs nothing, running an offer costs nothing. A business pays only
--  for a couple who walked in.
--
--  Three things this migration has to get right, and they are the reason it
--  is one file rather than a column change:
--
--   · A free tier still needs a credit limit.
--     A monthly invoice is a bill, not a collection — a restaurant can take
--     the foot traffic and let the card fail. So the exposure is capped:
--     `partner_credit` holds a hard ceiling on unbilled redemptions, the
--     ceiling rises automatically as a partner pays invoices, and the ceiling
--     is enforced in this file rather than in the client. The most Loose Leaf
--     can lose to any one business is that business's current limit.
--
--   · The cap stops issuing before it stops honouring.
--     A student holding a Date Pass must not be turned away at the counter
--     because the restaurant is near its limit. Crossing the limit stops the
--     offer being *offered* — it vanishes from recommendations and cannot be
--     unlocked — while passes already in someone's hand keep working through
--     a grace band above the limit. The situation drains itself.
--
--   · The ledger is ours, not Stripe's.
--     Every redemption stamps the fee it will be billed at, at the moment it
--     happens, in `date_pass_redemptions`. Stripe is told afterwards. A price
--     change never rewrites history, a Stripe outage never blocks a date, and
--     any invoice can be reconciled line for line against the same table the
--     partner's own dashboard shows them.
--
--  What did NOT change: relevance still comes before payment. Nothing here
--  touches `recommend_date_spots()` scoring, and the entitlement mechanism
--  stays exactly as it was — it just resolves to the free plan for everybody.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
--  1 · What a redemption costs
-- ═══════════════════════════════════════════════════════════════════════════

--  One row, on purpose. The price of a redemption is data — changing it is an
--  UPDATE, not a deploy, and it takes effect on the *next* redemption because
--  the fee is stamped onto each row as it is written.
create table if not exists platform_billing (
  id                      boolean primary key default true check (id),
  redemption_fee_cents    int  not null default 150 check (redemption_fee_cents >= 0),
  currency                text not null default 'usd',
  -- The event name configured on the Stripe billing meter. Must match the
  -- meter exactly or events land nowhere and Stripe reports `no_meter`.
  stripe_meter_event_name text not null default 'date_pass_redemption',
  -- The metered price partners are subscribed to at $0/month. Null means
  -- billing is not configured yet, which every code path reads as "collect
  -- nothing, and say so plainly" rather than as an error.
  stripe_metered_price_id text,
  updated_at              timestamptz not null default now()
);

insert into platform_billing (id) values (true) on conflict (id) do nothing;

create or replace function public.redemption_fee_cents()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select redemption_fee_cents from platform_billing where id), 150);
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  2 · The trust ladder
-- ═══════════════════════════════════════════════════════════════════════════
--
--  How much unbilled redemption a business is allowed to accrue before Loose
--  Leaf stops extending it credit. A brand new restaurant gets a small number
--  because nothing is known about it; the number climbs on its own as
--  invoices get paid, and falls the moment one doesn't.
--
--  Tiers are rows so the ladder can be tuned without a deploy — same reason
--  entitlements are rows. `sort` orders them; the highest one whose
--  conditions are met wins.

create table if not exists partner_credit_tiers (
  id                     text primary key,
  name                   text not null,
  sort                   int  not null,
  -- The hard ceiling on unbilled redemptions.
  limit_cents            int  not null check (limit_cents >= 0),
  -- How far past the ceiling an *already issued* pass is still honoured. This
  -- is the difference between "we stop selling you credit" and "we embarrass
  -- a nineteen-year-old in front of their date".
  grace_cents            int  not null default 0 check (grace_cents >= 0),
  min_paid_invoices      int  not null default 0,
  min_paid_cents         bigint not null default 0,
  -- A tier can require that any past failure is old news.
  min_days_since_failure int  not null default 0,
  blurb                  text
);

insert into partner_credit_tiers
  (id, sort, name, limit_cents, grace_cents, min_paid_invoices, min_paid_cents, min_days_since_failure, blurb) values
  ('new',       10, 'New partner',   2500,  1000, 0, 0,     0,
   'Everyone starts here. Roughly 16 redemptions before the first invoice has to clear.'),
  ('known',     20, 'Established',   7500,  2000, 1, 0,     0,
   'One invoice paid in full.'),
  ('trusted',   30, 'Trusted',      20000,  5000, 3, 15000, 90,
   'Three invoices paid, over $150 lifetime, no failure in the last 90 days.'),
  ('anchor',    40, 'Anchor',       50000, 10000, 6, 60000, 180,
   'Six invoices paid, over $600 lifetime, no failure in the last 180 days.')
on conflict (id) do nothing;


--  Per-partner credit state. One row per business, created by trigger so it
--  can never be missing — a partner with no credit row would otherwise read
--  as unlimited, which is the exact failure this table exists to prevent.
create table if not exists partner_credit (
  partner_id           uuid primary key references partners (id) on delete cascade,
  tier_id              text not null default 'new' references partner_credit_tiers (id),
  -- Staff overrides. Null means "use the ladder", which is almost always
  -- right; these exist for the one restaurant you know personally and the one
  -- that needs a shorter leash than the ladder would give it.
  limit_override_cents int  check (limit_override_cents >= 0),
  rate_override_cents  int  check (rate_override_cents >= 0),
  -- Payment history, written only by the webhook.
  paid_invoice_count   int    not null default 0,
  paid_cents_total     bigint not null default 0,
  consecutive_failures int    not null default 0,
  last_paid_at         timestamptz,
  last_failure_at      timestamptz,
  -- A hard stop. Set when collection has genuinely failed, or by staff.
  -- Suspension pauses Date Passes; it never hides the Date Spot, because
  -- being listed is free and withholding it is not leverage we actually have.
  suspended_at         timestamptz,
  suspend_reason       text,
  staff_note           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists partner_credit_suspended_idx
  on partner_credit (suspended_at) where suspended_at is not null;

create or replace function public.ensure_partner_credit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into partner_credit (partner_id) values (new.id)
  on conflict (partner_id) do nothing;
  return new;
end;
$$;

drop trigger if exists partners_credit_row on partners;
create trigger partners_credit_row after insert on partners
  for each row execute function public.ensure_partner_credit();

-- Backfill for businesses that existed before this migration.
insert into partner_credit (partner_id)
  select id from partners on conflict (partner_id) do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
--  3 · The ledger
-- ═══════════════════════════════════════════════════════════════════════════
--
--  `date_pass_redemptions` becomes the billing ledger as well as the
--  attribution record. It already was the number a partner sees on their
--  dashboard; making it the number on the invoice too means the two can never
--  disagree.
--
--  Lifecycle of `bill_status`:
--    pending  → written at redemption, not yet told to Stripe
--    metered  → a meter event reached Stripe
--    invoiced → Stripe finalised an invoice that includes it
--    paid     → that invoice was paid
--    waived   → staff wrote it off; counts for attribution, not for money
--    failed   → the invoice went uncollectible
--
--  Exposure is everything that is not `paid` or `waived`.

alter table date_pass_redemptions
  add column if not exists fee_cents        int not null default 0,
  add column if not exists bill_status      text not null default 'pending',
  add column if not exists metered_at       timestamptz,
  add column if not exists stripe_invoice_id text,
  -- The idempotency key sent to Stripe. Stored so a retry after a timeout
  -- sends the same key rather than double-billing a restaurant.
  add column if not exists meter_identifier text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'date_pass_redemptions_bill_status_check'
  ) then
    alter table date_pass_redemptions
      add constraint date_pass_redemptions_bill_status_check
      check (bill_status in ('pending','metered','invoiced','paid','waived','failed'));
  end if;
end $$;

--  Redemptions that predate this migration were never billable. Marking them
--  waived rather than pending stops the first metering run from inventing an
--  invoice for work done under the old model.
update date_pass_redemptions
   set bill_status = 'waived', fee_cents = 0
 where bill_status = 'pending' and fee_cents = 0 and redeemed_at < now();

--  The metering worker's query, and the exposure sum, both live on this.
create index if not exists date_pass_redemptions_billing_idx
  on date_pass_redemptions (bill_status, redeemed_at)
  where bill_status in ('pending','metered','invoiced');

create unique index if not exists date_pass_redemptions_meter_uidx
  on date_pass_redemptions (meter_identifier) where meter_identifier is not null;

create index if not exists date_pass_redemptions_invoice_idx
  on date_pass_redemptions (stripe_invoice_id) where stripe_invoice_id is not null;


-- ═══════════════════════════════════════════════════════════════════════════
--  4 · Card on file
-- ═══════════════════════════════════════════════════════════════════════════
--
--  `partner_subscriptions` keeps its name and its role: it mirrors what
--  Stripe says, and only the webhook writes it. What it mirrors is now a
--  $0/month metered subscription — a container for invoicing and dunning, not
--  a plan. The partner never chooses it and never sees a recurring charge.

alter table partner_subscriptions
  add column if not exists payment_method_brand text,
  add column if not exists payment_method_last4 text,
  add column if not exists payment_method_at    timestamptz,
  add column if not exists billing_email        text,
  -- Kept so the old three-tier world is legible in the data after the fact.
  add column if not exists legacy_plan_id       text;

update partner_subscriptions
   set legacy_plan_id = plan_id
 where legacy_plan_id is null
   and plan_id in ('date-spot','featured','date-partner');


-- ═══════════════════════════════════════════════════════════════════════════
--  5 · One free plan
-- ═══════════════════════════════════════════════════════════════════════════
--
--  The entitlement mechanism was worth keeping — it is how a feature gets
--  turned off without a deploy. What changes is that every partner resolves
--  to the same row, and that row has everything switched on. Revenue comes
--  from redemptions now, so there is nothing left to withhold.

insert into partner_plans (id, name, blurb, monthly_cents, entitlements, sort, is_public) values
  (
    'free', 'Loose Leaf Partner',
    'Free to join. You pay only when a Date Pass is redeemed.',
    0,
    jsonb_build_object(
      'discovery',               true,
      'partner_badge',           true,
      'photos',                  true,
      'date_categories',         true,
      'analytics',               'advanced',
      'featured_placement',      true,
      'recommendations',         true,
      'offers',                  true,
      'chat_recommendations',    true,
      'date_passes',             true,
      'redemption',              true,
      'targeting',               true,
      'verified_date_reporting', true,
      'max_locations',           10,
      'max_active_offers',       6,
      'gallery_photos',          12
    ),
    10, true
  )
on conflict (id) do update set
  name          = excluded.name,
  blurb         = excluded.blurb,
  monthly_cents = excluded.monthly_cents,
  entitlements  = excluded.entitlements,
  is_public     = true,
  updated_at    = now();

--  The old tiers stay as rows so historical `legacy_plan_id` values still
--  resolve to a name, but nothing offers them any more.
update partner_plans set is_public = false
 where id in ('date-spot','featured','date-partner');


--  Entitlements no longer depend on a subscription. A partner who has never
--  entered a card has the same feature set as one who redeems fifty passes a
--  week — the difference between them is credit, not capability, and credit
--  is enforced further down rather than by silently removing features.
create or replace function public.partner_entitlements(p_partner uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pl.entitlements from partner_plans pl where pl.id = 'free'),
    '{}'::jsonb)
  from partners p where p.id = p_partner;
$$;

--  Visibility to students is now purely a moderation decision. It used to
--  also require a live subscription; under a free tier there is nothing to
--  check, and hiding a listing over money would punish the students who were
--  looking for somewhere to go.
create or replace function public.partner_is_live(p_partner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from partners p
     where p.id = p_partner
       and p.status = 'active'
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  6 · Credit: the rate, the ceiling, and what is outstanding
-- ═══════════════════════════════════════════════════════════════════════════

--  What this partner is charged per redemption. A negotiated rate lives on
--  their credit row; everyone else gets the platform price.
create or replace function public.partner_fee_cents(p_partner uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c.rate_override_cents from partner_credit c where c.partner_id = p_partner),
    public.redemption_fee_cents());
$$;

--  The ceiling: a staff override if there is one, otherwise the tier's.
create or replace function public.partner_credit_limit_cents(p_partner uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    c.limit_override_cents,
    t.limit_cents,
    0)
  from partner_credit c
  left join partner_credit_tiers t on t.id = c.tier_id
  where c.partner_id = p_partner;
$$;

create or replace function public.partner_credit_grace_cents(p_partner uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(t.grace_cents, 0)
  from partner_credit c
  left join partner_credit_tiers t on t.id = c.tier_id
  where c.partner_id = p_partner;
$$;

--  Money owed and not yet collected. An invoice that exists but has not been
--  paid is still exposure, which is why 'invoiced' counts here — a partner
--  sitting on an unpaid invoice should not be quietly extended more credit.
create or replace function public.partner_unbilled_cents(p_partner uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(r.fee_cents), 0)::bigint
  from date_pass_redemptions r
  where r.partner_id = p_partner
    and r.bill_status in ('pending','metered','invoiced','failed');
$$;

--  Is there a usable card behind this business?
create or replace function public.partner_has_card(p_partner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from partner_subscriptions s
     where s.partner_id = p_partner
       and s.payment_method_at is not null
       and s.stripe_customer_id is not null
       and coalesce(s.status, '') not in ('incomplete_expired', 'canceled')
  );
$$;


--  ── the one function everything else asks ────────────────────────────────
--
--  Everything about a partner's ability to trade is decided here, once, and
--  read everywhere else. `can_issue` gates handing out new passes;
--  `can_redeem` gates honouring one that is already in somebody's hand, and
--  is deliberately more permissive by exactly the grace band.
create or replace function public.partner_credit_state(p_partner uuid)
returns table (
  tier_id         text,
  tier_name       text,
  fee_cents       int,
  limit_cents     int,
  grace_cents     int,
  unbilled_cents  bigint,
  remaining_cents bigint,
  has_card        boolean,
  suspended       boolean,
  can_issue       boolean,
  can_redeem      boolean,
  reason          text
)
language plpgsql stable security definer set search_path = public as $$
declare
  c          partner_credit%rowtype;
  v_tier     text;
  v_fee      int;
  v_limit    int;
  v_grace    int;
  v_unbilled bigint;
  v_card     boolean;
  v_susp     boolean;
  v_issue    boolean;
  v_redeem   boolean;
  v_reason   text := null;
begin
  select * into c from partner_credit where partner_id = p_partner;
  if not found then
    -- No credit row means no credit. Fails closed by construction.
    return query select
      'new'::text, 'New partner'::text, public.redemption_fee_cents(), 0, 0,
      0::bigint, 0::bigint, false, false, false, false, 'no_account'::text;
    return;
  end if;

  select t.name into v_tier from partner_credit_tiers t where t.id = c.tier_id;

  v_fee      := public.partner_fee_cents(p_partner);
  v_limit    := public.partner_credit_limit_cents(p_partner);
  v_grace    := public.partner_credit_grace_cents(p_partner);
  v_unbilled := public.partner_unbilled_cents(p_partner);
  v_card     := public.partner_has_card(p_partner);
  v_susp     := c.suspended_at is not null;

  v_issue  := true;
  v_redeem := true;

  -- Order matters: the most actionable reason wins, because this string is
  -- what a member of staff reads while somebody waits at the counter.
  if v_susp then
    v_issue := false; v_redeem := false; v_reason := 'suspended';
  elsif not v_card then
    v_issue := false; v_redeem := false; v_reason := 'no_card';
  else
    if v_unbilled + v_fee > v_limit then
      v_issue := false; v_reason := 'at_limit';
    end if;
    if v_unbilled + v_fee > v_limit + v_grace then
      v_redeem := false; v_reason := 'over_limit';
    end if;
  end if;

  return query select
    c.tier_id,
    coalesce(v_tier, 'New partner'),
    v_fee,
    v_limit,
    v_grace,
    v_unbilled,
    greatest(v_limit::bigint - v_unbilled, 0),
    v_card,
    v_susp,
    v_issue,
    v_redeem,
    v_reason;
end;
$$;

create or replace function public.partner_can_issue(p_partner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select s.can_issue from public.partner_credit_state(p_partner) s), false);
$$;

create or replace function public.partner_can_redeem(p_partner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select s.can_redeem from public.partner_credit_state(p_partner) s), false);
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  7 · Enforcing it where passes are issued and honoured
-- ═══════════════════════════════════════════════════════════════════════════
--
--  `offer_is_open()` is left alone on purpose. It answers one question —
--  "is this offer running right now?" — and billing is not part of that
--  question. Mixing the two would mean `redeem_date_pass()`, which calls it,
--  inherited the issuing rule and refused passes it should have honoured.

--  Students only see offers a partner can still afford to hand out. Dropping
--  out of this view is how the situation self-heals: no new passes are
--  issued, the outstanding ones drain, and paying the invoice brings the
--  offer back with no intervention.
create or replace view public.public_offers as
  select
    o.id, o.partner_id, o.title, o.offer_type, o.percent_off,
    o.amount_off_cents, o.min_spend_cents, o.free_item, o.description,
    o.terms, o.days_of_week, o.start_time, o.end_time
  from public.partner_offers o
  where o.status = 'active'
    and public.partner_is_live(o.partner_id)
    and public.partner_has(o.partner_id, 'offers')
    and public.partner_can_issue(o.partner_id);

grant select on public.public_offers to authenticated;


--  Issuing. The message a student sees never mentions the business's billing
--  — that is between Loose Leaf and the restaurant, and "they're behind on
--  their invoice" is not something a nineteen-year-old should be told about
--  the place they were about to take somebody.
create or replace function public.issue_date_pass(
  p_offer        uuid,
  p_conversation uuid default null,
  p_surface      text default 'planner'
)
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

  -- The credit ceiling. Same sentence as an offer that has run out for the
  -- month, because from where the student is standing it is the same thing.
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


--  Redeeming. This is the only place money is created, so it is also the only
--  place the fee is decided: `fee_cents` is stamped from the effective rate
--  at this instant and never recalculated. Raising the platform price next
--  month cannot retroactively change what this scan cost.
create or replace function public.redeem_date_pass(
  p_partner uuid,
  p_code    text,
  p_amount_cents int default null
)
returns table (ok boolean, reason text, redeemed_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  dp     date_passes%rowtype;
  o      partner_offers%rowtype;
  cs     record;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9-]', '', 'g'));
  v_when timestamptz := now();
begin
  if not public.partner_can(p_partner, 'scan') then
    raise exception 'Not authorised';
  end if;

  select * into cs from public.partner_credit_state(p_partner);

  -- Billing problems are said out loud rather than raised, because the person
  -- reading this is standing behind a counter and needs to know whether to
  -- honour the deal off their own bat, not to see a stack trace.
  if not cs.can_redeem then
    return query select false,
      case cs.reason
        when 'no_card'    then 'Date Passes are paused — the account owner needs to add a card in Billing.'
        when 'suspended'  then 'Date Passes are paused on this account. The owner can fix this in Billing.'
        else 'Date Passes are paused until the outstanding Loose Leaf invoice is paid.'
      end,
      null::timestamptz;
    return;
  end if;

  if v_code <> '' and left(v_code, 3) <> 'LL-' then v_code := 'LL-' || v_code; end if;

  select * into dp from date_passes where code = v_code for update;

  if not found or dp.partner_id <> p_partner then
    return query select false, 'We don''t recognise that code.', null::timestamptz;
    return;
  end if;

  select * into o from partner_offers where id = dp.offer_id;

  if dp.status = 'void' then
    return query select false, 'This pass was cancelled.', null::timestamptz; return;
  end if;
  if dp.status = 'redeemed' and not o.multi_use then
    return query select false, 'Already used.', dp.redeemed_at; return;
  end if;
  if dp.expires_at < v_when then
    return query select false, 'This pass has expired.', null::timestamptz; return;
  end if;
  if not public.offer_is_open(o.id, v_when) then
    return query select false, 'This offer isn''t running right now.', null::timestamptz; return;
  end if;

  insert into date_pass_redemptions
    (pass_id, partner_id, offer_id, partner_location_id, redeemed_by, redeemed_at,
     amount_cents, fee_cents, bill_status)
  values
    (dp.id, p_partner, o.id, dp.partner_location_id, auth.uid(), v_when,
     p_amount_cents, cs.fee_cents, 'pending');

  update date_passes
     set status = 'redeemed', redeemed_at = v_when
   where id = dp.id;

  insert into partner_events (partner_id, offer_id, stage)
  values (p_partner, o.id, 'verified_date');

  return query select true, null::text, v_when;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  8 · What the dashboard reads
-- ═══════════════════════════════════════════════════════════════════════════

--  Everything the Billing page needs in one round trip. Gated on the billing
--  page permission, not on ownership, because an owner who hands billing to
--  their manager expects that manager to be able to fix a declined card.
create or replace function public.partner_billing_summary(p_partner uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  cs      record;
  v_month record;
  v_prev  record;
begin
  if not public.partner_can(p_partner, 'billing') and not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  select * into cs from public.partner_credit_state(p_partner);

  select count(*) as n, coalesce(sum(fee_cents), 0) as cents
    into v_month
    from date_pass_redemptions
   where partner_id = p_partner
     and redeemed_at >= date_trunc('month', now())
     and bill_status <> 'waived';

  select count(*) as n, coalesce(sum(fee_cents), 0) as cents
    into v_prev
    from date_pass_redemptions
   where partner_id = p_partner
     and redeemed_at >= date_trunc('month', now()) - interval '1 month'
     and redeemed_at <  date_trunc('month', now())
     and bill_status <> 'waived';

  return jsonb_build_object(
    'fee_cents',          cs.fee_cents,
    'tier_id',            cs.tier_id,
    'tier_name',          cs.tier_name,
    'limit_cents',        cs.limit_cents,
    'grace_cents',        cs.grace_cents,
    'unbilled_cents',     cs.unbilled_cents,
    'remaining_cents',    cs.remaining_cents,
    'has_card',           cs.has_card,
    'suspended',          cs.suspended,
    'can_issue',          cs.can_issue,
    'can_redeem',         cs.can_redeem,
    'reason',             cs.reason,
    'this_month_count',   v_month.n,
    'this_month_cents',   v_month.cents,
    'last_month_count',   v_prev.n,
    'last_month_cents',   v_prev.cents,
    'lifetime_paid_cents', (select paid_cents_total from partner_credit where partner_id = p_partner),
    'paid_invoices',      (select paid_invoice_count from partner_credit where partner_id = p_partner),
    'next_tier',          (
      select jsonb_build_object(
        'name', t.name, 'limit_cents', t.limit_cents,
        'min_paid_invoices', t.min_paid_invoices, 'min_paid_cents', t.min_paid_cents)
      from partner_credit_tiers t
      where t.sort > (select t2.sort from partner_credit_tiers t2 where t2.id = cs.tier_id)
      order by t.sort limit 1)
  );
end;
$$;

--  The line items behind an invoice, so a restaurant can check the bill
--  against the scans their own staff made. Same table, same numbers.
create or replace function public.partner_billable_redemptions(
  p_partner uuid,
  p_since   timestamptz default null,
  p_limit   int default 200
)
returns table (
  id           uuid,
  redeemed_at  timestamptz,
  offer_title  text,
  fee_cents    int,
  bill_status  text,
  invoice_id   text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.redeemed_at, o.title, r.fee_cents, r.bill_status, r.stripe_invoice_id
  from date_pass_redemptions r
  join partner_offers o on o.id = r.offer_id
  where r.partner_id = p_partner
    and (public.partner_can(p_partner, 'billing') or public.is_admin())
    and (p_since is null or r.redeemed_at >= p_since)
  order by r.redeemed_at desc
  limit least(coalesce(p_limit, 200), 500);
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  9 · What the webhook writes
-- ═══════════════════════════════════════════════════════════════════════════
--
--  These run as the service role from `stripe-webhook` and nowhere else. They
--  are the only things that move a partner up or down the ladder, which keeps
--  "has this business actually paid us" a question with exactly one answer.

--  Recomputes the tier from payment history. The highest tier whose
--  conditions are met wins; a partner cannot be placed above what they have
--  earned even by a staff mistake, because this reads only the counters.
create or replace function public.refresh_partner_credit(p_partner uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  c      partner_credit%rowtype;
  v_tier text;
begin
  select * into c from partner_credit where partner_id = p_partner;
  if not found then return null; end if;

  select t.id into v_tier
    from partner_credit_tiers t
   where t.min_paid_invoices <= c.paid_invoice_count
     and t.min_paid_cents    <= c.paid_cents_total
     and c.consecutive_failures = 0
     and (
       t.min_days_since_failure = 0
       or c.last_failure_at is null
       or c.last_failure_at < now() - make_interval(days => t.min_days_since_failure)
     )
   order by t.sort desc
   limit 1;

  v_tier := coalesce(v_tier, 'new');

  update partner_credit
     set tier_id = v_tier, updated_at = now()
   where partner_id = p_partner;

  return v_tier;
end;
$$;

--  An invoice was paid. Everything it covered is settled, the counters move,
--  any suspension lifts, and the ladder is recomputed.
--
--  A $0 invoice does none of that. Stripe raises one at the start of every
--  subscription and again for any month with no redemptions, and each arrives
--  as `invoice.paid` — so without this guard a business could climb the whole
--  ladder by being open and doing nothing, which is the exact opposite of
--  what the ladder is for.
create or replace function public.record_partner_invoice_paid(
  p_partner    uuid,
  p_invoice_id text,
  p_amount_cents bigint
)
returns text
language plpgsql security definer set search_path = public as $$
begin
  update date_pass_redemptions
     set bill_status = 'paid'
   where partner_id = p_partner
     and stripe_invoice_id = p_invoice_id
     and bill_status in ('invoiced','metered','pending','failed');

  if coalesce(p_amount_cents, 0) <= 0 then
    return (select tier_id from partner_credit where partner_id = p_partner);
  end if;

  update partner_credit
     set paid_invoice_count   = paid_invoice_count + 1,
         paid_cents_total     = paid_cents_total + greatest(coalesce(p_amount_cents, 0), 0),
         consecutive_failures = 0,
         last_paid_at         = now(),
         -- A payment clears a suspension that was about payment. A staff
         -- suspension is a different thing and says so.
         suspended_at         = case when suspend_reason = 'staff' then suspended_at else null end,
         suspend_reason       = case when suspend_reason = 'staff' then suspend_reason else null end,
         updated_at           = now()
   where partner_id = p_partner;

  return public.refresh_partner_credit(p_partner);
end;
$$;

--  An invoice attempt failed. One failure knocks them off any tier that
--  requires a clean record, which is most of them — the ladder does the
--  demotion, this function only records the fact.
create or replace function public.record_partner_invoice_failed(
  p_partner        uuid,
  p_invoice_id     text,
  p_attempt_count  int default 1,
  p_uncollectible  boolean default false
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_failures int;
begin
  update partner_credit
     set consecutive_failures = consecutive_failures + 1,
         last_failure_at      = now(),
         updated_at           = now()
   where partner_id = p_partner
  returning consecutive_failures into v_failures;

  if p_uncollectible then
    update date_pass_redemptions
       set bill_status = 'failed'
     where partner_id = p_partner
       and stripe_invoice_id = p_invoice_id
       and bill_status in ('invoiced','metered','pending');
  end if;

  -- Suspension is for collection having genuinely failed, not for a first
  -- decline — a card expiring should not switch a restaurant off overnight.
  -- Until then the credit ceiling does the containing, because the failed
  -- invoice still counts as outstanding.
  if p_uncollectible or coalesce(v_failures, 0) >= 3 then
    update partner_credit
       set suspended_at   = coalesce(suspended_at, now()),
           suspend_reason = coalesce(suspend_reason, 'unpaid'),
           updated_at     = now()
     where partner_id = p_partner;
  end if;

  return public.refresh_partner_credit(p_partner);
end;
$$;

--  Stripe finalised an invoice. Everything already told to the meter and not
--  yet on a bill belongs to this one. Stamping the id is what makes the
--  invoice reconcilable against the partner's own redemption list.
create or replace function public.attach_redemptions_to_invoice(
  p_partner    uuid,
  p_invoice_id text,
  p_period_end timestamptz default null
)
returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update date_pass_redemptions
     set bill_status = 'invoiced', stripe_invoice_id = p_invoice_id
   where partner_id = p_partner
     and bill_status = 'metered'
     and stripe_invoice_id is null
     and (p_period_end is null or redeemed_at < p_period_end);
  get diagnostics n = row_count;
  return n;
end;
$$;

--  The metering worker's two halves: what still needs telling to Stripe, and
--  marking it told. Kept as functions rather than direct table access so the
--  edge function needs no knowledge of the ledger's shape.
create or replace function public.redemptions_awaiting_meter(p_limit int default 500)
returns table (
  id               uuid,
  partner_id       uuid,
  customer_id      text,
  redeemed_at      timestamptz,
  fee_cents        int,
  meter_identifier text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.partner_id, s.stripe_customer_id, r.redeemed_at, r.fee_cents,
         coalesce(r.meter_identifier, 'llr_' || replace(r.id::text, '-', ''))
  from date_pass_redemptions r
  join partner_subscriptions s on s.partner_id = r.partner_id
  where r.bill_status = 'pending'
    and r.fee_cents > 0
    and s.stripe_customer_id is not null
    -- Stripe refuses meter events older than 35 days; anything that old has
    -- fallen through and needs a human, not another retry.
    and r.redeemed_at > now() - interval '30 days'
  order by r.redeemed_at
  limit least(coalesce(p_limit, 500), 1000);
$$;

create or replace function public.mark_redemptions_metered(
  p_ids uuid[],
  p_identifiers text[]
)
returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update date_pass_redemptions r
     set bill_status      = 'metered',
         metered_at       = now(),
         meter_identifier = coalesce(r.meter_identifier, u.ident)
    from unnest(p_ids, p_identifiers) as u(rid, ident)
   where r.id = u.rid
     and r.bill_status = 'pending';
  get diagnostics n = row_count;
  return n;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  10 · Backstage
-- ═══════════════════════════════════════════════════════════════════════════

--  Revenue under the new model. There is no MRR any more; the numbers that
--  matter are what was earned this month, what is owed, and how much of what
--  is owed is at risk.
create or replace function public.staff_partner_revenue()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  return jsonb_build_object(
    'fee_cents', public.redemption_fee_cents(),
    'this_month', (
      select jsonb_build_object(
        'redemptions', count(*),
        'cents', coalesce(sum(fee_cents), 0))
      from date_pass_redemptions
      where redeemed_at >= date_trunc('month', now()) and bill_status <> 'waived'),
    'last_month', (
      select jsonb_build_object(
        'redemptions', count(*),
        'cents', coalesce(sum(fee_cents), 0))
      from date_pass_redemptions
      where redeemed_at >= date_trunc('month', now()) - interval '1 month'
        and redeemed_at <  date_trunc('month', now())
        and bill_status <> 'waived'),
    'collected_cents', coalesce((
      select sum(fee_cents) from date_pass_redemptions where bill_status = 'paid'), 0),
    'outstanding_cents', coalesce((
      select sum(fee_cents) from date_pass_redemptions
      where bill_status in ('pending','metered','invoiced')), 0),
    'at_risk_cents', coalesce((
      select sum(fee_cents) from date_pass_redemptions
      where bill_status = 'failed'), 0),
    -- The number worth watching: how much credit is extended in total, i.e.
    -- the theoretical maximum that could be walked away from today.
    'exposure_ceiling_cents', coalesce((
      select sum(public.partner_credit_limit_cents(c.partner_id))
      from partner_credit c
      where public.partner_has_card(c.partner_id)), 0),
    'by_tier', coalesce((
      select jsonb_object_agg(t.name, q.n)
      from (select tier_id, count(*) n from partner_credit group by tier_id) q
      join partner_credit_tiers t on t.id = q.tier_id), '{}'::jsonb),
    'suspended', (select count(*) from partner_credit where suspended_at is not null),
    'without_card', (
      select count(*) from partners p
      where p.status = 'active' and not public.partner_has_card(p.id)),
    'partners_by_status', coalesce((
      select jsonb_object_agg(status, n)
      from (select status::text, count(*) n from partners group by status) q), '{}'::jsonb)
  );
end;
$$;

--  Every business's credit position, for the one screen where you decide who
--  gets a longer leash and who gets a shorter one.
create or replace function public.staff_partner_credit()
returns table (
  partner_id       uuid,
  partner_name     text,
  tier_id          text,
  tier_name        text,
  limit_cents      int,
  limit_override   int,
  rate_cents       int,
  unbilled_cents   bigint,
  has_card         boolean,
  suspended        boolean,
  suspend_reason   text,
  paid_invoices    int,
  paid_cents       bigint,
  last_paid_at     timestamptz,
  last_failure_at  timestamptz,
  staff_note       text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  return query
    select
      c.partner_id, p.name, c.tier_id, t.name,
      public.partner_credit_limit_cents(c.partner_id),
      c.limit_override_cents,
      public.partner_fee_cents(c.partner_id),
      public.partner_unbilled_cents(c.partner_id),
      public.partner_has_card(c.partner_id),
      c.suspended_at is not null,
      c.suspend_reason,
      c.paid_invoice_count, c.paid_cents_total,
      c.last_paid_at, c.last_failure_at, c.staff_note
    from partner_credit c
    join partners p on p.id = c.partner_id
    left join partner_credit_tiers t on t.id = c.tier_id
    order by public.partner_unbilled_cents(c.partner_id) desc, p.name;
end;
$$;

--  Staff adjustments. Null means "leave it alone"; passing an override of -1
--  clears it back to the ladder, because null already means something else.
create or replace function public.staff_set_partner_credit(
  p_partner        uuid,
  p_limit_override int     default null,
  p_rate_override  int     default null,
  p_suspended      boolean default null,
  p_note           text    default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  update partner_credit
     set limit_override_cents = case
           when p_limit_override is null then limit_override_cents
           when p_limit_override < 0     then null
           else p_limit_override end,
         rate_override_cents = case
           when p_rate_override is null then rate_override_cents
           when p_rate_override < 0     then null
           else p_rate_override end,
         suspended_at = case
           when p_suspended is null  then suspended_at
           when p_suspended          then coalesce(suspended_at, now())
           else null end,
         suspend_reason = case
           when p_suspended is null  then suspend_reason
           when p_suspended          then 'staff'
           else null end,
         staff_note = coalesce(p_note, staff_note),
         updated_at = now()
   where partner_id = p_partner;
end;
$$;

--  Writing off a redemption. Keeps the attribution — the date still happened
--  and the partner still gets credit for it — while removing the money.
create or replace function public.staff_waive_redemption(p_redemption uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;
  update date_pass_redemptions
     set bill_status = 'waived'
   where id = p_redemption and bill_status in ('pending','metered','invoiced','failed');
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  11 · Row level security and grants
-- ═══════════════════════════════════════════════════════════════════════════

alter table platform_billing      enable row level security;
alter table partner_credit_tiers  enable row level security;
alter table partner_credit        enable row level security;

--  The fee and the ladder are public knowledge — a restaurant deciding
--  whether to join should be able to read exactly what it will cost and how
--  the limit moves. Neither table carries anything about a specific business.
drop policy if exists "billing settings: readable" on platform_billing;
create policy "billing settings: readable" on platform_billing
  for select to anon, authenticated using (true);

drop policy if exists "credit tiers: readable" on partner_credit_tiers;
create policy "credit tiers: readable" on partner_credit_tiers
  for select to anon, authenticated using (true);

--  A credit row carries a business's payment history, so it reads like a
--  billing page: the people that business gave billing to, and staff.
drop policy if exists "credit: your own" on partner_credit;
create policy "credit: your own" on partner_credit
  for select to authenticated
  using (public.partner_can(partner_id, 'billing') or public.is_admin());

--  No insert/update/delete policy on any of the three. They are written by
--  the service role through the functions above and by nothing else.

grant select on platform_billing, partner_credit_tiers to anon, authenticated;
grant select on partner_credit to authenticated;

grant execute on function
  public.redemption_fee_cents(),
  public.partner_fee_cents(uuid),
  public.partner_credit_limit_cents(uuid),
  public.partner_credit_grace_cents(uuid),
  public.partner_unbilled_cents(uuid),
  public.partner_has_card(uuid),
  public.partner_credit_state(uuid),
  public.partner_can_issue(uuid),
  public.partner_can_redeem(uuid),
  public.partner_billing_summary(uuid),
  public.partner_billable_redemptions(uuid, timestamptz, int),
  public.issue_date_pass(uuid, uuid, text),
  public.redeem_date_pass(uuid, text, int),
  public.staff_partner_revenue(),
  public.staff_partner_credit(),
  public.staff_set_partner_credit(uuid, int, int, boolean, text),
  public.staff_waive_redemption(uuid, text)
to authenticated;

--  Deliberately NOT granted to `authenticated`. These move money and are
--  called by the webhook and the metering worker with the service role, which
--  bypasses grants anyway. Leaving them ungranted means a leaked anon key
--  cannot mark its own invoices paid.
revoke execute on function
  public.refresh_partner_credit(uuid),
  public.record_partner_invoice_paid(uuid, text, bigint),
  public.record_partner_invoice_failed(uuid, text, int, boolean),
  public.attach_redemptions_to_invoice(uuid, text, timestamptz),
  public.redemptions_awaiting_meter(int),
  public.mark_redemptions_metered(uuid[], text[])
from public, anon, authenticated;
