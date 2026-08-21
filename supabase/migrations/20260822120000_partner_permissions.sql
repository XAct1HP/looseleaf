-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — what each person on a partner team can actually reach
-- ═══════════════════════════════════════════════════════════════════════════
--
--  The previous migration gave `partner_members` three roles but only two
--  levels of enforcement: `is_partner_admin()` (owner or manager) guarded
--  everything editable, and `is_partner_member()` guarded scanning. In practice
--  that meant a *staff* login could still read the overview, the analytics and
--  the redemption ledger, and a manager could edit the Date Spot and the
--  offers. Neither is what a restaurant wants.
--
--  What a restaurant wants:
--
--    staff    the scanner. That's the job. Nothing else on the screen.
--    manager  the scanner, and the team — they hire and lose people weekly,
--             and the owner should not be the bottleneck for that.
--    owner    everything, plus the ability to hand any *other* page to a
--             manager or to staff when they'd rather not be the one doing it.
--
--  So permission stops being a role and becomes a role *plus a grant*. The
--  grants live in one jsonb column on `partners`, the check lives in
--  `partner_can()`, and every policy and RPC below routes through it. A page
--  the owner has not handed over is unreachable — not hidden in the nav,
--  unreachable, because the database says no.
--
--  Two things are deliberately not grantable:
--
--    settings  is where the grants themselves are edited. Handing it over
--              would let a manager grant themselves billing, which makes the
--              whole mechanism decorative.
--    owner     as a role somebody can be assigned. A manager can add managers
--              and staff; only an owner can make another owner.
-- ═══════════════════════════════════════════════════════════════════════════

--  Defaults chosen so an existing team keeps working the way its owner set it
--  up, and a new one starts narrow.
alter table partners add column if not exists role_pages jsonb not null
  default '{"manager": ["scan", "team"], "staff": ["scan"]}'::jsonb;

comment on column partners.role_pages is
  'Extra dashboard pages granted per role. Owners always see everything; '
  '"settings" is never grantable because it edits this column.';

-- ═══════════════════════════════════════════════════════════════════════════
--  The capability check
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.partner_my_role(p_partner uuid)
returns partner_role
language sql stable security definer set search_path = public as $$
  select role from partner_members
  where partner_id = p_partner and partner_user_id = auth.uid();
$$;

/*
  The one question the whole dashboard asks. Pages are the same strings the
  client routes on, so there is a single vocabulary end to end:

    overview · spot · offers · scan · redemptions · analytics · team · billing

  plus `settings`, which only ever answers true for an owner.
*/
create or replace function public.partner_can(p_partner uuid, p_page text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_role  partner_role;
  v_pages jsonb;
begin
  v_role := public.partner_my_role(p_partner);
  if v_role is null then return false; end if;
  if v_role = 'owner' then return true; end if;

  -- Never grantable, whatever the column says.
  if p_page = 'settings' then return false; end if;

  select coalesce(role_pages -> v_role::text, '[]'::jsonb)
    into v_pages from partners where id = p_partner;

  return v_pages ? p_page;
end;
$$;

--  Everything the caller may reach, for building the nav — and for deciding
--  where to send somebody who lands on the dashboard root.
create or replace function public.partner_my_pages(p_partner uuid)
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(page order by ord), '{}')
  from (
    select page, ord from unnest(array[
      'overview', 'spot', 'offers', 'scan', 'redemptions',
      'analytics', 'team', 'billing', 'settings'
    ]) with ordinality as t(page, ord)
  ) pages
  where public.partner_can(p_partner, page);
$$;

