-- ═══════════════════════════════════════════════════════════════════════════
--  Removing things: a business, and an offer
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Both of these existed only as "pause it" until now, which is the right
--  default and the wrong only option. Backstage could suspend a business but
--  not remove one, so a week of test partners sits at the top of the queue
--  forever; a partner could pause an offer but not delete it, so a draft they
--  typed by mistake is theirs for life.
--
--  What makes both of these more than a `delete` is that the rows underneath
--  are the evidence for an invoice. `date_pass_redemptions.offer_id` and
--  `.partner_id` both cascade, so an unguarded delete quietly takes the
--  billing ledger with it — including redemptions somebody has already been
--  charged for. So each one is a function that refuses in exactly that case
--  and says what to do instead.

-- ─── removing a business ──────────────────────────────────────────────────
--  Everything the business has goes: its team, locations, Date Spot, offers,
--  passes, credit row and subscription record, all by cascade. What does not
--  go is the `partner_users` rows — those are people's logins, they may be on
--  another business's team, and a login with no team is harmless.
--
--  It refuses once money has moved. A business you have invoiced is a
--  business whose redemptions are the only record of what that invoice was
--  for, and "we deleted the evidence" is not a position to be in six months
--  later. Suspend does everything removal would do from a student's side.
--
--  Stripe is not touched. If the business had a customer there it stays,
--  which is deliberate: deleting a Stripe customer takes their invoice
--  history with it, and that history is the other half of the same record.

create or replace function public.staff_remove_partner(p_partner uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name    text;
  v_billed  int;
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;

  select name into v_name from partners where id = p_partner;
  if v_name is null then raise exception 'No such business.'; end if;

  select count(*) into v_billed
  from date_pass_redemptions
  where partner_id = p_partner and bill_status in ('invoiced', 'paid');

  if v_billed > 0 then
    raise exception
      '% has % redemption(s) that have been invoiced. Suspend it instead — removing it would delete the ledger those invoices were built from.',
      v_name, v_billed;
  end if;

  delete from partners where id = p_partner;
end;
$$;

-- ─── deleting an offer ────────────────────────────────────────────────────
--  A partner's own power, not a staff one: `partner_can(…, 'offers')` is the
--  same check that lets them write the offer in the first place.
--
--  The refusal is the interesting half. An offer that has ever been redeemed
--  is a line on an invoice, so it cannot be deleted — it can be **ended**,
--  which stops it immediately and keeps it in the history. That is very
--  nearly always what somebody means anyway; "delete" is for the draft with a
--  typo in it.

create or replace function public.delete_offer(p_offer uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_partner uuid;
  v_used    int;
begin
  select partner_id into v_partner from partner_offers where id = p_offer;
  if v_partner is null then raise exception 'That offer no longer exists.'; end if;

  if not public.partner_can(v_partner, 'offers') then
    raise exception 'Not authorised.';
  end if;

  select count(*) into v_used from date_pass_redemptions where offer_id = p_offer;
  if v_used > 0 then
    raise exception
      'This offer has been redeemed % time(s), so it is part of your billing history and cannot be deleted. End it instead — it stops straight away and stays on your records.',
      v_used;
  end if;

  delete from partner_offers where id = p_offer;
end;
$$;

--  What the confirmation sheet needs in order to be honest. Passes are
--  invisible to a partner by design — `date_passes` has no partner select
--  policy at all — so this returns a count and nothing else: no codes, no
--  names, no timestamps, nothing that could be joined back to a person.

create or replace function public.offer_delete_preview(p_offer uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_partner uuid;
begin
  select partner_id into v_partner from partner_offers where id = p_offer;
  if v_partner is null then raise exception 'That offer no longer exists.'; end if;

  if not public.partner_can(v_partner, 'offers') then
    raise exception 'Not authorised.';
  end if;

  return jsonb_build_object(
    'redemptions',
    (select count(*) from date_pass_redemptions where offer_id = p_offer),
    -- Passes somebody is holding right now. Deleting the offer takes these
    -- with it, and being turned away at a counter holding a valid pass is the
    -- one experience this whole product exists to avoid — so the number gets
    -- said out loud before anybody clicks Delete.
    'live_passes',
    (select count(*) from date_passes
      where offer_id = p_offer and status = 'issued' and expires_at > now())
  );
end;
$$;

revoke execute on function public.staff_remove_partner(uuid) from anon;
revoke execute on function public.delete_offer(uuid) from anon;
revoke execute on function public.offer_delete_preview(uuid) from anon;

grant execute on function public.staff_remove_partner(uuid) to authenticated;
grant execute on function public.delete_offer(uuid) to authenticated;
grant execute on function public.offer_delete_preview(uuid) to authenticated;
