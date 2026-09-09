-- ═══════════════════════════════════════════════════════════════════════════
--  Demo mode — a partner account that trades as if a card were on file
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Walking a restaurant through Loose Leaf for Partners has a hole in the
--  middle of it. Everything past "turn an offer on" is gated on a payment
--  method, so a demonstration either stops at the interesting part or asks
--  the person giving it to hand Stripe a real card before every meeting.
--
--  Demo mode fills that hole with the smallest lie that works: for a flagged
--  business, `partner_has_card()` says yes. Nothing else changes. Offers go
--  live because `partner_can_issue()` is satisfied the ordinary way, passes
--  are issued and redeemed by the ordinary functions, the ledger fills up
--  with ordinary rows at the ordinary $1.50, and the credit meter fills and
--  warns on the ordinary ladder. What is on screen during a demo is the
--  product, not a mock of it — which is the whole point, because a mock is
--  exactly the thing a business would be right not to trust.
--
--  Three places had to be told, and they are the three places where make
--  believe would otherwise turn into money:
--
--    · `redemptions_awaiting_meter()` skips demo partners, so no meter event
--      is ever sent and no invoice line can exist. This is belt and braces —
--      a demo account has no Stripe customer either — but the filter is here
--      so that the guarantee is a stated rule rather than a happy accident
--      of some other condition.
--    · `staff_partner_revenue()` skips them too. Backstage's "earned this
--      month" is Loose Leaf's own books, and pretend dollars do not belong
--      in them.
--    · Turning demo mode back off waives whatever the demo ran up, so the
--      rows cannot come back to life and be billed if that same business
--      later attaches a real card.
--
--  And one guard, which is the reason this is safe to ship: demo mode can
--  only be switched on for a business that has never been through Stripe and
--  has never had a redemption billed. It is a tool for make-believe accounts
--  and it refuses to be pointed at a real one.

alter table partners
  add column if not exists demo_mode boolean not null default false;

comment on column public.partners.demo_mode is
  'Staff-set. The business behaves as though a payment method were on file: '
  'offers run, passes issue and redeem, and billing accrues and displays '
  'normally — but nothing is ever metered to Stripe or counted as Loose Leaf '
  'revenue. Only settable on an account with no Stripe history.';

--  Asked by name in several places below, so the rule lives once.
create or replace function public.partner_is_demo(p_partner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.demo_mode from partners p where p.id = p_partner), false);
$$;

comment on function public.partner_is_demo(uuid) is
  'Is this business a demonstration account? See partners.demo_mode.';


-- ── the one lie ────────────────────────────────────────────────────────────
--
--  Rebased on `20260825120000`, which is where this function was last
--  written. Everything about a partner''s ability to trade flows from
--  `partner_credit_state()`, and `partner_credit_state()` asks this — so
--  answering here, once, is what makes the rest of the platform behave for a
--  demo account without a single other branch anywhere.
create or replace function public.partner_has_card(p_partner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.partner_is_demo(p_partner)
      or exists (
    select 1 from partner_subscriptions s
     where s.partner_id = p_partner
       and s.payment_method_at is not null
       and s.stripe_customer_id is not null
       and coalesce(s.status, '') not in ('incomplete_expired', 'canceled')
  );
$$;

comment on function public.partner_has_card(uuid) is
  'Is there a usable payment method behind this business? True for any '
  'payment method type Stripe accepted — card, bank debit, wallet — and true '
  'for a demonstration account, which has none and is never charged.';


-- ── where make-believe stops ───────────────────────────────────────────────

--  Rebased on `20260824120000`. The added join is the whole change: a demo
--  partner's redemptions are never handed to Stripe, so they cannot become
--  an invoice line, whatever else is true of the account.
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
  join partners p on p.id = r.partner_id
  join partner_subscriptions s on s.partner_id = r.partner_id
  where r.bill_status = 'pending'
    and not p.demo_mode
    and r.fee_cents > 0
    and s.stripe_customer_id is not null
    -- Stripe refuses meter events older than 35 days; anything that old has
    -- fallen through and needs a human, not another retry.
    and r.redeemed_at > now() - interval '30 days'
  order by r.redeemed_at
  limit least(coalesce(p_limit, 500), 1000);
$$;


-- ── what the partner's own dashboard reads ─────────────────────────────────
--
--  Rebased on `20260824120000` with one key added. `demo_mode` is here for
--  the client to decide what it can safely offer to click — a demo account
--  has no Stripe customer, so sending it to the billing portal would be an
--  error in the middle of a demonstration. It is not a label: the dashboard
--  deliberately reads as an ordinary paying partner, because the person being
--  shown it is being shown the product.
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
    'demo_mode',          public.partner_is_demo(p_partner),
    'payment_method',     (select payment_method_brand from partner_subscriptions
                            where partner_id = p_partner),
    'payment_method_type',(select payment_method_type  from partner_subscriptions
                            where partner_id = p_partner),
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


-- ── Loose Leaf's own books ─────────────────────────────────────────────────
--
--  Rebased on `20260824120000`. Every money figure here now excludes demo
--  partners, and so does the exposure ceiling — credit extended to an
--  account that cannot owe anything is not exposure. The account *counts* —
--  `partners_by_status`, `by_tier` and `suspended` are unchanged — because a
--  demo business is still a row somebody has to know about.
--
--  `without_card` needs no change and is worth understanding rather than
--  editing: a demo partner reads as having a card, which is exactly right for
--  a list whose purpose is "who is stuck and needs chasing".
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
      where redeemed_at >= date_trunc('month', now()) and bill_status <> 'waived'
        and not public.partner_is_demo(partner_id)),
    'last_month', (
      select jsonb_build_object(
        'redemptions', count(*),
        'cents', coalesce(sum(fee_cents), 0))
      from date_pass_redemptions
      where redeemed_at >= date_trunc('month', now()) - interval '1 month'
        and redeemed_at <  date_trunc('month', now())
        and bill_status <> 'waived'
        and not public.partner_is_demo(partner_id)),
    'collected_cents', coalesce((
      select sum(fee_cents) from date_pass_redemptions
      where bill_status = 'paid' and not public.partner_is_demo(partner_id)), 0),
    'outstanding_cents', coalesce((
      select sum(fee_cents) from date_pass_redemptions
      where bill_status in ('pending','metered','invoiced')
        and not public.partner_is_demo(partner_id)), 0),
    'at_risk_cents', coalesce((
      select sum(fee_cents) from date_pass_redemptions
      where bill_status = 'failed' and not public.partner_is_demo(partner_id)), 0),
    -- The number worth watching: how much credit is extended in total, i.e.
    -- the theoretical maximum that could be walked away from today.
    'exposure_ceiling_cents', coalesce((
      select sum(public.partner_credit_limit_cents(c.partner_id))
      from partner_credit c
      where public.partner_has_card(c.partner_id)
        and not public.partner_is_demo(c.partner_id)), 0),
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