--  Kept, and redefined, because it is referenced from storage policies and
--  from anywhere this migration might have missed: "may edit how this business
--  appears" is exactly the `spot` capability.
create or replace function public.is_partner_admin(p_partner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.partner_can(p_partner, 'spot');
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Rewiring the policies
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "partners: edit your own" on partners;
create policy "partners: edit your own" on partners
  for update to authenticated
  using (public.partner_can(id, 'spot'))
  with check (public.partner_can(id, 'spot'));

drop policy if exists "locations: manage your own" on partner_locations;
create policy "locations: manage your own" on partner_locations
  for all to authenticated
  using (public.partner_can(partner_id, 'spot'))
  with check (public.partner_can(partner_id, 'spot'));

drop policy if exists "spots: partners manage their own" on date_spots;
create policy "spots: partners manage their own" on date_spots
  for all to authenticated
  using (partner_id is not null and public.partner_can(partner_id, 'spot'))
  with check (partner_id is not null and public.partner_can(partner_id, 'spot'));

drop policy if exists "offers: manage your own" on partner_offers;
create policy "offers: manage your own" on partner_offers
  for all to authenticated
  using (public.partner_can(partner_id, 'offers'))
  with check (public.partner_can(partner_id, 'offers'));

/*
  Offers were readable by two groups who shouldn't have had the whole row.

  A *staff* login could read their employer's caps, terms and margins, because
  the read arm was `is_partner_member`. Nothing needs that — the scanner gets
  the offer title and terms from partner_lookup_pass(), which is security
  definer and hands back four columns.

  And every signed-in *student* could read the whole row too, because the
  public arm was on the table. RLS is row-level, so "students may see this
  offer" also meant "students may see its monthly cap". A restaurant's limits
  are its own business.

  So the table becomes private to the people who manage it, and the public
  half moves to a view with a hand-written column list. The view runs with its
  owner's rights, which is what lets it reach past the tightened policy — and
  is exactly why its WHERE clause repeats the live-and-paid checks.
*/
drop policy if exists "offers: yours, or a live one" on partner_offers;
create policy "offers: the people who manage them" on partner_offers
  for select to authenticated
  using (public.partner_can(partner_id, 'offers') or public.is_admin());

create or replace view public.public_offers as
  select
    o.id, o.partner_id, o.title, o.offer_type, o.percent_off,
    o.amount_off_cents, o.min_spend_cents, o.free_item, o.description,
    o.terms, o.days_of_week, o.start_time, o.end_time
  from public.partner_offers o
  where o.status = 'active'
    and public.partner_is_live(o.partner_id)
    and public.partner_has(o.partner_id, 'offers');

grant select on public.public_offers to authenticated;

--  Billing state is a page, not a role. An owner who hands billing to their
--  manager expects that manager to see the renewal date.
drop policy if exists "subscriptions: read your own" on partner_subscriptions;
create policy "subscriptions: read your own" on partner_subscriptions
  for select to authenticated
  using (public.partner_can(partner_id, 'billing') or public.is_admin());

drop policy if exists "redemptions: the business that earned it" on date_pass_redemptions;
create policy "redemptions: the business that earned it" on date_pass_redemptions
  for select to authenticated
  using (public.partner_can(partner_id, 'redemptions') or public.is_admin());

drop policy if exists "targeting: manage yours" on partner_targeting;
create policy "targeting: manage yours" on partner_targeting
  for all to authenticated
  using (public.partner_can(partner_id, 'settings') and public.partner_has(partner_id, 'targeting'))
  with check (public.partner_can(partner_id, 'settings') and public.partner_has(partner_id, 'targeting'));

drop policy if exists "targeting: yours" on partner_targeting;
create policy "targeting: yours" on partner_targeting
  for select to authenticated
  using (public.partner_can(partner_id, 'settings') or public.is_admin());

drop policy if exists "invites: your own team" on partner_invites;
create policy "invites: your own team" on partner_invites
  for select to authenticated
  using (public.partner_can(partner_id, 'team') or public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
--  Rewiring the functions
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.partner_overview(p_partner uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_month timestamptz := date_trunc('month', now());
  v_out   jsonb;
begin
  if not public.partner_can(p_partner, 'overview') then
    raise exception 'Not authorised';
  end if;

  select jsonb_build_object(
    'dates_this_month',  (select count(*) from date_pass_redemptions r
                           where r.partner_id = p_partner and r.redeemed_at >= v_month),
    'spot_views',        (select count(*) from partner_events e
                           where e.partner_id = p_partner and e.stage = 'spot_view'
                             and e.occurred_at >= v_month),
    'recommendations',   (select count(*) from partner_events e
                           where e.partner_id = p_partner and e.stage = 'recommendation'
                             and e.occurred_at >= v_month),
    'offer_unlocks',     (select count(*) from partner_events e
                           where e.partner_id = p_partner and e.stage = 'offer_unlock'
                             and e.occurred_at >= v_month),
    'verified_dates',    (select count(*) from partner_events e
                           where e.partner_id = p_partner and e.stage = 'verified_date'
                             and e.occurred_at >= v_month),
    'today',             (select count(*) from date_pass_redemptions r
                           where r.partner_id = p_partner
                             and r.redeemed_at >= date_trunc('day', now())),
    'this_week',         (select count(*) from date_pass_redemptions r
                           where r.partner_id = p_partner
                             and r.redeemed_at >= date_trunc('week', now())),
    'recent',            coalesce((
                           select jsonb_agg(x) from (
                             select date_trunc('day', r.redeemed_at)::date as day,
                                    count(*) as redemptions
                             from date_pass_redemptions r
                             where r.partner_id = p_partner
                               and r.redeemed_at >= now() - interval '7 days'
                             group by 1 order by 1 desc
                           ) x), '[]'::jsonb),
    'active_offers',     coalesce((
                           select jsonb_agg(jsonb_build_object(
                             'id', o.id, 'title', o.title, 'status', o.status,
                             'days', public.days_label(o.days_of_week),
                             'monthly_cap', o.max_monthly_redemptions,
                             'used_this_month', (select this_month from public.offer_usage(o.id))
                           ) order by o.created_at desc)
                           from partner_offers o
                           where o.partner_id = p_partner and o.status = 'active'
                         ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

create or replace function public.partner_funnel(p_partner uuid, p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 400)));
  v_views bigint; v_recs bigint; v_unlocks bigint; v_dates bigint;
begin
  if not public.partner_can(p_partner, 'analytics') then
    raise exception 'Not authorised';
  end if;

  select
    count(*) filter (where stage = 'spot_view'),
    count(*) filter (where stage = 'recommendation'),
    count(*) filter (where stage = 'offer_unlock'),
    count(*) filter (where stage = 'verified_date')
  into v_views, v_recs, v_unlocks, v_dates
  from partner_events
  where partner_id = p_partner and occurred_at >= v_since;

  return jsonb_build_object(
    'days', p_days,
    'spot_views', v_views,
    'recommendations', v_recs,
    'offer_unlocks', v_unlocks,
    'verified_dates', v_dates,
    'unlock_to_date', case when v_unlocks = 0 then null
                           else round(100.0 * v_dates / v_unlocks, 1) end,
    'rec_to_unlock',  case when v_recs = 0 then null
                           else round(100.0 * v_unlocks / v_recs, 1) end,
    'by_day', coalesce((
      select jsonb_agg(x order by x.day) from (
        select occurred_at::date as day,
               count(*) filter (where stage = 'spot_view')     as spot_views,
               count(*) filter (where stage = 'recommendation') as recommendations,
               count(*) filter (where stage = 'offer_unlock')   as offer_unlocks,
               count(*) filter (where stage = 'verified_date')  as verified_dates
        from partner_events
        where partner_id = p_partner and occurred_at >= v_since
        group by 1
      ) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.partner_redemptions(
  p_partner uuid,
  p_limit   int default 50,
  p_offset  int default 0
)
returns table (
  id          uuid,
  redeemed_at timestamptz,
  offer_title text,
  pass_ref    text,
  amount_cents int,
  location    text
)
language sql stable security definer set search_path = public as $$
  select
    r.id, r.redeemed_at, o.title,
    right(dp.code, 4),
    r.amount_cents,
    coalesce(l.label, l.address_line)
  from date_pass_redemptions r
  join partner_offers o on o.id = r.offer_id
  join date_passes dp on dp.id = r.pass_id
  left join partner_locations l on l.id = r.partner_location_id
  where r.partner_id = p_partner
    and public.partner_can(p_partner, 'redemptions')
  order by r.redeemed_at desc
  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$$;

create or replace function public.save_date_spot(
  p_location_id uuid,
  p_patch       jsonb
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_partner uuid;
  v_campus  uuid;
  v_spot    uuid;
  v_name    text;
begin
  select l.partner_id, l.university_id into v_partner, v_campus
  from partner_locations l where l.id = p_location_id;

  if v_partner is null then
    raise exception 'No such location.';
  end if;
  if not public.partner_can(v_partner, 'spot') then
    raise exception 'Not authorised';
  end if;

  select p.name into v_name from partners p where p.id = v_partner;
  select id into v_spot from date_spots where partner_location_id = p_location_id;

  if v_spot is null then
    insert into date_spots (
      university_id, name, kind, partner_id, partner_location_id, is_published
    )
    values (v_campus, v_name, coalesce(p_patch ->> 'kind', 'Date spot'), v_partner, p_location_id, false)
    returning id into v_spot;
  end if;

  update date_spots d set
    university_id  = v_campus,
    partner_id     = v_partner,
    name           = coalesce(nullif(p_patch ->> 'name', ''), v_name),
    kind           = coalesce(nullif(p_patch ->> 'kind', ''), d.kind),
    note           = coalesce(p_patch ->> 'note', d.note),
    tags           = coalesce(
                       (select array_agg(value::text) from jsonb_array_elements_text(p_patch -> 'tags')),
                       d.tags),
    date_types     = coalesce(
                       (select array_agg(value::text) from jsonb_array_elements_text(p_patch -> 'date_types')),
                       d.date_types),
    vibes          = coalesce(
                       (select array_agg(value::text) from jsonb_array_elements_text(p_patch -> 'vibes')),
                       d.vibes),
    gallery_paths  = coalesce(
                       (select array_agg(value::text) from jsonb_array_elements_text(p_patch -> 'gallery_paths')),
                       d.gallery_paths),
    price_level    = coalesce((p_patch ->> 'price_level')::int, d.price_level),
    walk_minutes   = coalesce((p_patch ->> 'walk_minutes')::int, d.walk_minutes),
    distance_miles = coalesce((p_patch ->> 'distance_miles')::numeric, d.distance_miles),
    latitude       = coalesce((p_patch ->> 'latitude')::numeric, d.latitude),
    longitude      = coalesce((p_patch ->> 'longitude')::numeric, d.longitude),
    address_line   = coalesce(p_patch ->> 'address_line', d.address_line),
    website        = coalesce(p_patch ->> 'website', d.website),
    phone          = coalesce(p_patch ->> 'phone', d.phone),
    hours          = coalesce(p_patch -> 'hours', d.hours),
    logo_path      = coalesce(p_patch ->> 'logo_path', d.logo_path),
    cover_path     = coalesce(p_patch ->> 'cover_path', d.cover_path),
    indoor_outdoor = coalesce(p_patch ->> 'indoor_outdoor', d.indoor_outdoor),
    reservations   = coalesce(p_patch ->> 'reservations', d.reservations),
    min_age        = coalesce((p_patch ->> 'min_age')::int, d.min_age),
    is_published   = coalesce((p_patch ->> 'is_published')::boolean, d.is_published)
  where d.id = v_spot;

  return v_spot;
end;
$$;

--  Scanning is the staff capability. Nothing else on this page is.
create or replace function public.partner_lookup_pass(p_partner uuid, p_code text)
returns table (
  valid         boolean,
  reason        text,
  offer_title   text,
  offer_summary text,
  offer_terms   text,
  status        pass_status,
  expires_at    timestamptz,
  redeemed_at   timestamptz,
  multi_use     boolean
)
language plpgsql security definer set search_path = public as $$
declare
  dp date_passes%rowtype;
  o  partner_offers%rowtype;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9-]', '', 'g'));
begin
  if not public.partner_can(p_partner, 'scan') then
    raise exception 'Not authorised';
  end if;
  if not public.partner_has(p_partner, 'redemption') then
    raise exception 'Date Passes are not part of this plan.';
  end if;

  if v_code <> '' and left(v_code, 3) <> 'LL-' then v_code := 'LL-' || v_code; end if;

  select * into dp from date_passes where code = v_code;

  if not found or dp.partner_id <> p_partner then
    return query select false, 'We don''t recognise that code.',
      null::text, null::text, null::text, null::pass_status,
      null::timestamptz, null::timestamptz, false;
    return;
  end if;

  update date_passes set lookup_attempts = lookup_attempts + 1 where id = dp.id;

  select * into o from partner_offers where id = dp.offer_id;

  return query select
    case
      when dp.status = 'void' then false
      when dp.status = 'redeemed' and not o.multi_use then false
      when dp.expires_at < now() then false
      when not public.offer_is_open(o.id, now()) then false
      else true
    end,
    case
      when dp.status = 'void' then 'This pass was cancelled.'
      when dp.status = 'redeemed' and not o.multi_use then 'Already used.'
      when dp.expires_at < now() then 'This pass has expired.'
      when not public.offer_is_open(o.id, now()) then 'This offer isn''t running right now.'
      else null
    end,
    o.title,
    case o.offer_type
      when 'percent_off' then o.percent_off || '% off'
      when 'amount_off'  then '$' || (o.amount_off_cents / 100.0)::numeric(10,2) || ' off'
      when 'free_item'   then 'Free ' || coalesce(o.free_item, 'treat')
      when 'bogo'        then 'Buy one, get one'
      else coalesce(o.description, o.title)
    end,
    o.terms,
    dp.status, dp.expires_at, dp.redeemed_at, o.multi_use;
end;
$$;

create or replace function public.redeem_date_pass(
  p_partner uuid,
  p_code    text,
  p_amount_cents int default null
)
returns table (ok boolean, reason text, redeemed_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  dp date_passes%rowtype;
  o  partner_offers%rowtype;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9-]', '', 'g'));
  v_when timestamptz := now();
begin
  if not public.partner_can(p_partner, 'scan') then
    raise exception 'Not authorised';
  end if;
  if not public.partner_has(p_partner, 'redemption') then
    raise exception 'Date Passes are not part of this plan.';
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
    (pass_id, partner_id, offer_id, partner_location_id, redeemed_by, redeemed_at, amount_cents)
  values
    (dp.id, p_partner, o.id, dp.partner_location_id, auth.uid(), v_when, p_amount_cents);

  update date_passes
     set status = 'redeemed', redeemed_at = v_when
   where id = dp.id;

  insert into partner_events (partner_id, offer_id, stage)
  values (p_partner, o.id, 'verified_date');

  return query select true, null::text, v_when;
end;
$$;

-- ─── the team, and who may hand out which role ────────────────────────────

create or replace function public.partner_team(p_partner uuid)
returns table (
  partner_user_id uuid,
  full_name       text,
  email           text,
  role            partner_role,
  joined_at       timestamptz,
  is_you          boolean
)
language sql stable security definer set search_path = public as $$
  select
    m.partner_user_id, u.full_name, u.email, m.role, m.created_at,
    m.partner_user_id = auth.uid()
  from partner_members m
  join partner_users u on u.id = m.partner_user_id
  where m.partner_id = p_partner
    and public.partner_can(p_partner, 'team')
  order by
    case m.role when 'owner' then 0 when 'manager' then 1 else 2 end,
    u.full_name;
$$;

create or replace function public.partner_pending_invites(p_partner uuid)
returns table (
  id         uuid,
  email      text,
  role       partner_role,
  created_at timestamptz,
  expires_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select i.id, i.email, i.role, i.created_at, i.expires_at
  from partner_invites i
  where i.partner_id = p_partner
    and i.accepted_at is null
    and i.expires_at > now()
    and public.partner_can(p_partner, 'team')
  order by i.created_at desc;
$$;

create or replace function public.invite_partner_member(
  p_partner uuid,
  p_email   text,
  p_role    partner_role default 'staff'
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_id    uuid;
begin
  if not public.partner_can(p_partner, 'team') then
    raise exception 'You can''t add people to this business.';
  end if;

  -- A manager runs the floor, so they hire and lose staff. They cannot mint
  -- somebody who could then remove them, or change the card on file.
  if p_role = 'owner' and public.partner_my_role(p_partner) <> 'owner' then
    raise exception 'Only an owner can make somebody else an owner.';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That doesn''t look like an email address.';
  end if;

  if exists (
    select 1 from partner_members m
    join partner_users u on u.id = m.partner_user_id
    where m.partner_id = p_partner and u.email = v_email
  ) then
    raise exception 'They''re already on your team.';
  end if;

  if exists (
    select 1 from auth.users au join profiles p on p.id = au.id
    where lower(au.email) = v_email
  ) then
    raise exception 'That address is already a Loose Leaf member account.';
  end if;

  insert into partner_invites (partner_id, email, role, invited_by)
  values (p_partner, v_email, p_role, auth.uid())
  on conflict (partner_id, email) where accepted_at is null
    do update set role = excluded.role,
                  invited_by = excluded.invited_by,
                  created_at = now(),
                  expires_at = now() + interval '14 days'
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.revoke_partner_invite(p_invite uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_partner uuid; v_role partner_role;
begin
  select partner_id, role into v_partner, v_role from partner_invites where id = p_invite;
  if v_partner is null then return; end if;
  if not public.partner_can(v_partner, 'team') then
    raise exception 'Not authorised';
  end if;
  if v_role = 'owner' and public.partner_my_role(v_partner) <> 'owner' then
    raise exception 'Only an owner can withdraw an owner invitation.';
  end if;
  delete from partner_invites where id = p_invite and accepted_at is null;
end;
$$;

create or replace function public.set_partner_member_role(
  p_partner uuid,
  p_user    uuid,
  p_role    partner_role
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owners  int;
  v_me      partner_role := public.partner_my_role(p_partner);
  v_target  partner_role;
begin
  if not public.partner_can(p_partner, 'team') then
    raise exception 'Not authorised';
  end if;

  select role into v_target from partner_members
   where partner_id = p_partner and partner_user_id = p_user;
  if v_target is null then return; end if;

  -- A manager may move people between manager and staff. Owners are above
  -- their pay grade in both directions.
  if v_me <> 'owner' and (p_role = 'owner' or v_target = 'owner') then
    raise exception 'Only an owner can change an owner.';
  end if;

  select count(*) into v_owners
  from partner_members where partner_id = p_partner and role = 'owner';

  if v_owners <= 1 and p_role <> 'owner' and v_target = 'owner' then
    raise exception 'Make somebody else an owner first — a business needs one.';
  end if;

  update partner_members set role = p_role
   where partner_id = p_partner and partner_user_id = p_user;
end;
$$;

create or replace function public.remove_partner_member(p_partner uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owners int;
  v_me     partner_role := public.partner_my_role(p_partner);
  v_target partner_role;
begin
  select role into v_target from partner_members
   where partner_id = p_partner and partner_user_id = p_user;
  if v_target is null then return; end if;

  -- Leaving on your own is always allowed; removing anybody else needs the
  -- team page, and removing an owner needs to be an owner.
  if p_user <> auth.uid() then
    if not public.partner_can(p_partner, 'team') then
      raise exception 'Only an owner or a manager can remove people.';
    end if;
    if v_target = 'owner' and v_me <> 'owner' then
      raise exception 'Only an owner can remove an owner.';
    end if;
  end if;

  select count(*) into v_owners
  from partner_members where partner_id = p_partner and role = 'owner';

  if v_owners <= 1 and v_target = 'owner' then
    raise exception 'Make somebody else an owner first — a business needs one.';
  end if;

  delete from partner_members
   where partner_id = p_partner and partner_user_id = p_user;
end;
$$;

-- ─── editing the grants ───────────────────────────────────────────────────

/*
  Owner-only, and it refuses to grant `settings` — otherwise a manager handed
  the settings page could grant themselves billing, and the whole mechanism
  would be a suggestion rather than a control.
*/
create or replace function public.set_partner_role_pages(
  p_partner uuid,
  p_role    partner_role,
  p_pages   text[]
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array['overview','spot','offers','scan','redemptions','analytics','team','billing'];
  v_clean   text[];
  v_out     jsonb;
begin
  if public.partner_my_role(p_partner) <> 'owner' then
    raise exception 'Only an owner can change what the team can see.';
  end if;
  if p_role = 'owner' then
    raise exception 'Owners already see everything.';
  end if;

  select coalesce(array_agg(distinct p), '{}') into v_clean
  from unnest(coalesce(p_pages, '{}')) p
  where p = any (v_allowed);

  update partners
     set role_pages = jsonb_set(
           coalesce(role_pages, '{}'::jsonb),
           array[p_role::text],
           to_jsonb(v_clean)
         )
   where id = p_partner
  returning role_pages into v_out;

  return v_out;
end;
$$;

-- ─── my_partners now says what this person can reach ──────────────────────
--  Two new output columns, which Postgres won't let `create or replace` add to
--  an existing `returns table`. Dropped first, and nothing depends on it but
--  the client.

drop function if exists public.my_partners();

create or replace function public.my_partners()
returns table (
  id            uuid,
  name          text,
  slug          text,
  category      text,
  status        partner_status,
  review_note   text,
  role          partner_role,
  pages         text[],
  role_pages    jsonb,
  plan_id       text,
  plan_name     text,
  sub_status    text,
  period_end    timestamptz,
  cancel_at_end boolean,
  entitlements  jsonb,
  logo_path     text,
  is_live       boolean
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.name, p.slug, p.category, p.status, p.review_note,
    m.role,
    public.partner_my_pages(p.id),
    -- Only an owner has any use for the grid, and only an owner may change it.
    case when m.role = 'owner' then p.role_pages else null end,
    s.plan_id, pl.name, s.status, s.current_period_end,
    coalesce(s.cancel_at_period_end, false),
    public.partner_entitlements(p.id),
    p.logo_path,
    public.partner_is_live(p.id)
  from partner_members m
  join partners p on p.id = m.partner_id
  left join partner_subscriptions s on s.partner_id = p.id
  left join partner_plans pl on pl.id = s.plan_id
  where m.partner_user_id = auth.uid()
  order by p.created_at;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Where a place actually is
-- ═══════════════════════════════════════════════════════════════════════════
--
--  A business address, geocoded once when the partner saves it, so the Date
--  Spot can show a map and hand somebody directions. Still no user location
--  anywhere — this is a shopfront on a map, not a person.

alter table partner_locations add column if not exists latitude  numeric(9, 6);
alter table partner_locations add column if not exists longitude numeric(9, 6);
alter table date_spots        add column if not exists latitude  numeric(9, 6);
alter table date_spots        add column if not exists longitude numeric(9, 6);

do $$ begin
  alter table partner_locations add constraint partner_locations_latlng_check
    check ((latitude is null) = (longitude is null)
           and (latitude is null or (latitude between -90 and 90 and longitude between -180 and 180)));
exception when duplicate_object then null; end $$;

grant execute on function
  public.partner_can(uuid, text),
  public.partner_my_role(uuid),
  public.partner_my_pages(uuid),
  public.set_partner_role_pages(uuid, partner_role, text[])
to authenticated;
