-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  A theme taken from the host's logo                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
--  `accent` is a key into a fixed palette of six colours. That palette exists
--  for a reason worth restating: a host chooses a *colour*, never a contrast
--  ratio, and a free hex field means somebody eventually ships an event whose
--  round timer is unreadable in a dim room.
--
--  This adds a second source for the same guarantee. When a club uploads a
--  logo the client pulls the dominant hues out of it and then **re-fits the
--  lightness until each role passes a real contrast check** — see
--  `src/lib/logoTheme.js`. What lands here is already checked; the column is
--  storage, not policy.
--
--  Kept as one jsonb rather than four columns because it is one thing that is
--  always written together, and because the shape will change again — a
--  create-or-replace can add a key to a jsonb payload, and cannot add a column
--  to a return type.
--
--    { ink, plate, wash, accent2, seed }
--
--  `accent` stays as the fallback and as what a host gets when they pick from
--  the palette by hand, so nothing breaks for an event with no logo.

alter table live_events
  add column if not exists theme jsonb;

comment on column live_events.theme is
  'Derived from the host logo and contrast-checked client-side before it is '
  'written. Null means fall back to the `accent` palette key.';

--  Clearing it needs to be possible, so this is one of the few patch keys that
--  reads a null through rather than treating null as "leave alone" —
--  `p_patch ? ''theme''` is the test, not `p_patch ->> ''theme''`.
create or replace function public.update_live_event(
  p_event uuid,
  p_patch jsonb
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_status live_event_status; v_started timestamptz; v_format text;
begin
  if not public.event_host_can(p_event) then
    raise exception 'Not your event.';
  end if;

  select status, started_at, format into v_status, v_started, v_format
  from live_events where id = p_event;

  if v_status in ('ended', 'killed') then
    raise exception 'That event is over.';
  end if;

  if p_patch ? 'format'
     and (p_patch ->> 'format') is distinct from v_format
     and v_started is not null then
    raise exception 'The format is fixed once the event has started.';
  end if;

  update live_events set
    title          = coalesce(p_patch ->> 'title', title),
    blurb          = coalesce(p_patch ->> 'blurb', blurb),
    venue_label    = coalesce(p_patch ->> 'venue_label', venue_label),
    starts_at      = coalesce((p_patch ->> 'starts_at')::timestamptz, starts_at),
    format         = coalesce(p_patch ->> 'format', format),
    round_seconds  = coalesce((p_patch ->> 'round_seconds')::int, round_seconds),
    break_seconds  = coalesce((p_patch ->> 'break_seconds')::int, break_seconds),
    planned_rounds = case when p_patch ? 'planned_rounds'
                          then (p_patch ->> 'planned_rounds')::int else planned_rounds end,
    advance        = coalesce(p_patch ->> 'advance', advance),
    pairing_mode   = coalesce(p_patch ->> 'pairing_mode', pairing_mode),
    split_field_id = case when p_patch ? 'split_field_id'
                          then (p_patch ->> 'split_field_id')::uuid else split_field_id end,
    station_count  = case when p_patch ? 'station_count'
                          then (p_patch ->> 'station_count')::int else station_count end,
    likes_enabled  = coalesce((p_patch ->> 'likes_enabled')::boolean, likes_enabled),
    reveal         = coalesce(p_patch ->> 'reveal', reveal),
    notes_enabled  = coalesce((p_patch ->> 'notes_enabled')::boolean, notes_enabled),
    join_opens     = coalesce(p_patch ->> 'join_opens', join_opens),
    logo_path      = case when p_patch ? 'logo_path'
                          then p_patch ->> 'logo_path' else logo_path end,
    accent         = coalesce(p_patch ->> 'accent', accent),
    theme          = case when p_patch ? 'theme'
                          then nullif(p_patch -> 'theme', 'null'::jsonb) else theme end,
    welcome_line   = coalesce(p_patch ->> 'welcome_line', welcome_line),
    updated_at     = now()
  where id = p_event;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
--  Both places that hand an event to a phone have to carry it
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.event_preview(p_code text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id,
    'code', e.code,
    'title', e.title,
    'blurb', e.blurb,
    'venue_label', e.venue_label,
    'starts_at', e.starts_at,
    'status', e.status,
    'accent', e.accent,
    'theme', e.theme,
    'logo_path', e.logo_path,
    'welcome_line', e.welcome_line,
    'format', e.format,
    'org_name', (select h.org_name from event_hosts h where h.user_id = e.host_id),
    'join_open', public.event_join_open(e.id),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'label', f.label, 'kind', f.kind,
        'options', f.options, 'required', f.required
      ) order by f.position)
      from live_event_fields f where f.event_id = e.id), '[]'::jsonb)
  )
  from live_events e
  where e.code = upper(trim(p_code))
    and e.status in ('approved', 'running', 'paused', 'ended');
$$;