-- ── the switch ─────────────────────────────────────────────────────────────

--  Dropped rather than replaced: the return type gains a column, and
--  `create or replace` cannot do that.
drop function if exists public.staff_partner_queue(text);

create or replace function public.staff_partner_queue(p_status text default 'pending')
returns table (
  id           uuid,
  name         text,
  category     text,
  status       partner_status,
  description  text,
  website      text,
  phone        text,
  created_at   timestamptz,
  owner_email  text,
  plan_id      text,
  sub_status   text,
  locations    int,
  active_offers int,
  demo_mode    boolean
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.name, p.category, p.status, p.description, p.website, p.phone, p.created_at,
    pu.email, s.plan_id, s.status,
    (select count(*)::int from partner_locations l where l.partner_id = p.id),
    (select count(*)::int from partner_offers o where o.partner_id = p.id and o.status = 'active'),
    p.demo_mode
  from partners p
  left join partner_users pu on pu.id = p.created_by
  left join partner_subscriptions s on s.partner_id = p.id
  where public.is_admin()
    and (p_status = 'all' or p.status::text = p_status)
  order by p.created_at desc;
$$;

--  Turning it on is refused for any business with Stripe history, and
--  turning it off waives what the demonstration ran up.
--
--  Both halves are about the same worry. A flag that pretends a card exists
--  is harmless on an account invented for a meeting and dangerous on one
--  that trades, so the dangerous case is refused rather than documented. And
--  a demo's redemptions sit in the ledger as `pending` like any other; if
--  that business later attached a real card, `redemptions_awaiting_meter()`
--  would find them and bill somebody for scans that never happened. Waiving
--  them on the way out closes that door — `waived` is the status the ledger
--  already has for "real row, no money", and it keeps the line visible in
--  the partner's own list instead of deleting evidence.
create or replace function public.staff_set_partner_demo_mode(
  p_partner uuid,
  p_on      boolean
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_was    boolean;
  v_stripe boolean;
  v_billed int;
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  select demo_mode into v_was from partners where id = p_partner;
  if not found then
    raise exception 'No such business.';
  end if;

  if p_on and not v_was then
    select exists (
      select 1 from partner_subscriptions s
       where s.partner_id = p_partner
         and s.stripe_customer_id is not null
    ) into v_stripe;

    select count(*) into v_billed
      from date_pass_redemptions r
     where r.partner_id = p_partner
       and r.bill_status in ('metered','invoiced','paid','failed');

    if v_stripe or v_billed > 0 then
      raise exception
        'This business has real billing history, so it cannot be put into demo mode. '
        'Demo mode is only for accounts that have never been through Stripe.';
    end if;
  end if;

  update partners set demo_mode = p_on where id = p_partner;

  if v_was and not p_on then
    update date_pass_redemptions
       set bill_status = 'waived'
     where partner_id = p_partner
       and bill_status = 'pending';
  end if;
end;
$$;


grant execute on function
  public.partner_is_demo(uuid),
  public.staff_set_partner_demo_mode(uuid, boolean)
to authenticated;

--  Unchanged in spirit from `20260824120000`: still never granted, still
--  service-role only. Restated because the function was just replaced and a
--  `create or replace` keeps existing grants — but the drop-and-recreate of
--  the queue above is a reminder of how easily that assumption breaks.
revoke execute on function public.redemptions_awaiting_meter(int)
  from public, anon, authenticated;
