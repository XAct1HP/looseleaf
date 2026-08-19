-- ═══════════════════════════════════════════════════════════════════════════
--  Mutual connections
--
--  The rule this file exists to enforce: you are not meant to be able to
--  browse the people using Looseleaf. There is no directory, no member list,
--  no prefix search, no "people you may know". You can only surface someone
--  you already know by name AND by major — two facts you'd only have if you
--  actually know them — and even then all you get back is a reference card:
--  first name, photo, major, year. Enough to be sure you've got the right
--  Grace, and nothing else.
--
--  A connection is a claim about someone else's social life, so it does not
--  count until they say so. Until then it is a request and it is invisible to
--  everyone but the two of you.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── findability ──────────────────────────────────────────────────────────

-- Opt out and you cannot be surfaced by search at all — not "hidden from
-- results", not returned. Settings → Mutuals.
alter table profiles add column if not exists is_findable boolean not null default true;

-- ─── no directory, enforced below the client ──────────────────────────────

-- Until now any signed-in student could read every profile row on their
-- campus. Nothing in the app did that — the deck comes from get_deck() and
-- the only direct read is your own row — but "the client doesn't do it" is
-- not the same as "it can't be done", and a mutuals search only means
-- something if the wider list isn't already readable.
--
-- After this, a profile is readable when it's yours, when the deck would
-- have handed it to you anyway, or when the two of you already have some
-- relationship. Photos, prompts, and interests inherit this automatically —
-- their policies read through the profiles table, so narrowing here narrows
-- all four.
create or replace function public.deck_visible(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles p
    join profile_preferences pref on pref.profile_id = auth.uid()
    join universities u on u.id = public.current_university()
    where p.id = target
      and (u.is_live or public.campus_member_count(u.id) >= u.open_threshold)
      and p.is_paused = false
      and p.onboarded_at is not null
      and p.university_id = u.id
      and p.age between pref.min_age and pref.max_age
      and (
        cardinality(pref.interested_in) = 0
        or 'everyone' = any (pref.interested_in)
        or p.gender = any (pref.interested_in)
      )
      and not public.blocked_between(auth.uid(), p.id)
  );
$$;

create or replace function public.knows(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from likes l
    where (l.from_profile = auth.uid() and l.to_profile = target)
       or (l.to_profile = auth.uid() and l.from_profile = target)
  )
  or public.is_matched_with(target)
  or exists (
    select 1 from connections c
    where (c.profile_id = auth.uid() and c.friend_id = target)
       or (c.friend_id = auth.uid() and c.profile_id = target)
  )
  or exists (
    select 1 from deck_views v where v.profile_id = auth.uid() and v.seen_id = target
  );
$$;

drop policy if exists "profiles: see yourself and your campus" on profiles;
drop policy if exists "profiles: see yourself, your campus, or everything if staff" on profiles;
drop policy if exists "profiles: yourself, your deck, and people you know" on profiles;
create policy "profiles: yourself, your deck, and people you know"
on profiles for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (
    is_paused = false
    and university_id = public.current_university()
    and not public.blocked_between(auth.uid(), id)
    and (public.deck_visible(id) or public.knows(id))
  )
);

-- ─── connections ──────────────────────────────────────────────────────────

alter table connections add column if not exists responded_at timestamptz;

-- One row per pair, whichever direction it was asked in. Without this, A→B
-- and B→A could both exist and the pair would be "mutual" twice.
create unique index if not exists connections_pair_uidx
  on connections (least(profile_id, friend_id), greatest(profile_id, friend_id));

-- The requester's own policy ("connections: manage yours") already covers
-- their side. These two give the person who was asked a say.
drop policy if exists "connections: answer a request sent to you" on connections;
create policy "connections: answer a request sent to you" on connections
for update to authenticated
using (friend_id = auth.uid())
with check (friend_id = auth.uid());

drop policy if exists "connections: leave one you're in" on connections;
create policy "connections: leave one you're in" on connections
for delete to authenticated
using (profile_id = auth.uid() or friend_id = auth.uid());

-- ─── the search ───────────────────────────────────────────────────────────

-- Both halves are required and both are exact. No prefix matching, no
-- similarity, no "did you mean" — those are what turn a lookup into a
-- directory. Capped at 8 because a real first-name+major pair should return
-- one or two people; anything more is a common name, not a browse.
create or replace function public.find_mutual_candidates(p_first_name text, p_major text)
returns table (
  id           uuid,
  first_name   text,
  major        text,
  grad_year    text,
  storage_path text,
  scene        text,
  state        text
)
language plpgsql stable security definer set search_path = public as $$
declare
  n text := btrim(coalesce(p_first_name, ''));
  m text := btrim(coalesce(p_major, ''));