create or replace function public.event_state(p_code text, p_token uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ev      live_events;
  v_me      live_event_participants;
  v_round   live_event_rounds;
  v_pair    live_event_pairings;
  v_seat    live_event_seatings;
  v_station live_event_stations;
  v_other   live_event_participants;
  v_vote_pair uuid;
  v_vote_name text;
  v_out     jsonb;
  v_revealed boolean;
  v_me_id   uuid;
begin
  select * into v_ev from live_events where code = upper(trim(p_code));
  if not found then raise exception 'No event with that code.'; end if;

  perform public.advance_event_if_due(v_ev.id);
  select * into v_ev from live_events where id = v_ev.id;

  v_me_id := public.participant_for(v_ev.id, p_token);

  if v_me_id is null then
    return jsonb_build_object(
      'event', public.event_preview(v_ev.code),
      'me', null,
      'now', now()
    );
  end if;

  select * into v_me from live_event_participants where id = v_me_id;

  select * into v_round from live_event_rounds
   where event_id = v_ev.id order by index desc limit 1;

  if v_round.id is not null and v_ev.format = 'stations' then
    select * into v_seat from live_event_seatings
     where round_id = v_round.id and participant_id = v_me.id;
    if v_seat.id is not null then
      select * into v_station from live_event_stations where id = v_seat.station_id;
    end if;
  elsif v_round.id is not null then
    select * into v_pair from live_event_pairings
     where round_id = v_round.id
       and (a_participant = v_me.id or b_participant = v_me.id);

    if v_pair.id is not null and not v_pair.bye then
      select * into v_other from live_event_participants
       where id = case when v_pair.a_participant = v_me.id
                       then v_pair.b_participant else v_pair.a_participant end;
    end if;
  end if;

  if v_ev.likes_enabled and v_ev.format = 'pairs' then
    select pr.id,
           (select p2.display_name from live_event_participants p2
             where p2.id = case when pr.a_participant = v_me.id
                                then pr.b_participant else pr.a_participant end)
      into v_vote_pair, v_vote_name
    from live_event_pairings pr
    join live_event_rounds r on r.id = pr.round_id
    where pr.event_id = v_ev.id
      and pr.bye = false
      and (pr.a_participant = v_me.id or pr.b_participant = v_me.id)
      and not exists (
        select 1 from live_event_votes v
        where v.pairing_id = pr.id and v.voter_id = v_me.id
      )
    order by r.index desc limit 1;
  end if;

  v_revealed := v_ev.reveal = 'live'
                or (v_ev.matches_revealed_at is not null and v_ev.reveal <> 'never');

  v_out := jsonb_build_object(
    'now', now(),
    'event', jsonb_build_object(
      'id', v_ev.id, 'code', v_ev.code, 'title', v_ev.title,
      'status', v_ev.status, 'accent', v_ev.accent, 'theme', v_ev.theme,
      'logo_path', v_ev.logo_path,
      'welcome_line', v_ev.welcome_line, 'venue_label', v_ev.venue_label,
      'round_seconds', v_ev.round_seconds, 'break_seconds', v_ev.break_seconds,
      'planned_rounds', v_ev.planned_rounds, 'format', v_ev.format,
      'likes_enabled', v_ev.likes_enabled and v_ev.format = 'pairs',
      'notes_enabled', v_ev.notes_enabled,
      'reveal', v_ev.reveal, 'revealed', v_revealed,
      'broadcast', v_ev.broadcast, 'broadcast_at', v_ev.broadcast_at,
      'org_name', (select h.org_name from event_hosts h where h.user_id = v_ev.host_id)
    ),
    'me', jsonb_build_object(
      'participant_id', v_me.id, 'name', v_me.display_name,
      'badge_no', v_me.badge_no, 'state', v_me.state,
      'has_profile', v_me.profile_id is not null
    ),
    'here', (select count(*) from live_event_participants
              where event_id = v_ev.id and state in ('waiting', 'active')),
    'round', case when v_round.id is null then null else jsonb_build_object(
      'index', v_round.index,
      'starts_at', v_round.starts_at,
      'ends_at', v_round.ends_at,
      'station', case when v_ev.format = 'stations' then v_station.position + 1
                      else v_pair.station end,
      'bye', case when v_ev.format = 'stations' then false
                  else coalesce(v_pair.bye, false) end,
      'pairing_id', v_pair.id,
      'place', case when v_station.id is null then null else jsonb_build_object(
        'label', v_station.label,
        'host_name', v_station.host_name,
        'note', v_station.note,
        'with', (select count(*) - 1 from live_event_seatings sg
                  where sg.round_id = v_round.id and sg.station_id = v_station.id)
      ) end,
      'partner', case when v_other.id is null then null else jsonb_build_object(
        'name', v_other.display_name,
        'badge_no', v_other.badge_no,
        'shown', coalesce((
          select jsonb_agg(jsonb_build_object(
            'label', f.label,
            'value', array_to_string(a.value, ', ')
          ) order by f.position)
          from live_event_answers a
          join live_event_fields f on f.id = a.field_id
          where a.participant_id = v_other.id
            and f.show_to_partner
            and cardinality(a.value) > 0
        ), '[]'::jsonb)
      ) end
    ) end,
    'pending_vote', case when v_vote_pair is null then null else jsonb_build_object(
      'pairing_id', v_vote_pair, 'name', v_vote_name) end,
    'matches', case when not v_revealed then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', other.display_name,
        'both_members', me2.profile_id is not null and other.profile_id is not null,
        'match_id', m.match_id
      ))
      from live_event_matches m
      join live_event_participants me2
        on me2.id = case when m.a_participant = v_me.id then m.a_participant
                         else m.b_participant end
      join live_event_participants other
        on other.id = case when m.a_participant = v_me.id then m.b_participant
                           else m.a_participant end
      where m.event_id = v_ev.id
        and (m.a_participant = v_me.id or m.b_participant = v_me.id)
    ), '[]'::jsonb) end,
    'met', case when v_ev.format = 'stations'
      then (select count(*) from live_event_seatings sg where sg.participant_id = v_me.id)
      else (select count(*) from live_event_pairings pr
             where pr.event_id = v_ev.id and pr.bye = false
               and (pr.a_participant = v_me.id or pr.b_participant = v_me.id))
      end
  );

  return v_out;
end;
$$;

grant execute on function
  public.event_preview(text),
  public.event_state(text, uuid)
to anon, authenticated;
