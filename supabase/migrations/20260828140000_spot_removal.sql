-- ═══════════════════════════════════════════════════════════════════════════
--  Taking a Date Spot down, and the spots nobody is behind any more
-- ═══════════════════════════════════════════════════════════════════════════
--
--  `20260828130000` gave Backstage the spots it adds itself and deliberately
--  stopped there: `is_admin() and partner_id is null`, so a business's own
--  card could not be touched from Backstage at all. That is right about
--  *editing* and wrong about *removing*. A business closes, a photo turns out
--  to be somebody else's, a listing needs to come down this afternoon — that
--  is moderation, and moderation is what Backstage is for. The Events page has
--  had a Remove button since the first week for exactly this reason.
--
--  The distinction this migration keeps is between the two:
--
--   · **Removing is staff work.** Two security-definer RPCs,
--     `staff_set_spot_published()` and `staff_remove_spot()`, each doing one
--     thing, both refusing anybody who is not `is_admin()`.
--   · **Editing is not.** The table policy is unchanged in spirit: Backstage
--     still cannot write a partner's name, note, tags or photos. Row-level
--     security cannot restrict *columns*, so the way to give staff one power
--     and not the other is a function that takes one argument — the same
--     shape `staff_set_paused()` already has for a member's account.
--
--  And the orphans. `date_spots.partner_id` was `on delete set null`, so
--  deleting a business left its listing behind with nothing behind it: still
--  published, still on the page, and — after the last migration — looking
--  exactly like a spot Backstage had added, because both had a null
--  `partner_id`. Two fixes, because either alone leaves a hole:
--
--   1. `on delete cascade`. A business that is gone takes its card with it.
--   2. `origin`, so "we added this" is a fact the row states rather than one
--      inferred from an absence. The staff-edit policy now keys on it, which
--      means an orphaned partner listing can never quietly become editable as
--      though we had written it.

-- ─── where a spot came from ───────────────────────────────────────────────

alter table date_spots add column if not exists origin text not null default 'partner';

alter table date_spots drop constraint if exists date_spots_origin_check;
alter table date_spots add constraint date_spots_origin_check
  check (origin in ('partner', 'backstage'));

--  Backfill: every partner-less spot at this point was added through
--  Backstage → Spots and carries the staff member who added it. The seeded
--  businesses that used to muddy this were deleted in 20260828130000.
update date_spots set origin = 'backstage'
 where partner_id is null and added_by is not null and origin <> 'backstage';

comment on column date_spots.origin is
  'partner — the business''s own listing, theirs to write. backstage — added '
  'by staff in Backstage → Spots. Not inferred from a null partner_id: a '
  'business deleted by hand used to leave a listing that looked identical.';

-- ─── a business that is gone takes its listing with it ────────────────────

alter table date_spots drop constraint if exists date_spots_partner_id_fkey;
alter table date_spots add constraint date_spots_partner_id_fkey
  foreign key (partner_id) references partners (id) on delete cascade;

--  Anything already orphaned by the old rule. `origin = 'partner'` with no
--  partner is precisely that: a card whose business no longer exists, which
--  nobody can update, honour, or be invoiced for.
delete from date_spots where partner_id is null and origin = 'partner';

-- ─── the staff-edit policy now keys on origin, not on an absence ──────────

drop policy if exists "spots: staff manage the ones we add" on date_spots;
create policy "spots: staff manage the ones we add" on date_spots
  for all to authenticated
  using (public.is_admin() and origin = 'backstage')
  with check (
    public.is_admin()
    and origin = 'backstage'
    and partner_id is null
    and not is_sponsored
  );

-- ─── what Backstage sees ──────────────────────────────────────────────────
--  Every spot on every campus, with just enough about the business behind it
--  to decide. `people` is the count on the account: zero means the business
--  exists but nobody can sign in to it, which is worth *seeing* and is
--  deliberately not worth deleting automatically — a paying restaurant whose
--  one manager was removed by accident should not silently lose its listing.
--
--  Nothing here reaches dating data, and it is the only way staff read spots
--  in bulk, so the shape is fixed in one place.

create or replace function public.staff_spots()
returns table (
  id             uuid,
  name           text,
  kind           text,
  note           text,
  date_types     text[],
  walk_minutes   int,
  cover_path     text,
  is_published   boolean,
  suggestable    boolean,
  origin         text,
  partner_id     uuid,
  partner_name   text,
  partner_status partner_status,
  people         int,
  created_at     timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;

  return query
    select d.id, d.name, d.kind, d.note, d.date_types, d.walk_minutes,
           d.cover_path, d.is_published, d.suggestable, d.origin,
           d.partner_id, p.name, p.status,
           (select count(*)::int from partner_members m where m.partner_id = p.id),
           d.created_at
    from date_spots d
    left join partners p on p.id = d.partner_id
    order by (d.partner_id is not null), d.name;
end;
$$;

-- ─── taking one off the page ──────────────────────────────────────────────
--  Reversible, and honest about it: a live partner can put their own card
--  back from their dashboard, because publishing is theirs. The lever that
--  holds is `staff_set_partner_status(…, 'suspended')`, which takes the whole
--  business out of `partner_is_live()` and therefore off every surface. This
--  one is for "not today", not for "never again".

create or replace function public.staff_set_spot_published(p_spot uuid, p_published boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;

  update date_spots
     set is_published = p_published, updated_at = now()
   where id = p_spot;

  if not found then raise exception 'That Date Spot no longer exists.'; end if;
end;
$$;

-- ─── removing one outright ────────────────────────────────────────────────
--  Permanent for a spot we added and for one whose business is gone. For a
--  live partner it is closer to a reset: their dashboard writes a new card the
--  next time they save, which the UI says out loud rather than leaving staff
--  to discover. A date somebody planned around it keeps the plan and loses the
--  spot, as of 20260828130000.

create or replace function public.staff_remove_spot(p_spot uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;

  delete from date_spots where id = p_spot;
  if not found then raise exception 'That Date Spot no longer exists.'; end if;
end;
$$;

revoke execute on function public.staff_spots() from anon;
revoke execute on function public.staff_set_spot_published(uuid, boolean) from anon;
revoke execute on function public.staff_remove_spot(uuid) from anon;

grant execute on function public.staff_spots() to authenticated;
grant execute on function public.staff_set_spot_published(uuid, boolean) to authenticated;
grant execute on function public.staff_remove_spot(uuid) to authenticated;
