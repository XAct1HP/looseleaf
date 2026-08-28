-- ═══════════════════════════════════════════════════════════════════════════
--  Date Spots we add ourselves
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Two things, and the second exists because of the first.
--
--  **The seeded spots go.** `seed.sql` shipped eight real Ann Arbor
--  businesses — Vertex Coffee, Sava's, Ashley's and the rest — as "organic"
--  Date Spots. None of them has ever heard of Loose Leaf. A row on that page
--  is a claim that somebody stands behind the place, and a seed file cannot
--  make that claim: it has no photo, no reason, and nobody's name on it.
--  They are deleted here rather than unpublished, because a hidden row is
--  still a row somebody will re-publish one day without knowing where it
--  came from.
--
--  **Staff can add spots by hand instead.** Backstage → Spots writes
--  ordinary `date_spots` rows with `partner_id is null`: a cover photo, a
--  line about why it's worth going, and the date types the recommender
--  filters on. They exist to keep the page from being empty while partners
--  are still signing up, and they are removed the same way they arrive.
--
--  Three rules hold them in place, all of them structural:
--
--   1. **A spot nobody signed can never be sponsored.** A check constraint,
--      not a convention. `is_sponsored` on a partner-less row is now
--      impossible to write, so the oldest promise in this schema — a
--      sponsorship means a real agreement — cannot be broken by a Backstage
--      form.
--   2. **They are not suggestions.** `suggestable` is false on everything
--      added this way, and `recommend_date_spots` filters on it. The planner
--      and the in-chat "where should we go?" stay for businesses that opted
--      in; a place we picked shows up where somebody is *browsing*, which is
--      a different act from being told.
--   3. **Staff manage these and only these.** The policy is
--      `is_admin() and partner_id is null`, so Backstage cannot edit a
--      business's own listing. A partner's card is theirs.

-- ─── the placeholders ─────────────────────────────────────────────────────
--  A date plan that pointed at one of them keeps the plan and loses the
--  spot. The original constraint had no action, which would have made every
--  delete on this table — including a staff member removing a spot they
--  added by mistake — fail against a plan nobody remembers making.

alter table date_plans drop constraint if exists date_plans_spot_id_fkey;
alter table date_plans add constraint date_plans_spot_id_fkey
  foreign key (spot_id) references date_spots (id) on delete set null;

delete from date_spots
 where partner_id is null
   and name in (
     'Vertex Coffee', 'Roos Roast', 'Sava''s', 'Blank Slate Creamery',
     'Nichols Arboretum', 'Shapiro Library, 3rd floor', 'Ashley''s',
     'Pinball Pete''s'
   );

-- ─── what a hand-added spot carries ───────────────────────────────────────

alter table date_spots add column if not exists added_by uuid
  references profiles (id) on delete set null;

alter table date_spots add column if not exists suggestable boolean not null
  default true;

comment on column date_spots.added_by is
  'The staff member who added this by hand. Null for a partner''s own '
  'listing, which the business manages itself.';

comment on column date_spots.suggestable is
  'Whether recommend_date_spots may return this spot. True for partners, '
  'false for anything added in Backstage: a place we picked belongs where '
  'somebody is browsing, not in an answer to "where should we go?". '
  'Turning it on for one spot is a row edit, not a deploy.';

-- Sponsorship has meant "a real agreement exists" since the first migration.
-- Now a row with no partner behind it cannot claim one at all.
alter table date_spots drop constraint if exists date_spots_house_never_sponsored;
alter table date_spots add constraint date_spots_house_never_sponsored
  check (partner_id is not null or not is_sponsored);

-- ─── who may write one ────────────────────────────────────────────────────
--  Deliberately narrow on both sides. Staff reach spots with no business
--  behind them; the existing "spots: partners manage their own" policy
--  reaches spots that have one. Neither can touch the other's, and the
--  `with check` half repeats the sponsorship rule so the failure arrives as
--  a permission rather than a constraint violation.

drop policy if exists "spots: staff manage the ones we add" on date_spots;
create policy "spots: staff manage the ones we add" on date_spots
  for all to authenticated
  using (public.is_admin() and partner_id is null)
  with check (public.is_admin() and partner_id is null and not is_sponsored);

