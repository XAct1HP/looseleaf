-- ═══════════════════════════════════════════════════════════════════════════
--  Scanning is what membership *is*
-- ═══════════════════════════════════════════════════════════════════════════
--
--  The permissions grid already told owners that "Scan a pass" was always on
--  and refused to let them switch it off. That was a claim the interface made
--  and the database did not keep: `set_partner_role_pages()` filtered its input
--  against an allow-list but never insisted on `scan`, so anything calling the
--  function directly — a script, a curl, a future screen that forgot — could
--  write a role with no pages at all and leave a member of staff signed in to
--  a dashboard with nothing in it.
--
--  There is no such thing as a partner member who may not scan. It is the
--  entire reason the staff role exists, and the one thing every role shares.
--  So it stops being a grant and becomes a property of membership: `scan` is
--  true for anybody with a `partner_members` row, and the stored grid is kept
--  honest to match, so what an owner reads back is what is actually enforced.

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

  -- Never revocable: a member who cannot scan cannot do anything.
  if p_page = 'scan' then return true; end if;

  -- Never grantable: it is the page that edits this grid.
  if p_page = 'settings' then return false; end if;

  select coalesce(role_pages -> v_role::text, '[]'::jsonb)
    into v_pages from partners where id = p_partner;

  return v_pages ? p_page;
end;
$$;

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

  --  `scan` is added rather than merely permitted, so the grid an owner reads
  --  back says the same thing partner_can() will answer.
  select coalesce(array_agg(distinct p), '{}') into v_clean
  from unnest(coalesce(p_pages, '{}') || array['scan']) p
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

--  Any grid written before this migration that had lost `scan` gets it back.
update partners p
   set role_pages = (
     select jsonb_object_agg(
              key,
              case when value ? 'scan' then value else value || '["scan"]'::jsonb end
            )
     from jsonb_each(p.role_pages)
   )
 where p.role_pages is not null
   and exists (
     select 1 from jsonb_each(p.role_pages) e where not (e.value ? 'scan')
   );
