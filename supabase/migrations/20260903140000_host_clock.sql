-- ══════════════════════════════════════════════════════════════════════════
--  The host console's clock
--
--  The console was reading the round from `event_state()`, the endpoint every
--  phone polls. But `event_state` is token-addressed: with no participant
--  token it returns the poster and the server time and stops — no round, by
--  design, because that is the branch a stranger who has not typed their name
--  yet gets. A host has no token and never will (they are not in the room's
--  roster), so the console got `round = null` on every poll, `secondsUntil`
--  read 0, and the biggest number on the projector sat at 0:00 for the whole
--  event.
--
--  The fix is to give the host their round through the host endpoint they are
--  already polling, rather than to hand the console a participant token it has
--  no business holding. `host_event_summary` gains three keys:
--
--    now    — the server clock, so the console corrects for a laptop whose
--             own clock is off, exactly as a phone does
--    round  — index, starts_at, ends_at. Timing only. No pairings, no
--             seatings, no names: the no-roster rule holds here as everywhere,
--             and this function still structurally cannot name anybody.
--    status — read after the advance below, so a console that ticks past the
--             last planned round sees 'ended' on the same poll the clock
--             stops on rather than one poll later.
--
--  It also calls `advance_event_if_due` and so is no longer `stable`. That is
--  deliberate: advancing was previously carried entirely by the phones in the
--  room, which is fine when there are forty of them and wrong at exactly the
--  moment it matters — a host testing the console alone, or a room whose wifi
--  has dropped, would watch a round overrun forever. The advisory lock inside
--  `advance_event_if_due` already makes concurrent callers safe, so the
--  console simply becomes one more caller.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.host_event_summary(p_event uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_out   jsonb;
  v_round live_event_rounds;
  v_status text;
begin
  if not public.event_host_can(p_event) then
    raise exception 'Not your event.';
  end if;

  --  Same call the phones make, for the same reason: the next round should
  --  begin on time whether or not anybody's phone is awake.
  perform public.advance_event_if_due(p_event);

  select status into v_status from live_events where id = p_event;

  select * into v_round from live_event_rounds
   where event_id = p_event order by index desc limit 1;

  select jsonb_build_object(
    'now',        now(),
    'status',     v_status,
    'round',      case when v_round.id is null then null else jsonb_build_object(
                    'index', v_round.index,
                    'starts_at', v_round.starts_at,
                    'ends_at', v_round.ends_at
                  ) end,
    'registered', (select count(*) from live_event_participants where event_id = p_event),
    'here',       (select count(*) from live_event_participants
                    where event_id = p_event and state in ('waiting', 'active')),
    'left',       (select count(*) from live_event_participants
                    where event_id = p_event and state = 'left'),
    'rounds',     (select count(*) from live_event_rounds where event_id = p_event),
    'conversations', (select count(*) from live_event_pairings
                       where event_id = p_event and bye = false),
    'seatings',   (select count(*) from live_event_seatings where event_id = p_event),
    'stations',   (select count(*) from live_event_stations where event_id = p_event),
    'byes',       (select count(*) from live_event_pairings
                    where event_id = p_event and bye = true),
    'matches',    (select count(*) from live_event_matches where event_id = p_event),
    'members',    (select count(*) from live_event_participants
                    where event_id = p_event and profile_id is not null)
  ) into v_out;

  return v_out;
end;
$$;

comment on function public.host_event_summary(uuid) is
  'Counts, the server clock, and the current round''s timing — for the host '
  'console. Aggregates only: it cannot name a participant or surface a vote.';