-- ─── cover photos ─────────────────────────────────────────────────────────
--  These go in `partner-media` beside the businesses' own, because it is the
--  same picture doing the same job on the same card, and a second bucket
--  would mean a second set of URLs for `SpotImage` to learn.
--
--  Ownership in that bucket is a path check: files live under <partner-id>/.
--  A hand-added spot has no partner id, so its files live under a fixed
--  folder that is a valid uuid but belongs to no business — valid because
--  the existing policies cast that first path segment to uuid, and a cast
--  that fails inside a policy raises rather than returning false, which
--  would take every upload in the bucket down with it.
--
--  `partner_folder_admin()` closes that hole properly: it checks the shape
--  before it casts, in a CASE-free plpgsql body where the order is
--  guaranteed, so a folder named anything at all is simply not yours.

create or replace function public.partner_folder_admin(p_folder text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_folder is null
     or p_folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    return false;
  end if;
  return public.is_partner_admin(p_folder::uuid);
end;
$$;

grant execute on function public.partner_folder_admin(text) to authenticated;

drop policy if exists "partner media: your own business" on storage.objects;
create policy "partner media: your own business"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'partner-media'
  and public.partner_folder_admin((storage.foldername(name))[1])
);

drop policy if exists "partner media: replace your own" on storage.objects;
create policy "partner media: replace your own"
on storage.objects for update to authenticated
using (
  bucket_id = 'partner-media'
  and public.partner_folder_admin((storage.foldername(name))[1])
);

drop policy if exists "partner media: delete your own" on storage.objects;
create policy "partner media: delete your own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'partner-media'
  and public.partner_folder_admin((storage.foldername(name))[1])
);

--  The house folder. Staff only, and only this one folder — Backstage cannot
--  overwrite a restaurant's cover photo any more than it can edit its card.

drop policy if exists "partner media: staff house spots" on storage.objects;
create policy "partner media: staff house spots"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'partner-media'
  and (storage.foldername(name))[1] = '00000000-0000-4000-8000-000000000000'
  and public.is_admin()
);

drop policy if exists "partner media: staff replace house spots" on storage.objects;
create policy "partner media: staff replace house spots"
on storage.objects for update to authenticated
using (
  bucket_id = 'partner-media'
  and (storage.foldername(name))[1] = '00000000-0000-4000-8000-000000000000'
  and public.is_admin()
);

drop policy if exists "partner media: staff delete house spots" on storage.objects;
create policy "partner media: staff delete house spots"
on storage.objects for delete to authenticated
using (
  bucket_id = 'partner-media'
  and (storage.foldername(name))[1] = '00000000-0000-4000-8000-000000000000'
  and public.is_admin()
);

-- ─── the recommender learns about `suggestable` ───────────────────────────
--  Rebased on the definition in 20260828120000_compatibility.sql — the
--  fourth version of this function — with one line added inside the where
--  clause and nothing else touched. Starting from an older copy would have
--  silently reverted the couple-signal scoring, the same way starting from
--  the first copy of `issue_date_pass` would have deleted the credit
--  ceiling. Grep every migration for a function before replacing it.

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
  --  the couple, as the recommender sees them
  v_wanted    text[] := '{}';   -- date types they both like
  v_budget    int;              -- the lower of two budgets
  v_walk      int;              -- the shorter of two walks
  v_no_drinks boolean := false; -- either of them said no
  v_min_age   int;              -- the younger of the two
  -- Weights. See the note above before touching these.
  k_type      int := 34;   -- asked for coffee, serves coffee
  k_vibe_each int := 6;    -- per shared vibe
  k_vibe_cap  int := 18;
  k_price     int := 14;
  k_walk      int := 16;
  k_open      int := 8;
  k_interest  int := 10;
  k_couple    int := 12;   -- what the two of them both call a good date
  k_partner_cap int := 10; -- the entire ceiling on what money moves
  k_floor     int := 24;   -- below this, not shown at all
