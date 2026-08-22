-- ═══════════════════════════════════════════════════════════════════════════
--  How many people are actually here
-- ═══════════════════════════════════════════════════════════════════════════
--
--  The Campus page has been showing "2,418 students are on Looseleaf here" and
--  "87 people are open to plans tonight" since the demo campus was written.
--  Both are inventions, and shipping an invented headcount to real students is
--  a small lie that costs more than it buys — the first person to count the
--  people they know on it works out that the number is decoration.
--
--  So: count them. Two aggregates over the caller's own university, and
--  nothing else. Deliberately not a list, not a sample, not an id — this
--  cannot become a way to find out *who* is around, only how many.
--
--  `security definer` because a student's RLS view of `profiles` is their
--  campus minus the paused and the un-onboarded, which is the right number for
--  them but the wrong one to compute a total from.

create or replace function public.campus_stats()
returns table (members int, tonight int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int
       from profiles
      where university_id = public.current_university()
        and onboarded_at is not null
        and is_paused = false),
    (select count(*)::int
       from tonight_status t
       join profiles p on p.id = t.profile_id
      where p.university_id = public.current_university()
        and t.expires_at > now()
        and p.is_paused = false)
  where public.current_university() is not null;
$$;

grant execute on function public.campus_stats() to authenticated;

comment on function public.campus_stats() is
  'Two aggregate counts for the caller''s campus. Returns no row for somebody '
  'with no university. Never returns identities — see the Campus page, which '
  'hides a count entirely when it is too small to be worth stating.';
