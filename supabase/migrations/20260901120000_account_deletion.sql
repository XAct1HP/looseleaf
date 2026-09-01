-- ═══════════════════════════════════════════════════════════════════════════
--  Leaving: a student's account, a partner's login, a partner's business
-- ═══════════════════════════════════════════════════════════════════════════
--
--  The Settings sheet has said "Delete permanently" since the first build. In
--  live mode the button called `resetDemo()`, which is `demoRef.current
--  ?.clearState()` on a null — a no-op, followed by a redirect to the
--  homepage. Somebody who wanted to leave got the confirmation, got the
--  redirect, and kept every row they had. A delete button that does nothing is
--  worse than no delete button: the first is a lie, the second is a gap.
--
--  Three different things get deleted in here and they are genuinely
--  different:
--
--    · a student account — the profile and everything hanging off it;
--    · a partner login — one person's access, which may span businesses;
--    · a business — its Date Spot, offers, team, locations, credit row.
--
--  And one thing is never deleted: the ledger. `date_pass_redemptions` is what
--  an invoice was built from, so the rule `staff_remove_partner` already set —
--  a business that has been invoiced can be suspended but not removed —
--  applies unchanged when the business removes itself.
--
--  A *student* leaving doesn't disturb that ledger either, and not by
--  accident: `date_passes.issued_to` was written `on delete set null`, so a
--  pass outlives the person it was issued to while holding no link back to
--  them. That decision is the reason `delete_my_account()` below can be four
--  statements instead of a reconciliation.
--
--  Two tables did have to change, both for the same reason — a row that is
--  *about* someone should not vanish when they leave, if somebody else still
--  needs it.

-- ─── a report outlives the person it is about ─────────────────────────────
--  `reports.reported_id` cascaded, which meant deleting your account deleted
--  every report against you. That is a door: be reported, delete, sign up
--  again, arrive with a clean queue and the evidence gone. Staff also lose the
--  ability to see that a name has come up before.
--
--  So both ends become `set null`. The report keeps its reason, its date, and
--  its triage state; the person on either end simply resolves to nothing.
--  Backstage already renders this correctly — `r.reported?.first_name ??
--  'Unknown'` was written defensively and now has a case that reaches it.

alter table reports alter column reporter_id drop not null;
alter table reports alter column reported_id drop not null;

alter table reports drop constraint if exists reports_reporter_id_fkey;
alter table reports add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references profiles (id) on delete set null;

alter table reports drop constraint if exists reports_reported_id_fkey;
alter table reports add constraint reports_reported_id_fkey
  foreign key (reported_id) references profiles (id) on delete set null;

-- ─── a partner's numbers don't shrink because a student left ──────────────
--  `recommendation_events.viewer` cascaded too, so one student deleting their
--  account quietly removed impressions from every business they had ever been
--  shown. A partner's Analytics page would show last month's total falling,
--  for a month that already happened. We tell partners those counts are real;
--  a count that revises itself downwards isn't.
--
--  Nulling the viewer keeps the event and removes the person, which is the
--  same trade `date_passes.issued_to` already makes. `conversation_id` goes
--  the same way for the same reason — the conversation is cascading away
--  underneath it.

alter table recommendation_events
  drop constraint if exists recommendation_events_viewer_fkey;
alter table recommendation_events add constraint recommendation_events_viewer_fkey
  foreign key (viewer) references profiles (id) on delete set null;

alter table recommendation_events
  drop constraint if exists recommendation_events_conversation_id_fkey;
alter table recommendation_events add constraint recommendation_events_conversation_id_fkey
  foreign key (conversation_id) references conversations (id) on delete set null;

-- ═══════════════════════════════════════════════════════════════════════════
--  A student leaving
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── what the sheet is allowed to promise ─────────────────────────────────
--  The confirmation copy currently says "your profile, matches, and messages"
--  and stops there, which is true but vague enough that nobody can check it.
--  These are the actual numbers, read as the person themselves, so the sheet
--  can say what is about to happen in the shape it is about to happen in.
--
--  `live_passes` is the one worth showing. A Date Pass in hand is a promise
--  made to a business as well as to you, and deleting the account voids it —
--  better to see that before the tap than at a counter.

