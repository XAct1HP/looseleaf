-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — restrict signups to verified campus email domains
-- ═══════════════════════════════════════════════════════════════════════════
--
--  This is a "Before User Created" auth hook. It is NOT a trigger on
--  auth.users — Supabase revoked write access to the `auth` schema for the
--  postgres role, so anything that tries to create objects there now fails
--  with "42501: permission denied for schema auth".
--
--  The hook runs as `supabase_auth_admin` before the account row is written,
--  and returns either {} to allow the signup or an error object to reject it.
--
--  Adding a campus is an INSERT into `universities`, not a code change:
--
--    insert into universities (name, short_name, city, email_domains, areas)
--    values ('Michigan State University', 'MSU', 'East Lansing, MI',
--            array['msu.edu'], array['North', 'South', 'Off Campus']);
--
--  After running this file you must still switch the hook on:
--    Dashboard → Authentication → Hooks → Before User Created
--      → Postgres → public.restrict_signup_to_campus → Enable
--  It does nothing until then.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.restrict_signup_to_campus(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  addr    text;
  domain  text;
  known   boolean;
begin
  addr := lower(trim(event -> 'user' ->> 'email'));

  if addr is null or addr = '' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'A university email address is required.',
        'http_code', 400
      )
    );
  end if;

  domain := split_part(addr, '@', 2);

  select exists (
    select 1
    from public.universities u
    where domain = any (u.email_domains)
  ) into known;

  if not known then
    return jsonb_build_object(
      'error', jsonb_build_object(
        -- Shown to the person verbatim, so it reads like Looseleaf and not
        -- like a database.
        'message', 'Looseleaf isn''t on your campus yet. Sign up with your school email and we''ll get there.',
        'http_code', 403
      )
    );
  end if;

  -- Empty object = carry on and create the account.
  return '{}'::jsonb;
end;
$$;

-- Supabase Auth calls this as `supabase_auth_admin`. Grant that role exactly
-- what the hook needs and nothing else — per Supabase's guidance, explicit
-- grants rather than `security definer`.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.restrict_signup_to_campus(jsonb) to supabase_auth_admin;
grant select on public.universities to supabase_auth_admin;

-- `universities` has RLS on, and its only policy targets `authenticated`, so
-- the hook needs its own read policy or the lookup silently returns no rows
-- and every signup gets rejected.
drop policy if exists "auth admin may read campus domains" on public.universities;
create policy "auth admin may read campus domains"
  on public.universities for select to supabase_auth_admin using (true);

-- The hook must never be callable through the Data APIs.
revoke execute on function public.restrict_signup_to_campus(jsonb) from authenticated, anon, public;
