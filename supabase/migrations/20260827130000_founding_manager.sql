-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — the person who signs the business up is not always the owner
-- ═══════════════════════════════════════════════════════════════════════════
--
--  `register_partner()` made the caller an owner, full stop. In practice the
--  person who fills a form like this in is very often a general manager: the
--  owner is not the one who is going to sit down and describe the hours, pick
--  the photos and set up an offer. Making that manager an "owner" in the
--  database is a lie the team page then repeats to everybody who joins later.
--
--  So registration asks, and the answer is a real role.
--
--  The problem that creates, and how it is solved:
--
--    A business registered by a manager has **no owner yet**. Every control
--    that says "owner only" — editing the grants, inviting an owner, the
--    Settings page itself — would be unreachable by anybody, and the manager
--    who just signed the business up could not set up billing, could not add
--    their team, and could not invite the actual owner to take over. That is
--    a dead end you can walk into in about ninety seconds.
--
--    The fix is one narrow, explicit idea: the **account holder**. Normally
--    that is an owner. Where a business has no owner at all, it is the manager
--    who registered it — `partners.created_by`, and only them. They hold the
--    account until a real owner joins, and the moment one does they are an
--    ordinary manager again, reaching exactly what the owner grants them.
--
--  What has NOT changed, and must not:
--
--    `settings` is still never grantable. `partner_can()` still refuses to
--    consult `role_pages` for it — the account-holder test is a property of
--    who you are, not a row somebody can write. Nobody can hand `settings` to
--    a manager, including by editing the column directly, which is what the
--    test asserts.
--
--    A manager is still not an owner. The founding manager can invite one, and
--    hand the business over. They cannot make *themselves* one; nothing in the
--    product promotes anybody, and the owner-count guard is untouched.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── who holds the account ────────────────────────────────────────────────

create or replace function public.partner_is_account_holder(p_partner uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case public.partner_my_role(p_partner)
    when 'owner' then true
    when 'manager' then
      -- Only the registrant, and only while the business has no owner. Not
      -- "any manager": a founding manager who hires a second manager has not
      -- thereby handed over the account.
      exists (
        select 1 from partners p
        where p.id = p_partner and p.created_by = auth.uid()
      )
      and not exists (
        select 1 from partner_members m
        where m.partner_id = p_partner and m.role = 'owner'
      )
    else false
  end;
$$;

comment on function public.partner_is_account_holder(uuid) is
  'An owner, or the manager who registered a business that has no owner yet. '
  'This is what "owner only" means everywhere it is enforced.';

-- ─── the capability check ─────────────────────────────────────────────────
--  Identical to 20260823120000 — scan short-circuit and all — except for the
--  settings branch, which now asks the account-holder question instead of
--  hard-coding owner. `role_pages` is still never read for it.

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

  -- Never grantable: it is the page that edits this grid. Whether you reach it
  -- is a fact about who you are, and the column is not consulted either way.
  if p_page = 'settings' then
    return public.partner_is_account_holder(p_partner);
  end if;

  select coalesce(role_pages -> v_role::text, '[]'::jsonb)
    into v_pages from partners where id = p_partner;

  return v_pages ? p_page;
end;
$$;

-- ─── registering ──────────────────────────────────────────────────────────
--  A fourth argument, so the old three-argument signature has to go rather
--  than sit alongside as an overload nobody meant to call.

drop function if exists public.register_partner(text, text, text);

create or replace function public.register_partner(
  p_full_name text,
  p_name      text,
  p_category  text,
  p_role      partner_role default 'owner'
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

  -- `staff` is a role you are given by a business that already exists. Nobody
  -- registers one for themselves.
  if p_role not in ('owner', 'manager') then
    raise exception 'Registering a business means signing up as its owner or a manager.';
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
  values (v_partner, v_uid, p_role);

  -- A manager who registered the place needs the whole dashboard, because for
  -- now they are the whole team. Written into `role_pages` rather than special-
  -- cased in `partner_can()`, so it is visible on the Settings grid and an
  -- owner arriving later can narrow it with one click, like any other grant.
  if p_role = 'manager' then
    update partners
       set role_pages = jsonb_build_object(
             'manager', to_jsonb(array[
               'overview', 'spot', 'offers', 'scan',
               'redemptions', 'analytics', 'team', 'billing'
             ]),
             'staff', to_jsonb(array['scan'])
           )
     where id = v_partner;
  end if;

  insert into partner_targeting (partner_id) values (v_partner)
  on conflict (partner_id) do nothing;

  return v_partner;
end;
$$;

-- ─── the four places "owner" was hard-coded ───────────────────────────────
--  Each becomes the account-holder question. For a business that has an owner
--  — which is every business registered the old way — these are word-for-word
--  the same rule they were.

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
  -- somebody who could then remove them, or change the card on file. The
  -- founding manager is the exception, and it is the exception that makes the
  -- handover possible: inviting the actual owner is the point.
  if p_role = 'owner' and not public.partner_is_account_holder(p_partner) then
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
  if v_role = 'owner' and not public.partner_is_account_holder(v_partner) then
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
  v_holder  boolean := public.partner_is_account_holder(p_partner);
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
  if not v_holder and (p_role = 'owner' or v_target = 'owner') then
    raise exception 'Only an owner can change an owner.';
  end if;

  -- And nobody promotes themselves. A founding manager hands the business to
  -- an owner by inviting one; they do not become one by clicking on their own
  -- row, which would make the role they chose at signup meaningless.
  if p_role = 'owner' and p_user = auth.uid() and v_target <> 'owner' then
    raise exception 'Somebody else has to make you an owner.';
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
  v_target partner_role;
begin
  select role into v_target from partner_members
   where partner_id = p_partner and partner_user_id = p_user;
  if v_target is null then return; end if;

  -- Leaving on your own is always allowed; removing anybody else needs the
  -- team page, and removing an owner needs to hold the account.
  if p_user <> auth.uid() then
    if not public.partner_can(p_partner, 'team') then
      raise exception 'Only an owner or a manager can remove people.';
    end if;
    if v_target = 'owner' and not public.partner_is_account_holder(p_partner) then
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
  if not public.partner_is_account_holder(p_partner) then
    raise exception 'Only an owner can change what the team can see.';
  end if;
  if p_role = 'owner' then
    raise exception 'Owners already see everything.';
  end if;

  --  `scan` is added rather than merely permitted, so the grid an owner reads
  --  back says the same thing partner_can() will answer. (20260823120000,
  --  restated because this function is being replaced wholesale.)
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

-- ─── the grid is the account holder's ─────────────────────────────────────

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
    -- Only whoever holds the account has any use for the grid, and only they
    -- may change it. A manager who registered the business sees it until an
    -- owner arrives; after that it goes null for them like any other manager.
    case when public.partner_is_account_holder(p.id) then p.role_pages else null end,
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

grant execute on function
  public.register_partner(text, text, text, partner_role),
  public.partner_is_account_holder(uuid)
to authenticated;
