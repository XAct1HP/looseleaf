-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — Backstage
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Staff work moves out of the product and into its own section. Nothing here
--  changes what a normal member sees: the five tabs are identical for everyone,
--  including staff.
--
--  Three things:
--   1. Reports become a queue with a state, instead of a write-only log.
--   2. Staff can read profiles they'd otherwise be blocked from — you cannot
--      action a report about someone you can't see.
--   3. One RPC returns everything the overview needs, so the dashboard is a
--      single round trip rather than eight counts.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── reports become a queue ───────────────────────────────────────────────

alter table reports add column if not exists status      text not null default 'open';
alter table reports add column if not exists reviewed_by uuid references profiles (id) on delete set null;
alter table reports add column if not exists reviewed_at timestamptz;
alter table reports add column if not exists staff_note  text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reports_status_check') then
    alter table reports add constraint reports_status_check
      check (status in ('open', 'actioned', 'dismissed'));
  end if;
end $$;

create index if not exists reports_queue_idx on reports (status, created_at desc);

create policy "reports: staff triage"
on reports for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ─── staff can see who they're moderating ─────────────────────────────────
--
-- The normal select policy hides paused profiles, other campuses, and anyone
-- involved in a block. A report about any of those would be unreviewable.

drop policy if exists "profiles: see yourself and your campus" on profiles;

create policy "profiles: see yourself, your campus, or everything if staff"
on profiles for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (
    is_paused = false
    and university_id = public.current_university()
    and not public.blocked_between(auth.uid(), id)
  )
);

/**
 * Suspending someone is the one write staff need on another person's profile.
 * A targeted function rather than a blanket admin UPDATE policy, so staff
 * can't quietly rewrite someone's answers.
 */
create or replace function public.staff_set_paused(target uuid, paused boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised.';
  end if;
  update public.profiles set is_paused = paused where id = target;
end;
$$;

revoke execute on function public.staff_set_paused(uuid, boolean) from anon;

-- ─── the overview, in one round trip ──────────────────────────────────────

create or replace function public.staff_overview(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uni     uuid;
  result  jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised.';
  end if;

  uni := public.current_university();

  select jsonb_build_object(
    'campus', (
      select jsonb_build_object(
        'name', u.name,
        'short_name', u.short_name,
        'threshold', u.open_threshold,
        'is_live', u.is_live,
        'is_open', (u.is_live or public.campus_member_count(u.id) >= u.open_threshold)
      ) from universities u where u.id = uni
    ),

    'members',        (select count(*) from profiles where university_id = uni and onboarded_at is not null and is_paused = false),
    'signed_up',      (select count(*) from profiles where university_id = uni),
    'incomplete',     (select count(*) from profiles where university_id = uni and onboarded_at is null),
    'paused',         (select count(*) from profiles where university_id = uni and is_paused),

    'likes',          (select count(*) from likes),
    'notes',          (select count(*) from likes where note is not null),
    'matches',        (select count(*) from matches),
    'messages',       (select count(*) from messages),

    'open_reports',   (select count(*) from reports where status = 'open'),
    'pending_events', (select count(*) from campus_events where status = 'pending' and university_id = uni),
    'live_tonight',   (select count(*) from tonight_status where expires_at > now()),

    -- One row per day for the last p_days, zero-filled so the chart has no gaps.
    'signups', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
      from generate_series(
             (current_date - (p_days - 1))::date, current_date::date, interval '1 day'
           ) as d(day)
      left join (
        select created_at::date as day, count(*) as n
        from profiles
        where university_id = uni
        group by 1
      ) c on c.day = d.day
    )
  ) into result;

  return result;
end;
$$;

comment on function public.staff_overview(int) is
  'Everything the Backstage overview needs. Raises if the caller is not staff.';
