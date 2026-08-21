-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — letting a business have more than one person
-- ═══════════════════════════════════════════════════════════════════════════
--
--  `partner_members` has had a role column since the partner platform landed,
--  but there was no way to add anybody, so every business was a lone owner.
--  That is the wrong shape for the actual job: the person who signs the
--  contract is not the person standing at the till at 9pm scanning a Date Pass.
--
--  Three roles, and the split is about what each one should be able to break:
--
--    owner    billing, the team, and everything below. Usually one person.
--    manager  the Date Spot, the offers, the targeting. Not the card.
--    staff    scan a pass, and see that it worked. Nothing else.
--
--  Invitations are by email and are claimed on sign-in, because a shift
--  manager does not have an account yet when their boss adds them. The invite
--  itself grants nothing — `accept_partner_invite()` is what writes the
--  membership row, and it re-checks the email against the JWT, so forwarding
--  an invite email to somebody else does not hand them a login.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists partner_invites (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references partners (id) on delete cascade,
  email       text not null,
  role        partner_role not null default 'staff',
  invited_by  uuid references partner_users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references partner_users (id) on delete set null,
  check (email = lower(email))
);

-- One live invite per address per business. Accepting or revoking frees it up.
create unique index if not exists partner_invites_pending_uidx
  on partner_invites (partner_id, email) where accepted_at is null;

create index if not exists partner_invites_email_idx on partner_invites (email)
  where accepted_at is null;

alter table partner_invites enable row level security;

