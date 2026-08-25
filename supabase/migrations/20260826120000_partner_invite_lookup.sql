-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — letting an invited staff member reach the login screen
-- ═══════════════════════════════════════════════════════════════════════════
--
--  A shift manager who has just been added to a business has no Looseleaf
--  account at all. The partner login screen sent its one-time code with
--  account creation switched off — correctly, so that typing any address into
--  a login box does not mint an account — and the invitee got
--  "No Loose Leaf Partner account for that address yet." The only door left
--  open said "Become a Partner", which is a business-signup flow and the
--  wrong answer to "my boss added me at work".
--
--  So the login screen needs to answer one question before it sends a code:
--  is somebody expecting this person? That is all this function tells it.
--
--  ── What this deliberately does not do ────────────────────────────────────
--
--  It returns a bare boolean. Not the business, not the role, not the invite
--  id, not when it expires. An invite is not a capability (see
--  20260821120000_partner_team.sql) and this must not become one: everything
--  that grants anything still goes through `accept_partner_invite()`, which
--  re-checks the address against the JWT of whoever actually signed in.
--
--  It is callable by `anon`, because the person asking is by definition not
--  signed in yet. That does mean an address can be tested for "was this
--  invited somewhere" one guess at a time. Weighed against the alternative —
--  turning on account creation for every address typed into the login box —
--  this is the smaller opening: the caller must already know the exact
--  address, learns nothing about which business, and pending invites expire
--  after fourteen days. Rate limiting sits in front of it at the Supabase
--  edge, the same as every other anon RPC.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.partner_invite_open(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from partner_invites i
    where i.accepted_at is null
      and i.expires_at > now()
      and i.email = lower(trim(coalesce(p_email, '')))
  );
$$;

comment on function public.partner_invite_open(text) is
  'Is a pending, unexpired team invitation waiting for this address? Boolean only — no business, no role. Used by the partner login screen to decide whether a first-time staff member may create their account.';

grant execute on function public.partner_invite_open(text) to anon, authenticated;
