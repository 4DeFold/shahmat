-- Add game presence and actions without altering existing game or queue tables.
create table public.online_presence (user_id uuid primary key references auth.users(id) on delete cascade, last_seen timestamptz not null);
alter table public.online_presence enable row level security;
revoke all on public.online_presence from public, anon, authenticated;
grant all on public.online_presence to service_role;
create function public.online_heartbeat(p_user uuid) returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into public.online_presence(user_id, last_seen) values (p_user, clock_timestamp())
  on conflict(user_id) do update set last_seen = excluded.last_seen;
end $$;
create function public.online_match_snapshot(p_user uuid, p_game uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare snap jsonb; g public.online_games%rowtype; last_seen timestamptz; opponent uuid; now_at timestamptz;
begin
  snap := public.online_snapshot(p_user, p_game);
  if snap is null then return null; end if;
  select * into g from public.online_games where id = p_game;
  opponent := case when g.white_id = p_user then g.black_id else g.white_id end;
  select p.last_seen into last_seen from public.online_presence p where p.user_id = opponent;
  now_at := clock_timestamp();
  return snap || jsonb_build_object(
    'opponent_offline', g.status = 'active' and last_seen is not null and last_seen >= g.created_at and last_seen < now_at - interval '60 seconds',
    'game_age_ms', greatest(0, floor(extract(epoch from (now_at - g.created_at)) * 1000)::bigint)
  );
end $$;
create function public.online_finish(p_user uuid, p_game uuid, p_action text) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare g public.online_games%rowtype; snap jsonb; seen timestamptz; opponent uuid; now_at timestamptz; final_result text;
begin
  if p_action not in ('resign','offline_win','offline_draw') then raise exception 'invalid action'; end if;
  select * into g from public.online_games where id = p_game and p_user in (white_id, black_id) for update;
  if not found then return null; end if;
  snap := public.online_snapshot(p_user,p_game);
  if snap->>'status' <> 'active' then return public.online_match_snapshot(p_user,p_game); end if;
  now_at := clock_timestamp();
  if p_action <> 'resign' then
    opponent := case when g.white_id = p_user then g.black_id else g.white_id end;
    select p.last_seen into seen from public.online_presence p where p.user_id = opponent for update;
    if seen is null or seen < g.created_at or seen >= now_at - interval '60 seconds' then
      return public.online_match_snapshot(p_user,p_game);
    end if;
  end if;
  final_result := case when p_action = 'offline_draw' then 'draw'
    when (p_action = 'resign' and g.white_id = p_user) or (p_action = 'offline_win' and g.black_id = p_user) then 'black_win'
    else 'white_win' end;
  update public.online_games set status='finished', result=final_result,
    reason=case when p_action='resign' then 'resignation' else 'opponent_offline' end,
    white_ms=(snap->>'white_ms')::bigint, black_ms=(snap->>'black_ms')::bigint,
    finished_at=now_at, version=version+1 where id=g.id;
  return public.online_match_snapshot(p_user,p_game);
end $$;
revoke all on function public.online_heartbeat(uuid), public.online_match_snapshot(uuid,uuid), public.online_finish(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.online_heartbeat(uuid), public.online_match_snapshot(uuid,uuid), public.online_finish(uuid,uuid,text) to service_role;

-- Preserve matchmaking behavior and seed presence only for newly paired games.
create or replace function public.online_find(p_user uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare opponent uuid; game_id uuid; initial_ms bigint; g record;
begin
  initial_ms := case p_mode when 'blitz' then 180000 when 'rapid' then 600000 when 'classical' then 3600000 when 'daily' then 86400000 else null end;
  if p_user is null or initial_ms is null then raise exception 'invalid request'; end if;
  perform pg_advisory_xact_lock(1870262189);
  -- Finalize any expired game for this player before looking for a new match.
  for g in select id from public.online_games where status = 'active' and p_user in (white_id, black_id) loop
    perform public.online_snapshot(p_user, g.id);
  end loop;
  select id into game_id from public.online_games where status = 'active' and p_user in (white_id, black_id) order by created_at desc limit 1;
  if game_id is not null then
    delete from public.online_queue where user_id = p_user;
    return jsonb_build_object('state','matched','game_id',game_id);
  end if;
  delete from public.online_queue where heartbeat_at < clock_timestamp() - interval '30 seconds';
  select user_id into opponent from public.online_queue where mode = p_mode and user_id <> p_user order by queued_at limit 1;
  if opponent is not null then
    delete from public.online_queue where user_id in (p_user, opponent);
    insert into public.online_games(white_id, black_id, mode, white_ms, black_ms) values (opponent, p_user, p_mode, initial_ms, initial_ms) returning id into game_id;
    insert into public.online_presence(user_id,last_seen) values (opponent,clock_timestamp()),(p_user,clock_timestamp()) on conflict(user_id) do update set last_seen=excluded.last_seen;
    return jsonb_build_object('state','matched','game_id',game_id);
  end if;
  insert into public.online_queue(user_id, mode, queued_at, heartbeat_at) values (p_user,p_mode,clock_timestamp(),clock_timestamp())
  on conflict (user_id) do update set mode = excluded.mode,
    queued_at = case when public.online_queue.mode = excluded.mode then public.online_queue.queued_at else excluded.queued_at end,
    heartbeat_at = excluded.heartbeat_at;
  return jsonb_build_object('state','searching');
end $$;
