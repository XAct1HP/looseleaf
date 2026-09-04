-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — three things the first real partner conversation turned up
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Written while preparing to onboard the Ann Arbor Comedy Showcase, which is
--  the first business that will use any of this for real. All three are
--  defects of the same kind: something that works exactly as written, and is
--  wrong about the world it will meet.
--
--    1. The credit ladder's bottom rung was $25 — sixteen redemptions. A
--       venue with two shows a week crosses that in a fortnight, at which
--       point new passes silently stop going out. The ceiling is the right
--       mechanism; the number was set for a coffee shop's quiet Tuesday.
--
--    2. `partner_lookup_pass` had no case for `spend_threshold`, so the one
--       screen where the wording has to be exact — a phone held by somebody
--       with a customer in front of them — fell through to the offer's
--       internal title.
--
--    3. An invitation was created and then nobody was told. `partner_invite_notice`
--       is the read the mailer needs, and it is a *read*: it grants nothing,
--       creates nothing, and refuses anybody who could not have sent the
--       invitation in the first place.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
--  1 · The ladder, rescaled
-- ═══════════════════════════════════════════════════════════════════════════
--
--  The shape is unchanged and deliberately so — four rungs, each roughly two
--  to three times the last, climbing on invoices actually paid. What changes
--  is where the bottom sits.
--
--  The bottom rung has to clear a *plausible first month*, because a new
--  partner cannot have paid an invoice yet by definition: they are stuck on
--  this rung for a whole billing cycle no matter how well they trade. $25 did
--  not clear a first month for anything busier than a café, and the failure
--  was invisible from the partner's side — their offer simply stopped being
--  recommended, with the explanation sitting on a Billing page they had no
--  reason to open.
--
--  $75 is fifty redemptions. That is a real month for a small venue and it is
--  still a small number to be exposed to for one billing cycle on an unknown
--  business, which is the trade this table exists to make.
--
--  Grace bands move with the limits: the band is what keeps a student holding
--  a valid pass from being turned away at a counter over somebody else's
--  unpaid invoice, so it has to stay proportional to how fast passes are
--  being handed out.
--
--  Tuning this is an UPDATE, which is the point of the table. It is not a
--  deploy and it is not a code change.

update partner_credit_tiers set
  limit_cents = 7500,
  grace_cents = 2500,
  blurb = 'Everyone starts here. Roughly fifty redemptions before the first invoice has to clear.'
where id = 'new';

update partner_credit_tiers set
  limit_cents = 20000,
  grace_cents = 5000
where id = 'known';

update partner_credit_tiers set
  limit_cents = 50000,
  grace_cents = 10000
where id = 'trusted';

update partner_credit_tiers set
  limit_cents = 120000,
  grace_cents = 25000
where id = 'anchor';

--  The thresholds for *climbing* are left alone on purpose. They are counts
--  of trust demonstrated — one invoice, three invoices, six — and raising the
--  ceilings does not make a partner any more or less proven.


-- ═══════════════════════════════════════════════════════════════════════════
--  2 · What the counter screen says
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Rebased on the 20260822120000 definition, which is the last one — the
--  20260820130000 text predates the permission model and starting from it
--  would quietly delete the `partner_can(p, 'scan')` check.
--
--  Two cases added. `spend_threshold` had none at all, which is how the
--  dashboard came to say "$5 off $30+" while the person applying the discount
--  read the offer's internal name. `package` is spelled out rather than left
--  to the fallthrough, because a couple package is precisely the kind of offer
--  whose whole meaning lives in its description.
--
--  The fallthrough stays as it was for `custom` and for anything added later:
--  an unrecognised type must read as *something the business wrote*, never as
--  a blank.

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
  if not public.partner_can(p_partner, 'scan') then
    raise exception 'Not authorised';
  end if;
  if not public.partner_has(p_partner, 'redemption') then
    raise exception 'Date Passes are not part of this plan.';
  end if;

  if v_code <> '' and left(v_code, 3) <> 'LL-' then v_code := 'LL-' || v_code; end if;

  select * into dp from date_passes where code = v_code;

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
      when 'percent_off'     then o.percent_off || '% off'
      when 'amount_off'      then '$' || (o.amount_off_cents / 100.0)::numeric(10,2) || ' off'
      when 'free_item'       then 'Free ' || coalesce(o.free_item, 'treat')
      when 'bogo'            then 'Buy one, get one'
      when 'spend_threshold' then '$' || (o.amount_off_cents / 100.0)::numeric(10,2)
                                  || ' off $' || (o.min_spend_cents / 100.0)::numeric(10,2)
                                  || ' or more'
      when 'package'         then coalesce(o.description, o.title)
      else coalesce(o.description, o.title)
    end,
    o.terms,
    dp.status, dp.expires_at, dp.redeemed_at, o.multi_use;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  3 · Enough to send an invitation email, and not one field more
-- ═══════════════════════════════════════════════════════════════════════════
--
--  The mailer runs in an edge function because Looseleaf is a static site with
--  no server, and a Resend key must never reach a browser. That function needs
--  to know who to write to and what to say. This is that read, and its shape
--  matters:
--
--    · It is gated on `partner_can(partner, 'team')` — the same permission
--      that created the invitation. Somebody who could not have invited this
--      person cannot use the mailer to find out that they were invited.
--
--    · It returns the address, the role, the business name and the expiry.
--      No invite token, no id beyond the one the caller already had, nothing
--      that could be forwarded into access. An invitation is still accepted by
--      `accept_partner_invite()`, against the address in the invitee's own
--      token — this function does not widen that by a millimetre.
--
--    · An accepted or expired invitation returns nothing. Re-sending mail for
--      an invitation that has already been used is at best noise and at worst
--      a nudge toward a door that is no longer there.
--
--  Note what is *not* here: any writing. The function cannot mark an
--  invitation as notified, because a mail send that half-worked should leave
--  no trace suggesting it did. Sending again is safe and idempotent from the
--  invitee's point of view — they get another copy of the same thing.

create or replace function public.partner_invite_notice(p_invite uuid)
returns table (
  invite_email text,
  invite_role  partner_role,
  partner_name text,
  expires_at   timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare v_partner uuid;
begin
  select i.partner_id into v_partner
    from partner_invites i
   where i.id = p_invite
     and i.accepted_at is null
     and i.expires_at > now();

  if v_partner is null then
    raise exception 'That invitation is no longer open.';
  end if;

  if not public.partner_can(v_partner, 'team') then
    raise exception 'Not authorised';
  end if;

  return query
    select i.email, i.role, p.name, i.expires_at
      from partner_invites i
      join partners p on p.id = i.partner_id
     where i.id = p_invite;
end;
$$;

grant execute on function public.partner_invite_notice(uuid) to authenticated;

comment on function public.partner_invite_notice(uuid) is
  'Everything the invitation mailer needs and nothing else. Gated on the team '
  'page, returns no token, and writes nothing.';