create or replace function public.delete_my_account_preview()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in.'; end if;

  return jsonb_build_object(
    'matches',     (select count(*) from matches where profile_a = me or profile_b = me),
    'messages',    (select count(*) from messages where sender_id = me),
    'photos',      (select count(*) from profile_photos where profile_id = me),
    'mutuals',     (select count(*) from connections
                     where accepted and (profile_id = me or friend_id = me)),
    'live_passes', (select count(*) from date_passes
                     where issued_to = me and status = 'issued' and expires_at > now())
  );
end;
$$;

-- ─── and the deletion itself ──────────────────────────────────────────────
--  Deliberately not a "soft delete with a flag". Looseleaf already has the
--  thing a soft delete is usually standing in for — pausing — and it is
--  offered directly above this button. Somebody who has read past "pausing is
--  usually what people actually want" and tapped the red one means it.
--
--  What this returns is the list of storage keys the caller still has to
--  clean, because a bucket is not a foreign key: deleting `profile_photos`
--  removes the rows that point at the files and leaves the files. They are
--  collected here, before the delete, and handed back for the edge function to
--  remove with the service role. Doing it in this order means the worst
--  failure is an orphaned object in a private bucket that nothing can now
--  resolve a signed URL for — rather than a half-deleted profile.
--
--  The auth user is not touched here and cannot be: Supabase revoked write
--  access to the `auth` schema, which is the same wall the signup domain hook
--  exists to work around. `functions/delete-account` finishes the job.

create or replace function public.delete_my_account()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  paths  text[];
begin
  if me is null then raise exception 'Not signed in.'; end if;
  if not exists (select 1 from profiles where id = me) then
    raise exception 'There is no account here to delete.';
  end if;

  select coalesce(array_agg(storage_path), '{}')
    into paths
  from profile_photos
  where profile_id = me and storage_path is not null;

  -- Everything else goes by cascade off this one row: preferences, photos,
  -- prompts, interests, likes in both directions, deck views, matches and the
  -- conversations under them, connections and their threads, blocks, event
  -- interest, tonight, formals, double dates, the survey. The two exceptions
  -- are handled above — a report keeps its shape, an impression keeps its
  -- count.
  delete from profiles where id = me;

  return jsonb_build_object('storage_paths', to_jsonb(paths));
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  A business leaving
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── the same refusal staff get, for the same reason ──────────────────────
--  `staff_remove_partner` refuses once a redemption has been invoiced, and
--  says to suspend instead. A business removing itself hits exactly that wall,
--  because the reason has nothing to do with who is asking: the redemptions
--  are the only record of what the invoice was for.
--
--  Owner-only, and not `partner_can(…, 'billing')`. Deleting the business is
--  not a page somebody can be granted — a manager who can fix a declined card
--  should not be able to end the account, and the team screen already draws
--  that line for handing over ownership.