begin
  select university_id, age into v_campus, v_min_age from profiles where id = v_me;
  if v_campus is null then return; end if;

  if p_conversation is not null then
    select case when c.profile_a = v_me then c.profile_b else c.profile_a end
      into v_other
    from conversations cv
    join matches c on c.id = cv.match_id
    where cv.id = p_conversation
      and (c.profile_a = v_me or c.profile_b = v_me);
  end if;

  -- Both people's interests, used only to score *places*. Nothing about
  -- either person leaves this function.
  select coalesce(array_agg(distinct pi.interest_id), '{}')
    into v_interests
  from profile_interests pi
  where pi.profile_id = v_me or (v_other is not null and pi.profile_id = v_other);

  --  What the two of them, together, call a good date. With a partner in the
  --  conversation this is an intersection where one exists and a union where
  --  it doesn't — two people who agree get exactly what they agree on, and two
  --  people who agree on nothing still get both their lists rather than an
  --  empty one.
  if v_other is null then
    select coalesce(s.ideal_dates, '{}') into v_wanted
    from profile_survey s where s.profile_id = v_me;
  else
    select coalesce(array(
      select unnest(sa.ideal_dates) intersect select unnest(sb.ideal_dates)
    ), '{}') into v_wanted
    from profile_survey sa, profile_survey sb
    where sa.profile_id = v_me and sb.profile_id = v_other;

    if coalesce(cardinality(v_wanted), 0) = 0 then
      select coalesce(array_agg(distinct d), '{}') into v_wanted
      from profile_survey s, unnest(s.ideal_dates) d
      where s.profile_id in (v_me, v_other);
    end if;
  end if;

  select min(s.budget_level), min(s.max_walk_minutes),
         bool_or(s.drinks = 'never')
    into v_budget, v_walk, v_no_drinks
  from profile_survey s
  where s.profile_id = v_me or (v_other is not null and s.profile_id = v_other);

  if v_other is not null then
    select least(v_min_age, p.age) into v_min_age from profiles p where p.id = v_other;
  end if;

  --  A caller who said what they wanted wins over the survey; the survey is
  --  what fills in the blanks, not what overrides an answer.
  p_max_price := coalesce(p_max_price, v_budget);
  p_max_walk  := coalesce(p_max_walk, v_walk);
  v_no_drinks := coalesce(v_no_drinks, false);

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
      -- what the two of them both call a good date
      + (case when coalesce(cardinality(v_wanted), 0) = 0 then 0
              else least(k_couple, 6 * coalesce(cardinality(array(
                select unnest(d.date_types) intersect select unnest(v_wanted))), 0))
         end)
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
                select unnest(d.date_types || d.vibes || d.tags)
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
      -- A spot somebody added in Backstage is not a suggestion. It sits on
      -- the Date Spots page, where a couple is browsing; it does not come
      -- back from "where should we go?", because that answer should be a
      -- business that agreed to be in it.
      and d.suggestable
      -- Asked for coffee, get coffee. This is a filter and not a weight on
      -- purpose: it is the line that makes "a business cannot buy its way
      -- into a conversation it doesn't belong in" true absolutely rather
      -- than true by arithmetic. Callers wanting a wider net pass null,
      -- which is what "Surprise us" does.
      and (p_date_type is null or p_date_type = any (d.date_types))
      -- Nobody is sent somewhere they cannot get into.
      and (d.min_age is null or v_min_age is null or v_min_age >= d.min_age)
      -- If either of them said no to drinks, a place that is only drinks is
      -- not a suggestion, it is an awkward evening.
      and not (
        v_no_drinks
        and 'drinks' = any (d.date_types)
        and coalesce(cardinality(array(
              select unnest(d.date_types)
              except select unnest(array['drinks', 'late-night', 'romantic', 'casual']))), 0) = 0
      )
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
          -- "we're a good fit for people who are into…", which can only ever
          -- remove this business from a suggestion, never add it to one
          and (t.interests is null or cardinality(t.interests) = 0
               or coalesce(cardinality(array(
                    select unnest(t.interests) intersect select unnest(v_interests))), 0) > 0)
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
      + (case when coalesce(cardinality(v_wanted), 0) = 0 then 0 else k_couple end)
      + (case when p_max_price is null then k_price / 2 else k_price end)
      + k_walk + k_open + (k_interest / 2) + k_partner_cap)))::int
  from scored s
  where s.relevance >= k_floor
  order by (s.relevance + s.boost) desc, s.walk_minutes nulls last, s.name
  limit greatest(1, least(p_limit, 20));
end;
$$;