begin
  if length(n) < 2 or length(m) < 3 then
    raise exception 'Give both a first name and a major.' using errcode = '22023';
  end if;

  return query
  select
    p.id,
    p.first_name,
    p.major,
    p.grad_year,
    ph.storage_path,
    ph.scene,
    case
      when c.id is null      then 'none'
      when c.accepted        then 'connected'
      when c.profile_id = auth.uid() then 'sent'
      else 'incoming'
    end as state
  from profiles p
  left join lateral (
    select pp.storage_path, pp.scene
    from profile_photos pp
    where pp.profile_id = p.id
    order by pp.position
    limit 1
  ) ph on true
  left join connections c
    on least(c.profile_id, c.friend_id)    = least(p.id, auth.uid())
   and greatest(c.profile_id, c.friend_id) = greatest(p.id, auth.uid())
  where p.id <> auth.uid()
    and p.university_id = public.current_university()
    and p.onboarded_at is not null
    and p.is_paused = false
    and p.is_findable = true
    and lower(p.first_name) = lower(n)
    and lower(p.major) = lower(m)
    and not public.blocked_between(auth.uid(), p.id)
  order by p.grad_year, p.created_at
  limit 8;
end;
$$;

-- ─── asking, answering, leaving ───────────────────────────────────────────

create or replace function public.request_connection(target uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing connections%rowtype;
  new_id   uuid;
begin
  if target = auth.uid() then
    raise exception 'You cannot add yourself.' using errcode = '22023';
  end if;

  -- Same gate as the search, so a guessed id gets you no further than a
  -- lookup would have.
  if not exists (
    select 1 from profiles p
    where p.id = target
      and p.university_id = public.current_university()
      and p.onboarded_at is not null
      and p.is_paused = false
      and p.is_findable = true
      and not public.blocked_between(auth.uid(), p.id)
  ) then
    raise exception 'That person is not available.' using errcode = '22023';
  end if;

  select * into existing from connections c
  where least(c.profile_id, c.friend_id)    = least(auth.uid(), target)
    and greatest(c.profile_id, c.friend_id) = greatest(auth.uid(), target);

  if found then
    -- They asked you first. Adding them back is the same as saying yes.
    if not existing.accepted and existing.friend_id = auth.uid() then
      update connections
         set accepted = true, responded_at = now()
       where id = existing.id;
    end if;
    return existing.id;
  end if;

  insert into connections (profile_id, friend_id, accepted)
  values (auth.uid(), target, false)
  returning id into new_id;

  return new_id;
end;
$$;

-- Declining deletes the row rather than remembering the "no". A stored
-- refusal is a thing that can leak; a missing row just means nothing happened.
-- The remedy for being asked repeatedly is findability off, or a block.
create or replace function public.respond_to_connection(conn uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare found_id uuid;
begin
  select id into found_id from connections
  where id = conn and friend_id = auth.uid() and accepted = false;

  if found_id is null then
    raise exception 'That request is not yours to answer.' using errcode = '42501';
  end if;

  if accept then
    update connections set accepted = true, responded_at = now() where id = found_id;
  else
    delete from connections where id = found_id;
  end if;
end;
$$;

-- ─── who you two both know ────────────────────────────────────────────────

-- An intersection, never a list. You can learn that you and Grace both know
-- Ben; you can never learn who else Grace knows.
create or replace function public.mutuals_with(other uuid)
returns table (
  id           uuid,
  first_name   text,
  major        text,
  grad_year    text,
  storage_path text,
  scene        text
)
language sql stable security definer set search_path = public as $$
  with mine as (
    select case when profile_id = auth.uid() then friend_id else profile_id end as pid
    from connections
    where accepted and (profile_id = auth.uid() or friend_id = auth.uid())
  ),
  theirs as (
    select case when profile_id = other then friend_id else profile_id end as pid
    from connections
    where accepted and (profile_id = other or friend_id = other)
  )
  select p.id, p.first_name, p.major, p.grad_year, ph.storage_path, ph.scene
  from profiles p
  join mine  on mine.pid = p.id
  join theirs on theirs.pid = p.id
  left join lateral (
    select pp.storage_path, pp.scene from profile_photos pp
    where pp.profile_id = p.id order by pp.position limit 1
  ) ph on true
  where p.id <> auth.uid() and p.id <> other;
$$;

-- Your own accepted connections, plus the requests on either side.
create or replace function public.my_connections()
returns table (
  connection_id uuid,
  id            uuid,
  first_name    text,
  major         text,
  grad_year     text,
  storage_path  text,
  scene         text,
  state         text,
  created_at    timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    p.id,
    p.first_name,
    p.major,
    p.grad_year,
    ph.storage_path,
    ph.scene,
    case
      when c.accepted then 'connected'
      when c.profile_id = auth.uid() then 'sent'
      else 'incoming'
    end,
    c.created_at
  from connections c
  join profiles p
    on p.id = case when c.profile_id = auth.uid() then c.friend_id else c.profile_id end
  left join lateral (
    select pp.storage_path, pp.scene from profile_photos pp
    where pp.profile_id = p.id order by pp.position limit 1
  ) ph on true
  where c.profile_id = auth.uid() or c.friend_id = auth.uid()
  order by c.accepted, c.created_at desc;
$$;

-- ─── talking to a mutual ──────────────────────────────────────────────────

-- A conversation now belongs to exactly one of: a match, or a mutual
-- connection. Same table, same messages, same policies — a mutual thread is
-- not a second messaging system.
alter table conversations alter column match_id drop not null;
alter table conversations add column if not exists connection_id uuid unique
  references connections (id) on delete cascade;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conversations_one_subject') then
    alter table conversations
      add constraint conversations_one_subject
      check (num_nonnulls(match_id, connection_id) = 1);
  end if;
end $$;

-- Membership now reads either side. Note the `n.accepted` join condition:
-- a pending request has no thread, so asking to connect can't be used to
-- open a channel to someone who hasn't agreed to one.
create or replace function public.in_conversation(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.conversations c
    left join public.matches m     on m.id = c.match_id
    left join public.connections n on n.id = c.connection_id and n.accepted
    where c.id = conv
      and (
        m.profile_a = auth.uid() or m.profile_b = auth.uid()
        or n.profile_id = auth.uid() or n.friend_id = auth.uid()
      )
  );
$$;

create or replace function public.open_mutual_thread(other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  conn uuid;
  conv uuid;
begin
  select c.id into conn from connections c
  where c.accepted
    and (
      (c.profile_id = auth.uid() and c.friend_id = other)
      or (c.friend_id = auth.uid() and c.profile_id = other)
    );

  if conn is null then
    raise exception 'You are not connected to that person.' using errcode = '42501';
  end if;

  select id into conv from conversations where connection_id = conn;
  if conv is null then
    insert into conversations (connection_id) values (conn) returning id into conv;
  end if;
  return conv;
end;
$$;

-- ─── sending someone a reference card ─────────────────────────────────────

-- A shared profile is a column on the message, not a new message type: the
-- bubble is still an ordinary message, it just carries a pointer to a person.
-- It is deliberately not a forwarded profile — the recipient resolves the
-- pointer through person_reference() below, which returns four display fields
-- and structurally cannot return a fifth.
alter table messages add column if not exists person_ref uuid
  references profiles (id) on delete set null;

-- You can hand someone's card to a mutual. You cannot hand it to a match:
-- that thread is between two people and a third person's photo doesn't belong
-- in it.
create or replace function public.guard_person_ref()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.person_ref is not null then
    if not exists (
      select 1 from conversations c
      where c.id = new.conversation_id and c.connection_id is not null
    ) then
      raise exception 'A profile can only be shared with a mutual.' using errcode = '42501';
    end if;
    if new.person_ref = new.sender_id then
      raise exception 'Share someone else, not yourself.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard_person_ref on messages;
create trigger messages_guard_person_ref
before insert or update on messages
for each row execute function public.guard_person_ref();

create or replace function public.person_reference(p_ids uuid[])
returns table (
  id           uuid,
  first_name   text,
  major        text,
  grad_year    text,
  storage_path text,
  scene        text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.major, p.grad_year, ph.storage_path, ph.scene
  from profiles p
  left join lateral (
    select pp.storage_path, pp.scene from profile_photos pp
    where pp.profile_id = p.id order by pp.position limit 1
  ) ph on true
  where p.id = any (p_ids)
    and p.university_id = public.current_university()
    and not public.blocked_between(auth.uid(), p.id);
$$;