--  The team can see its own invites. The *invitee* cannot read this table at
--  all — they reach their invitations through my_partner_invites(), which
--  matches on the address in their JWT and returns a business name and a role,
--  not a row. An invite is not a capability.
drop policy if exists "invites: your own team" on partner_invites;
create policy "invites: your own team" on partner_invites
  for select to authenticated
  using (public.is_partner_member(partner_id) or public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
--  Reading the team
-- ═══════════════════════════════════════════════════════════════════════════

--  `partner_users` is readable only by the person it describes, so a plain
--  join from partner_members gets ids and nothing else. This is the widening,
--  done deliberately and narrowly: a name, an email, a role. Business contact
--  details, shown to that business's own people.
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
    and public.is_partner_member(p_partner)
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
    and public.is_partner_admin(p_partner)
  order by i.created_at desc;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Changing the team
-- ═══════════════════════════════════════════════════════════════════════════

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
  if not public.is_partner_owner(p_partner) then
    raise exception 'Only an owner can add people.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That doesn''t look like an email address.';
  end if;

  -- Already on the team? Say so rather than issuing an invite that will
  -- confuse them when it does nothing.
  if exists (
    select 1 from partner_members m
    join partner_users u on u.id = m.partner_user_id
    where m.partner_id = p_partner and u.email = v_email
  ) then
    raise exception 'They''re already on your team.';
  end if;

  -- A Loose Leaf member cannot also hold a partner login. Better to refuse
  -- here, with a reason, than to let them accept and then hit the trigger.
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
declare v_partner uuid;
begin
  select partner_id into v_partner from partner_invites where id = p_invite;
  if v_partner is null then return; end if;
  if not public.is_partner_owner(v_partner) then
    raise exception 'Only an owner can do that.';
  end if;
  -- Deleted rather than marked withdrawn: a revoked invitation that still
  -- exists is a row somebody has to remember to filter out.
  delete from partner_invites where id = p_invite and accepted_at is null;
end;
$$;

--  What the person who was invited sees when they sign in. Matched on the
--  address in their token, so forwarding the email achieves nothing.
create or replace function public.my_partner_invites()
returns table (
  id           uuid,
  partner_id   uuid,
  partner_name text,
  role         partner_role,
  expires_at   timestamptz
)
language sql stable security definer set search_path = public as $$
  select i.id, i.partner_id, p.name, i.role, i.expires_at
  from partner_invites i
  join partners p on p.id = i.partner_id
  where i.accepted_at is null
    and i.expires_at > now()
    and i.email = public.jwt_email()
  order by i.created_at;
$$;

create or replace function public.accept_partner_invite(p_invite uuid, p_full_name text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv   partner_invites%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not signed in.'; end if;
  if exists (select 1 from profiles where id = v_uid) then
    raise exception 'This is a Loose Leaf member account. Partners sign in separately.';
  end if;

  select * into inv from partner_invites where id = p_invite for update;

  -- Re-checked here and not just in my_partner_invites(): this is the call
  -- that actually grants something.
  if not found
     or inv.accepted_at is not null
     or inv.expires_at < now()
     or inv.email is distinct from public.jwt_email() then
    raise exception 'That invitation isn''t valid any more.';
  end if;

  insert into partner_users (id, email, full_name)
  values (v_uid, inv.email, coalesce(nullif(trim(p_full_name), ''), split_part(inv.email, '@', 1)))
  on conflict (id) do update
    set full_name = coalesce(nullif(trim(p_full_name), ''), partner_users.full_name);

  insert into partner_members (partner_id, partner_user_id, role)
  values (inv.partner_id, v_uid, inv.role)
  on conflict (partner_id, partner_user_id) do update set role = excluded.role;

  update partner_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = p_invite;

  return inv.partner_id;
end;
$$;

--  Both of these guard the same thing from opposite directions: a business
--  must never end up with nobody who can pay the bill.
create or replace function public.set_partner_member_role(
  p_partner uuid,
  p_user    uuid,
  p_role    partner_role
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_owners int;
begin
  if not public.is_partner_owner(p_partner) then
    raise exception 'Only an owner can do that.';
  end if;

  select count(*) into v_owners
  from partner_members where partner_id = p_partner and role = 'owner';

  if v_owners <= 1 and p_role <> 'owner'
     and exists (select 1 from partner_members
                  where partner_id = p_partner and partner_user_id = p_user and role = 'owner') then
    raise exception 'Make somebody else an owner first — a business needs one.';
  end if;

  update partner_members set role = p_role
   where partner_id = p_partner and partner_user_id = p_user;
end;
$$;

create or replace function public.remove_partner_member(p_partner uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_owners int;
begin
  -- Leaving on your own is allowed; removing somebody else is an owner's job.
  if p_user <> auth.uid() and not public.is_partner_owner(p_partner) then
    raise exception 'Only an owner can remove people.';
  end if;

  select count(*) into v_owners
  from partner_members where partner_id = p_partner and role = 'owner';

  if v_owners <= 1
     and exists (select 1 from partner_members
                  where partner_id = p_partner and partner_user_id = p_user and role = 'owner') then
    raise exception 'Make somebody else an owner first — a business needs one.';
  end if;

  delete from partner_members
   where partner_id = p_partner and partner_user_id = p_user;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Managers, not just owners
-- ═══════════════════════════════════════════════════════════════════════════
--
--  `redeem_date_pass` and `partner_lookup_pass` already check
--  `is_partner_member`, which is what a `staff` role is for. Everything that
--  edits the business checks `is_partner_admin`, which covers manager. The one
--  gap: the subscription read was admin-only, and a manager who can see the
--  billing state is a manager who can tell the owner the card bounced.

drop policy if exists "subscriptions: read your own" on partner_subscriptions;
create policy "subscriptions: read your own" on partner_subscriptions
  for select to authenticated
  using (public.is_partner_member(partner_id) or public.is_admin());

grant select on partner_invites to authenticated;

grant execute on function
  public.partner_team(uuid),
  public.partner_pending_invites(uuid),
  public.invite_partner_member(uuid, text, partner_role),
  public.revoke_partner_invite(uuid),
  public.my_partner_invites(),
  public.accept_partner_invite(uuid, text),
  public.set_partner_member_role(uuid, uuid, partner_role),
  public.remove_partner_member(uuid, uuid)
to authenticated;
