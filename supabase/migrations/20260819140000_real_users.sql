-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — real users
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Three changes, all of them things the demo let us avoid thinking about:
--
--   1. Admins exist. One boolean on `profiles`, checked by a security-definer
--      function. There is no admin table and no roles system — resist adding
--      one until there is a second kind of admin.
--   2. Events are student-submitted and admin-approved. Until now
--      `campus_events` had a read policy and nothing else, which meant nobody
--      could create one through the app at all.
--   3. Campuses open at a threshold. A dating app with four people on it is
--      worse than a waitlist, so Discover stays shut until a campus has enough
--      profiles to be worth opening.
--
--  Also deletes the invented campus events from seed.sql. Real events now come
--  from real students.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── admins ───────────────────────────────────────────────────────────────

alter table profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

comment on function public.is_admin() is
  'True for staff. Set with: update profiles set is_admin = true where id = ''<uuid>'';';

-- ─── campuses open at a threshold ─────────────────────────────────────────

alter table universities add column if not exists is_live boolean not null default false;
alter table universities add column if not exists open_threshold int not null default 50;

comment on column universities.is_live is
  'Force a campus open regardless of headcount. Otherwise it opens at open_threshold.';

-- Headcount only counts finished profiles — half-built ones are not people
-- you can be shown.
create or replace function public.campus_member_count(p_university uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.profiles
  where university_id = p_university
    and onboarded_at is not null
    and is_paused = false;
$$;

/**
 * Everything the waitlist screen needs, in one round trip:
 *   { university, short_name, members, threshold, is_open, position }
 * `position` is your place in line — stable, because it counts people who
 * signed up before you rather than people who are ahead of you now.
 */
create or replace function public.campus_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  u          public.universities%rowtype;
  me         public.profiles%rowtype;
  members    int;
  place      int;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then
    return jsonb_build_object('error', 'no profile');
  end if;

  select * into u from public.universities where id = me.university_id;
  members := public.campus_member_count(u.id);

  select count(*)::int + 1 into place
  from public.profiles p
  where p.university_id = u.id
    and p.created_at < me.created_at;

  return jsonb_build_object(
    'university',  u.name,
    'short_name',  u.short_name,
    'members',     members,
    'threshold',   u.open_threshold,
    'is_open',     (u.is_live or members >= u.open_threshold),
    'position',    place
  );
end;
$$;

-- Discover stays shut until the campus opens. Belt and braces: the client
-- routes around it too, but the deck itself refuses.
create or replace function public.get_deck(p_limit int default 20)
returns setof profiles language sql stable security definer set search_path = public as $$
  select p.*
  from profiles p
  join profile_preferences pref on pref.profile_id = auth.uid()
  join universities u on u.id = public.current_university()
  where p.id <> auth.uid()
    and (u.is_live or public.campus_member_count(u.id) >= u.open_threshold)
    and p.is_paused = false
    and p.onboarded_at is not null
    and p.university_id = u.id
    and p.age between pref.min_age and pref.max_age
    and (
      cardinality(pref.interested_in) = 0
      or 'everyone' = any (pref.interested_in)
      or p.gender = any (pref.interested_in)
    )
    and not public.blocked_between(auth.uid(), p.id)
    and not exists (select 1 from deck_views v where v.profile_id = auth.uid() and v.seen_id = p.id)
    and not exists (select 1 from likes l where l.from_profile = auth.uid() and l.to_profile = p.id)
    and not public.is_matched_with(p.id)
  order by
    (select count(*) from profile_interests mine
       join profile_interests theirs on theirs.interest_id = mine.interest_id
      where mine.profile_id = auth.uid() and theirs.profile_id = p.id) desc,
    md5(p.id::text || current_date::text)
  limit p_limit;
$$;

-- ─── events: submitted by students, approved by staff ─────────────────────

alter table campus_events add column if not exists created_by  uuid references profiles (id) on delete set null;
alter table campus_events add column if not exists status      text not null default 'pending';
alter table campus_events add column if not exists submitted_at timestamptz not null default now();
alter table campus_events add column if not exists reviewed_by uuid references profiles (id) on delete set null;
alter table campus_events add column if not exists reviewed_at timestamptz;
alter table campus_events add column if not exists reject_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'campus_events_status_check'
  ) then
    alter table campus_events
      add constraint campus_events_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists campus_events_moderation_idx
  on campus_events (university_id, status, submitted_at desc);

-- The invented seed events go. Anything with no author was fixture data.
delete from campus_events where created_by is null;

drop policy if exists "reference: read" on campus_events;

-- You see approved events on your campus, plus your own submissions while
-- they wait. Staff see everything.
create policy "events: read approved, plus your own"
on campus_events for select to authenticated
using (
  public.is_admin()
  or created_by = auth.uid()
  or (status = 'approved' and university_id = public.current_university())
);

-- Anyone can propose one, but not pre-approved and not for another campus.
create policy "events: students may submit"
on campus_events for insert to authenticated
with check (
  created_by = auth.uid()
  and status = 'pending'
  and university_id = public.current_university()
);

-- Edit your own only while it's still pending; staff can edit anything.
create policy "events: edit your pending submission"
on campus_events for update to authenticated
using (public.is_admin() or (created_by = auth.uid() and status = 'pending'))
with check (public.is_admin() or (created_by = auth.uid() and status = 'pending'));

create policy "events: withdraw your own"
on campus_events for delete to authenticated
using (public.is_admin() or (created_by = auth.uid() and status = 'pending'));

-- Interest only counts for events you can actually see, so the join in the
-- select policy above does the filtering for us.

-- ─── photos are private, served through signed URLs ───────────────────────
--
-- A public bucket means a leaked path is a permanently public photo of a
-- student. Signed URLs expire; that is the whole point.

update storage.buckets set public = false where id = 'profile-photos';

drop policy if exists "photos: anyone signed in can view" on storage.objects;

create policy "photos: signed-in students can read"
on storage.objects for select to authenticated
using (bucket_id = 'profile-photos');

-- ─── admin conveniences ───────────────────────────────────────────────────

-- Staff need to read reports to act on them; everyone else still can't.
drop policy if exists "reports: see your own" on reports;
create policy "reports: yours, or all of them if you are staff"
on reports for select to authenticated
using (reporter_id = auth.uid() or public.is_admin());

comment on table reports is
  'Write-only for students. Staff read via the is_admin() branch on the select policy.';
