-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — Loose Leaf for Partners: the callable surface
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Everything a partner or a student can *do* with the partner platform is a
--  function in this file, because three of the rules in the brief are only
--  really rules if the database enforces them:
--
--   · "Do not trust client-side state for offer redemption."
--     redeem_date_pass() takes a row lock, re-checks every limit, and writes
--     the redemption in one transaction. The scanner UI is a viewfinder.
--
--   · "Relevance comes before payment."
--     recommend_date_spots() gives a matching date type 34 points and a paid
--     placement at most 10. A business therefore cannot buy its way past a
--     place that actually fits — the arithmetic makes it impossible rather
--     than the policy asking nicely. There is a test for this.
--
--   · "Businesses receive attribution, not dating data."
--     Every partner-facing read here is security definer and hand-writes its
--     select list. Nothing returns a profile id, a name, or a conversation.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
--  Small shared helpers
-- ═══════════════════════════════════════════════════════════════════════════

--  "Sunday–Thursday" rather than "{0,1,2,3,4}". Used on offer cards, the Date
--  Pass, and the dashboard, so the phrasing is identical in all three.
create or replace function public.days_label(p_days int[])
returns text
language plpgsql immutable as $$
declare
  full_names text[] := array['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  sorted int[];
  runs text[] := '{}';
  i int; start_i int; prev int;
begin
  if p_days is null or cardinality(p_days) = 0 then return 'Any day'; end if;
  if cardinality(p_days) = 7 then return 'Any day'; end if;

  select array_agg(x order by x) into sorted from unnest(p_days) x;

  start_i := sorted[1]; prev := sorted[1];
  for i in 2..cardinality(sorted) loop
    if sorted[i] <> prev + 1 then
      runs := runs || (case when start_i = prev then full_names[start_i + 1]
                           else full_names[start_i + 1] || '–' || full_names[prev + 1] end);
      start_i := sorted[i];
    end if;
    prev := sorted[i];
  end loop;
  runs := runs || (case when start_i = prev then full_names[start_i + 1]
                        else full_names[start_i + 1] || '–' || full_names[prev + 1] end);

  return array_to_string(runs, ', ');
end;
$$;

--  Open right now, from the hours blob. Unknown hours count as open rather
--  than closed, so a partner who hasn't filled them in isn't silently buried.
create or replace function public.spot_is_open(p_spot uuid, p_at timestamptz default now())
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_hours jsonb;
  v_day   text := lower(to_char(p_at, 'dy'));
  v_now   time := p_at::time;
  v_win   jsonb;
begin
  select hours into v_hours from date_spots where id = p_spot;
  if v_hours is null or v_hours = '{}'::jsonb or not (v_hours ? v_day) then
    return true;
  end if;

  for v_win in select * from jsonb_array_elements(v_hours -> v_day) loop
    if (v_win ->> 0)::time <= v_now and v_now <= (v_win ->> 1)::time then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Registration and ownership
-- ═══════════════════════════════════════════════════════════════════════════

--  Creates the business and makes the caller its owner, in one step, so a
--  partner row can never exist without somebody responsible for it.
create or replace function public.register_partner(
  p_full_name text,
  p_name      text,
  p_category  text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text := public.jwt_email();
  v_partner uuid;
  v_slug    text;
begin
  if v_uid is null then
    raise exception 'Not signed in.';
  end if;

  if exists (select 1 from profiles where id = v_uid) then
    raise exception 'This is a Loose Leaf member account. Partners sign up separately.';
  end if;

  insert into partner_users (id, email, full_name)
  values (v_uid, coalesce(v_email, ''), trim(p_full_name))
  on conflict (id) do update set full_name = excluded.full_name, updated_at = now();

  -- A readable, stable slug, deduplicated with a short suffix rather than a
  -- counter query that would race.
  v_slug := regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'partner'; end if;
  if exists (select 1 from partners where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5);
  end if;

  insert into partners (name, slug, category, status, created_by)
  values (trim(p_name), v_slug, p_category, 'draft', v_uid)
  returning id into v_partner;

  insert into partner_members (partner_id, partner_user_id, role)
  values (v_partner, v_uid, 'owner');

  insert into partner_targeting (partner_id) values (v_partner)
  on conflict (partner_id) do nothing;

  return v_partner;
end;
$$;

--  Everything the dashboard needs to boot: which businesses this person can
--  act for, what each one's status is, and what its plan unlocks.
create or replace function public.my_partners()
returns table (
  id            uuid,
  name          text,
  slug          text,
  category      text,
  status        partner_status,
  review_note   text,
  role          partner_role,
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
--  Publishing a Date Spot
-- ═══════════════════════════════════════════════════════════════════════════
--
--  A location and the card students see are kept in sync through one call, so
--  the campus on the card always matches the campus of the address and a
--  partner can never publish a spot attributed to a business they don't own.

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
  if not public.is_partner_admin(v_partner) then
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

-- ═══════════════════════════════════════════════════════════════════════════
--  Offers
-- ═══════════════════════════════════════════════════════════════════════════

--  How many times an offer has been taken, over the windows a business set
--  limits on. Counting redemptions rather than issued passes on purpose: an
--  unlocked pass that nobody walked in with cost the restaurant nothing.
create or replace function public.offer_usage(p_offer uuid)
returns table (total bigint, this_month bigint, today bigint)
language sql stable security definer set search_path = public as $$
  select
    count(*),
    count(*) filter (where r.redeemed_at >= date_trunc('month', now())),
    count(*) filter (where r.redeemed_at >= date_trunc('day', now()))
  from date_pass_redemptions r
  where r.offer_id = p_offer;
$$;

--  Is this offer takeable right now? One place, used by the recommender, the
--  unlock path, and the scanner, so they can never disagree.
create or replace function public.offer_is_open(p_offer uuid, p_at timestamptz default now())
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  o partner_offers%rowtype;
  u record;
  v_local time := p_at::time;
  v_dow   int  := extract(dow from p_at)::int;
begin
  select * into o from partner_offers where id = p_offer;
  if not found or o.status <> 'active' then return false; end if;
  if not public.partner_is_live(o.partner_id) then return false; end if;
  if not public.partner_has(o.partner_id, 'offers') then return false; end if;

  if o.starts_on is not null and p_at::date < o.starts_on then return false; end if;
  if o.ends_on   is not null and p_at::date > o.ends_on   then return false; end if;
  if not (v_dow = any (o.days_of_week)) then return false; end if;

  if o.start_time is not null and o.end_time is not null then
    if o.start_time <= o.end_time then
      if v_local < o.start_time or v_local > o.end_time then return false; end if;
    else
      -- window crosses midnight, e.g. 21:00–02:00
      if v_local < o.start_time and v_local > o.end_time then return false; end if;
    end if;
  end if;

  select * into u from public.offer_usage(p_offer);
  if o.max_total_redemptions   is not null and u.total      >= o.max_total_redemptions   then return false; end if;
  if o.max_monthly_redemptions is not null and u.this_month >= o.max_monthly_redemptions then return false; end if;
  if o.max_daily_redemptions   is not null and u.today      >= o.max_daily_redemptions   then return false; end if;

  return true;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  The recommender
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Read the weights before changing them. A matching date type is worth 34.
--  Everything a partner can buy — featured placement, a live offer, priority
--  eligibility — is worth at most 10, combined. That gap is the product
--  promise made arithmetic: a paid spot that doesn't fit what someone asked
--  for cannot outrank a free one that does, no matter what the partner pays.
--
--  Below RELEVANCE_FLOOR a spot is not returned at all, so "eligible" never
--  degrades into "shown anyway".

create or replace function public.recommend_date_spots(
  p_date_type      text default null,
  p_vibes          text[] default '{}',
  p_max_price      int default null,
  p_max_walk       int default null,
  p_at             timestamptz default now(),
  p_conversation   uuid default null,
  p_surface        text default 'planner',
  p_limit          int default 6
)
returns table (
  spot_id       uuid,
  name          text,
  kind          text,
  note          text,
  tags          text[],
  date_types    text[],
  vibes         text[],
  price_level   int,
  walk_minutes  int,
  distance_miles numeric,
  cover_path    text,
  logo_path     text,
  address_line  text,
  is_partner    boolean,
  partner_id    uuid,
  offer_id      uuid,
  offer_title   text,
  offer_summary text,
  fit           int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me        uuid := auth.uid();
  v_campus    uuid;
  v_other     uuid;
  v_interests text[];
  -- Weights. See the note above before touching these.
  k_type      int := 34;   -- asked for coffee, serves coffee
  k_vibe_each int := 6;    -- per shared vibe
  k_vibe_cap  int := 18;
  k_price     int := 14;
  k_walk      int := 16;
  k_open      int := 8;
  k_interest  int := 10;
  k_partner_cap int := 10; -- the entire ceiling on what money moves
  k_floor     int := 24;   -- below this, not shown at all
begin
  select university_id into v_campus from profiles where id = v_me;
  if v_campus is null then return; end if;

  -- Both people's interests, used only to score *places*. Nothing about
  -- either person leaves this function.
  if p_conversation is not null then
    select case when c.profile_a = v_me then c.profile_b else c.profile_a end
      into v_other
    from conversations cv
    join matches c on c.id = cv.match_id
    where cv.id = p_conversation
      and (c.profile_a = v_me or c.profile_b = v_me);
  end if;

  select coalesce(array_agg(distinct pi.interest_id), '{}')
    into v_interests
  from profile_interests pi
  where pi.profile_id = v_me or (v_other is not null and pi.profile_id = v_other);

  return query
  with live_offer as (
    select distinct on (o.partner_id)
      o.partner_id, o.id, o.title,
      case o.offer_type
        when 'percent_off'     then o.percent_off || '% off your date'
        when 'amount_off'      then '$' || (o.amount_off_cents / 100.0)::numeric(10,2) || ' off'
        when 'free_item'       then 'Free ' || coalesce(o.free_item, 'treat')
        when 'bogo'            then 'Buy one, get one'
        when 'spend_threshold' then '$' || (o.amount_off_cents / 100.0)::numeric(10,2)
                                     || ' off $' || (o.min_spend_cents / 100.0)::numeric(10,2) || '+'
        else coalesce(o.description, o.title)
      end as summary
    from partner_offers o
    where o.status = 'active'
      and public.offer_is_open(o.id, p_at)
    order by o.partner_id, o.created_at desc
  ),
  scored as (
    select
      d.id, d.name, d.kind, d.note, d.tags, d.date_types, d.vibes,
      d.price_level, d.walk_minutes, d.distance_miles,
      d.cover_path, d.logo_path, d.address_line,
      d.partner_id,
      lo.id as offer_id, lo.title as offer_title, lo.summary as offer_summary,

      -- relevance
      (case when p_date_type is null then k_type / 2
            when p_date_type = any (d.date_types) then k_type
            else 0 end)
      + least(k_vibe_cap,
              k_vibe_each * coalesce(cardinality(array(
                select unnest(d.vibes) intersect select unnest(p_vibes))), 0))
      + (case when p_max_price is null or d.price_level is null then k_price / 2
              when d.price_level <= p_max_price then k_price
              when d.price_level = p_max_price + 1 then k_price / 2
              else 0 end)
      + (case when d.walk_minutes is null then k_walk / 2
              when d.walk_minutes <= 5  then k_walk
              when d.walk_minutes <= 10 then k_walk - 4
              when d.walk_minutes <= 15 then k_walk - 8
              when d.walk_minutes <= 25 then k_walk - 12
              else 0 end)
      + (case when p_max_walk is null or d.walk_minutes is null then 0
              when d.walk_minutes <= p_max_walk then 0 else -k_walk end)
      + (case when public.spot_is_open(d.id, p_at) then k_open else 0 end)
      + least(k_interest,
              2 * coalesce(cardinality(array(
                select unnest(d.date_types || d.vibes)
                intersect select unnest(v_interests))), 0))
        as relevance,

      -- the entire commercial contribution, capped
      least(k_partner_cap,
            (case when d.partner_id is not null
                   and public.partner_has(d.partner_id, 'featured_placement') then 6 else 0 end)
          + (case when lo.id is not null then 4 else 0 end))
        as boost
    from date_spots d
    left join live_offer lo
      on lo.partner_id = d.partner_id and d.partner_id is not null
    left join partner_targeting t
      on t.partner_id = d.partner_id
    where d.university_id = v_campus
      and d.is_published
      -- Asked for coffee, get coffee. This is a filter and not a weight on
      -- purpose: it is the line that makes "a business cannot buy its way
      -- into a conversation it doesn't belong in" true absolutely rather
      -- than true by arithmetic. Callers wanting a wider net pass null,
      -- which is what "Surprise us" does.
      and (p_date_type is null or p_date_type = any (d.date_types))
      and (
        d.partner_id is null
        or (
          public.partner_is_live(d.partner_id)
          and public.partner_has(d.partner_id, 'discovery')
          -- chat and planner surfaces need the recommendation entitlement;
          -- the spots directory only needs discovery.
          and (p_surface in ('discovery', 'homepage')
               or public.partner_has(d.partner_id, 'recommendations'))
          and (p_surface <> 'chat'
               or public.partner_has(d.partner_id, 'chat_recommendations'))
          -- a partner's own narrowing, honoured as an exclusion only
          and coalesce(t.is_paused, false) = false
          and (t.date_types is null or cardinality(t.date_types) = 0
               or p_date_type is null or p_date_type = any (t.date_types))
          and (t.price_levels is null or cardinality(t.price_levels) = 0
               or d.price_level is null or d.price_level = any (t.price_levels))
          and (t.days_of_week is null or cardinality(t.days_of_week) = 0
               or extract(dow from p_at)::int = any (t.days_of_week))
        )
      )
      -- don't suggest the same place into the same conversation twice, and
      -- never re-suggest something this person waved away
      and not exists (
        select 1 from recommendation_events re
        where re.date_spot_id = d.id
          and re.viewer = v_me
          and (
            re.outcome = 'dismissed'
            or (p_conversation is not null
                and re.conversation_id = p_conversation
                and re.created_at > now() - interval '7 days')
          )
      )
  )
  select
    s.id, s.name, s.kind, s.note, s.tags, s.date_types, s.vibes,
    s.price_level, s.walk_minutes, s.distance_miles,
    s.cover_path, s.logo_path, s.address_line,
    s.partner_id is not null,
    s.partner_id, s.offer_id, s.offer_title, s.offer_summary,
    -- The fit percentage is scored against what could actually have been
    -- earned *for this request*. Asking "surprise us" makes the date-type and
    -- vibe points unreachable, and dividing by a ceiling nobody could hit
    -- would stamp a confident suggestion with "49% fit".
    least(99, greatest(1, ((s.relevance + s.boost) * 100) / greatest(1,
        (case when p_date_type is null then k_type / 2 else k_type end)
      + (case when coalesce(cardinality(p_vibes), 0) = 0 then 0 else k_vibe_cap end)
      + (case when p_max_price is null then k_price / 2 else k_price end)
      + k_walk + k_open + (k_interest / 2) + k_partner_cap)))::int
  from scored s
  where s.relevance >= k_floor
  order by (s.relevance + s.boost) desc, s.walk_minutes nulls last, s.name
  limit greatest(1, least(p_limit, 20));
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  Measurement — writes a student's client is allowed to make
-- ═══════════════════════════════════════════════════════════════════════════
--
--  These are RPCs rather than inserts so a client cannot attribute an event
--  to a business it chooses. The partner_id is looked up from the spot.

create or replace function public.log_spot_view(p_spot uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_partner uuid;
begin
  if auth.uid() is null then return; end if;
  select partner_id into v_partner from date_spots where id = p_spot;
  if v_partner is null then return; end if;
  insert into partner_events (partner_id, date_spot_id, stage)
  values (v_partner, p_spot, 'spot_view');
end;
$$;

create or replace function public.log_recommendation(
  p_spot         uuid,
  p_surface      text,
  p_conversation uuid default null,
  p_rank         int default null,
  p_fit          int default null,
  p_outcome      text default 'shown'
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_partner uuid;
begin
  if auth.uid() is null then return; end if;
  select partner_id into v_partner from date_spots where id = p_spot;

  insert into recommendation_events
    (date_spot_id, partner_id, viewer, conversation_id, surface, rank, fit_score, outcome)
  values (p_spot, v_partner, auth.uid(), p_conversation, p_surface, p_rank, p_fit, p_outcome);

  if v_partner is not null and p_outcome = 'shown' then
    insert into partner_events (partner_id, date_spot_id, stage)
    values (v_partner, p_spot, 'recommendation');
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Date Passes — the student side
-- ═══════════════════════════════════════════════════════════════════════════

--  Unambiguous when read aloud to a server: no 0/O, no 1/I/L.
create or replace function public.generate_pass_code()
returns text
language plpgsql volatile as $$
declare
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  out      text := '';
  i        int;
begin
  for i in 1..8 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    if i = 4 then out := out || '-'; end if;
  end loop;
  return 'LL-' || out;
end;
$$;

--  Unlocking an offer. Idempotent by design: asking twice hands back the pass
--  you already have rather than minting a second one, which is also the
--  cheapest anti-abuse measure available.
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

--  A person's own passes, with everything the ticket needs to render.
create or replace function public.my_date_passes(p_include_used boolean default false)
returns table (
  id            uuid,
  code          text,
  status        pass_status,
  issued_at     timestamptz,
  expires_at    timestamptz,
  redeemed_at   timestamptz,
  offer_title   text,
  offer_summary text,
  offer_terms   text,
  days_text     text,
  partner_name  text,
  partner_logo  text,
  address_line  text,
  spot_id       uuid
)
language sql stable security definer set search_path = public as $$
  select
    dp.id, dp.code,
    case when dp.status = 'issued' and dp.expires_at < now() then 'expired'::pass_status
         else dp.status end,
    dp.issued_at, dp.expires_at, dp.redeemed_at,
    o.title,
    case o.offer_type
      when 'percent_off' then o.percent_off || '% off your date'
      when 'amount_off'  then '$' || (o.amount_off_cents / 100.0)::numeric(10,2) || ' off'
      when 'free_item'   then 'Free ' || coalesce(o.free_item, 'treat')
      when 'bogo'        then 'Buy one, get one'
      else coalesce(o.description, o.title)
    end,
    o.terms,
    public.days_label(o.days_of_week),
    p.name, p.logo_path,
    l.address_line,
    d.id
  from date_passes dp
  join partner_offers o on o.id = dp.offer_id
  join partners p on p.id = dp.partner_id
  left join partner_locations l on l.id = dp.partner_location_id
  left join date_spots d on d.partner_location_id = l.id
  where dp.issued_to = auth.uid()
    and (p_include_used or (dp.status = 'issued' and dp.expires_at > now()))
  order by dp.issued_at desc;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  Date Passes — the partner side
-- ═══════════════════════════════════════════════════════════════════════════
--
--  These two are the whole reason `date_passes` has no partner read policy.
--  Look at the return types: an offer, a status, two timestamps. A restaurant
--  learns that a valid Loose Leaf date is standing at the counter. It does not
--  learn who, or who with, or why this place was suggested.

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
  if not public.is_partner_member(p_partner) then
    raise exception 'Not authorised';
  end if;
  if not public.partner_has(p_partner, 'redemption') then
    raise exception 'Date Passes are not part of this plan.';
  end if;

  if v_code <> '' and left(v_code, 3) <> 'LL-' then v_code := 'LL-' || v_code; end if;

  select * into dp from date_passes where code = v_code;

  -- A pass belonging to a different business is reported as unknown, not as
  -- "exists but not yours" — that would leak which businesses a code touches.
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

--  The one that moves money. Locks the row, re-checks everything the client
--  was told, and writes the redemption in the same transaction, so two phones
--  scanning the same ticket at the same moment cannot both succeed.
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
  if not public.is_partner_member(p_partner) then
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

-- ═══════════════════════════════════════════════════════════════════════════
--  What a partner sees
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.partner_overview(p_partner uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_month timestamptz := date_trunc('month', now());
  v_out   jsonb;
begin
  if not public.is_partner_member(p_partner) then
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
  if not public.is_partner_member(p_partner) then
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

--  The redemption ledger. Note the select list one more time: a timestamp, an
--  offer title, and the last four of the code so a manager can match it to a
--  receipt. There is no room in this shape for a person.
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
    and public.is_partner_member(p_partner)
  order by r.redeemed_at desc
  limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset);
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Staff oversight
-- ═══════════════════════════════════════════════════════════════════════════

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
  active_offers int
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.name, p.category, p.status, p.description, p.website, p.phone, p.created_at,
    pu.email, s.plan_id, s.status,
    (select count(*)::int from partner_locations l where l.partner_id = p.id),
    (select count(*)::int from partner_offers o where o.partner_id = p.id and o.status = 'active')
  from partners p
  left join partner_users pu on pu.id = p.created_by
  left join partner_subscriptions s on s.partner_id = p.id
  where public.is_admin()
    and (p_status = 'all' or p.status::text = p_status)
  order by p.created_at desc;
$$;

create or replace function public.staff_set_partner_status(
  p_partner uuid,
  p_status  partner_status,
  p_note    text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;
  update partners
     set status = p_status,
         review_note = p_note,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_partner;
end;
$$;

create or replace function public.staff_set_offer_status(p_offer uuid, p_status offer_status)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;
  update partner_offers set status = p_status where id = p_offer;
end;
$$;

--  Revenue at the shape staff actually need: what is being billed, by plan.
create or replace function public.staff_partner_revenue()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;

  return jsonb_build_object(
    'mrr_cents', coalesce((
      select sum(pl.monthly_cents)
      from partner_subscriptions s join partner_plans pl on pl.id = s.plan_id
      where s.status in ('active', 'trialing')), 0),
    'by_plan', coalesce((
      select jsonb_agg(jsonb_build_object('plan', pl.name, 'count', c.n, 'cents', c.n * pl.monthly_cents))
      from (select plan_id, count(*) n from partner_subscriptions
            where status in ('active','trialing') group by plan_id) c
      join partner_plans pl on pl.id = c.plan_id), '[]'::jsonb),
    'partners_by_status', coalesce((
      select jsonb_object_agg(status, n)
      from (select status::text, count(*) n from partners group by status) q), '{}'::jsonb),
    'verified_dates_this_month', (
      select count(*) from date_pass_redemptions where redeemed_at >= date_trunc('month', now()))
  );
end;
$$;

-- ─── grants ───────────────────────────────────────────────────────────────
--  Security-definer functions must be callable, but the sensitive ones check
--  membership or is_admin() on the first line rather than trusting the grant.

grant execute on function
  public.register_partner(text, text, text),
  public.my_partners(),
  public.save_date_spot(uuid, jsonb),
  public.offer_usage(uuid),
  public.offer_is_open(uuid, timestamptz),
  public.spot_is_open(uuid, timestamptz),
  public.recommend_date_spots(text, text[], int, int, timestamptz, uuid, text, int),
  public.log_spot_view(uuid),
  public.log_recommendation(uuid, text, uuid, int, int, text),
  public.issue_date_pass(uuid, uuid, text),
  public.my_date_passes(boolean),
  public.days_label(int[]),
  public.partner_lookup_pass(uuid, text),
  public.redeem_date_pass(uuid, text, int),
  public.partner_overview(uuid),
  public.partner_funnel(uuid, int),
  public.partner_redemptions(uuid, int, int),
  public.staff_partner_queue(text),
  public.staff_set_partner_status(uuid, partner_status, text),
  public.staff_set_offer_status(uuid, offer_status),
  public.staff_partner_revenue(),
  public.partner_entitlements(uuid),
  public.partner_has(uuid, text),
  public.partner_is_live(uuid),
  public.is_partner_user()
to authenticated;

revoke execute on function public.generate_pass_code() from anon, authenticated, public;