create or replace function public.partner_delete_preview(p_partner uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_partner_owner(p_partner) then
    raise exception 'Only an owner can close a business.';
  end if;

  return jsonb_build_object(
    'billed',      (select count(*) from date_pass_redemptions
                     where partner_id = p_partner and bill_status in ('invoiced', 'paid')),
    'unbilled',    (select count(*) from date_pass_redemptions
                     where partner_id = p_partner and bill_status not in ('invoiced', 'paid')),
    'offers',      (select count(*) from partner_offers where partner_id = p_partner),
    'team',        (select count(*) from partner_members where partner_id = p_partner),
    -- Passes somebody is holding right now, for the same reason
    -- `offer_delete_preview` says it out loud: being turned away at a counter
    -- holding a valid pass is the experience this product exists to avoid.
    'live_passes', (select count(*) from date_passes
                     where partner_id = p_partner and status = 'issued' and expires_at > now())
  );
end;
$$;

create or replace function public.delete_partner_business(p_partner uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name   text;
  v_billed int;
begin
  if not public.is_partner_owner(p_partner) then
    raise exception 'Only an owner can close a business.';
  end if;

  select name into v_name from partners where id = p_partner;
  if v_name is null then raise exception 'That business no longer exists.'; end if;

  select count(*) into v_billed
  from date_pass_redemptions
  where partner_id = p_partner and bill_status in ('invoiced', 'paid');

  if v_billed > 0 then
    raise exception
      '% has % redemption(s) that have been invoiced. Suspend it instead — closing it would delete the ledger those invoices were built from, and a student sees no difference between the two.',
      v_name, v_billed;
  end if;

  -- Not the `partner_users` rows. Those are people's logins; they may be on
  -- another business's team tomorrow, and a login with no team is harmless.
  -- Somebody who wants their login gone as well calls
  -- `delete_my_partner_login()` after this, which is a separate decision and
  -- reads like one on screen.
  delete from partners where id = p_partner;

  -- Media lives under <partner-id>/ in a public bucket and is the caller's to
  -- clear; the bucket policy is a path check, so an owner can still remove
  -- these after the row is gone.
  return jsonb_build_object('media_prefix', p_partner::text);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  A partner login leaving
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── you cannot leave a business with nobody in it ────────────────────────
--  `remove_partner_member` already refuses to remove the last owner, and the
--  Team screen explains why. Deleting your login is the same act with a bigger
--  blast radius, so it hits the same rule — but it has to check *every*
--  business you own, not just the one you are looking at, and say which ones
--  so the message is actionable rather than a wall.

create or replace function public.partner_login_delete_blockers()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in.'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name))
    from partner_members mine
    join partners p on p.id = mine.partner_id
    where mine.partner_user_id = me
      and mine.role = 'owner'
      and not exists (
        select 1 from partner_members others
        where others.partner_id = mine.partner_id
          and others.partner_user_id <> me
          and others.role = 'owner'
      )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.delete_my_partner_login()
returns void
language plpgsql security definer set search_path = public as $$
declare
  me       uuid := auth.uid();
  stuck    text;
begin
  if me is null then raise exception 'Not signed in.'; end if;

  select string_agg(p.name, ', ' order by p.name) into stuck
  from partner_members mine
  join partners p on p.id = mine.partner_id
  where mine.partner_user_id = me
    and mine.role = 'owner'
    and not exists (
      select 1 from partner_members others
      where others.partner_id = mine.partner_id
        and others.partner_user_id <> me
        and others.role = 'owner'
    );

  if stuck is not null then
    raise exception
      'You are the only owner of %. Make someone else an owner, or close the business first — a business with no owner is one nobody can fix.',
      stuck;
  end if;

  -- Team rows cascade. `date_pass_redemptions.redeemed_by` is `set null`, so
  -- the scans this person confirmed stay on the invoice with the name off
  -- them, which is the correct half to keep.
  delete from partner_users where id = me;
end;
$$;

-- ─── grants ───────────────────────────────────────────────────────────────
--  Every one of these reads `auth.uid()` and refuses without it, so `anon`
--  would get an exception rather than an effect — but the revoke is the habit
--  the rest of the schema keeps and there is no reason to break it here.

revoke execute on function public.delete_my_account_preview() from anon;
revoke execute on function public.delete_my_account() from anon;
revoke execute on function public.partner_delete_preview(uuid) from anon;
revoke execute on function public.delete_partner_business(uuid) from anon;
revoke execute on function public.partner_login_delete_blockers() from anon;
revoke execute on function public.delete_my_partner_login() from anon;

grant execute on function public.delete_my_account_preview() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.partner_delete_preview(uuid) to authenticated;
grant execute on function public.delete_partner_business(uuid) to authenticated;
grant execute on function public.partner_login_delete_blockers() to authenticated;
grant execute on function public.delete_my_partner_login() to authenticated;

comment on function public.delete_my_account() is
  'Deletes the calling student''s profile and everything cascading from it. Returns the storage keys the caller must still remove. Does not touch auth.users — functions/delete-account does that.';
comment on function public.delete_partner_business(uuid) is
  'Owner-only. Refuses once any redemption has been invoiced, exactly as staff_remove_partner does.';
comment on function public.delete_my_partner_login() is
  'Deletes the calling partner user. Refuses while they are the sole owner of any business.';
