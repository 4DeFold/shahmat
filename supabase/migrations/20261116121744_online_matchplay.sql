-- Preview matchplay: independent of the existing games/rating tables.
-- Only the trusted edge function's service role can call these functions.
create table public.online_games (
  id uuid primary key default gen_random_uuid(),
  white_id uuid not null references auth.users(id) on delete cascade,
  black_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('blitz','rapid','classical','daily')),
  status text not null default 'active' check (status in ('active','finished')),
  result text check (result in ('white_win','black_win','draw')),
  reason text,
  moves jsonb not null default '[]'::jsonb,
  fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  turn text not null default 'w' check (turn in ('w','b')),
  white_ms bigint not null check (white_ms >= 0),
  black_ms bigint not null check (black_ms >= 0),
  turn_started_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  version integer not null default 0,
  check (white_id <> black_id),
  check (jsonb_typeof(moves) = 'array' and jsonb_array_length(moves) <= 2000)
);
create index online_games_white_idx on public.online_games (white_id, created_at desc) where status = 'active';
create index online_games_black_idx on public.online_games (black_id, created_at desc) where status = 'active';
create table public.online_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null check (mode in ('blitz','rapid','classical','daily')),
  queued_at timestamptz not null default clock_timestamp(),
  heartbeat_at timestamptz not null default clock_timestamp()
);
create index online_queue_match_idx on public.online_queue (mode, queued_at);
alter table public.online_games enable row level security;
alter table public.online_queue enable row level security;
revoke all on public.online_games, public.online_queue from public, anon, authenticated;
grant all on public.online_games, public.online_queue to service_role;

-- Refresh a clock and return its authoritative state only to a participant.
create function public.online_snapshot(p_user uuid, p_game uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare g public.online_games%rowtype; elapsed bigint; now_at timestamptz := clock_timestamp();
begin
  select * into g from public.online_games where id = p_game and p_user in (white_id, black_id) for update;
  if not found then return null; end if;
  if g.status = 'active' then
    elapsed := greatest(0, floor(extract(epoch from (now_at - g.turn_started_at)) * 1000)::bigint);
    if (g.turn = 'w' and elapsed >= g.white_ms) or (g.turn = 'b' and elapsed >= g.black_ms) then
      update public.online_games set status = 'finished', result = case
          when g.turn = 'w' and split_part(g.fen, ' ', 1) !~ '[prnbq]' then 'draw'
          when g.turn = 'b' and split_part(g.fen, ' ', 1) !~ '[PRNBQ]' then 'draw'
          when g.turn = 'w' then 'black_win' else 'white_win' end,
        reason = 'timeout', white_ms = case when g.turn = 'w' then 0 else g.white_ms end,
        black_ms = case when g.turn = 'b' then 0 else g.black_ms end,
        finished_at = now_at, version = version + 1 where id = g.id returning * into g;
    end if;
  end if;
  return jsonb_build_object('id',g.id,'white_id',g.white_id,'black_id',g.black_id,'mode',g.mode,'status',g.status,
    'result',g.result,'reason',g.reason,'moves',g.moves,'fen',g.fen,'turn',g.turn,'version',g.version,
    'white_ms',case when g.status = 'active' and g.turn = 'w' then greatest(0,g.white_ms - elapsed) else g.white_ms end,
    'black_ms',case when g.status = 'active' and g.turn = 'b' then greatest(0,g.black_ms - elapsed) else g.black_ms end);
end $$;

-- A global transaction lock serializes queue changes and prevents double pairing.
create function public.online_find(p_user uuid, p_mode text) returns jsonb
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
    return jsonb_build_object('state','matched','game_id',game_id);
  end if;
  insert into public.online_queue(user_id, mode, queued_at, heartbeat_at) values (p_user,p_mode,clock_timestamp(),clock_timestamp())
  on conflict (user_id) do update set mode = excluded.mode,
    queued_at = case when public.online_queue.mode = excluded.mode then public.online_queue.queued_at else excluded.queued_at end,
    heartbeat_at = excluded.heartbeat_at;
  return jsonb_build_object('state','searching');
end $$;
create function public.online_cancel(p_user uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare game_id uuid;
begin
  perform pg_advisory_xact_lock(1870262189);
  delete from public.online_queue where user_id = p_user;
  select id into game_id from public.online_games where status = 'active' and p_user in (white_id,black_id) order by created_at desc limit 1;
  return jsonb_build_object('game_id',game_id);
end $$;
create function public.online_current(p_user uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare game_id uuid;
begin
  select id into game_id from public.online_games where status = 'active' and p_user in (white_id,black_id) order by created_at desc limit 1;
  if game_id is null then return null; end if;
  return public.online_snapshot(p_user, game_id);
end $$;
-- The trusted edge validates the move and submits it with the version it read.
-- The row lock rejects stale requests, wrong turns and moves after flag fall.
create function public.online_commit(p_user uuid, p_game uuid, p_version integer, p_san text, p_fen text, p_next_turn text, p_result text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare g public.online_games%rowtype; elapsed bigint; now_at timestamptz := clock_timestamp();
begin
  select * into g from public.online_games where id = p_game and p_user in (white_id,black_id) for update;
  if not found then return null; end if;
  if g.status <> 'active' or g.version <> p_version then return public.online_snapshot(p_user,p_game); end if;
  if (g.turn = 'w' and g.white_id <> p_user) or (g.turn = 'b' and g.black_id <> p_user) then raise exception 'not your turn'; end if;
  elapsed := greatest(0, floor(extract(epoch from (now_at - g.turn_started_at)) * 1000)::bigint);
  if (g.turn = 'w' and elapsed >= g.white_ms) or (g.turn = 'b' and elapsed >= g.black_ms) then return public.online_snapshot(p_user,p_game); end if;
  if jsonb_array_length(g.moves) >= 2000 then raise exception 'move limit reached'; end if;
  update public.online_games set moves = g.moves || to_jsonb(p_san), fen = p_fen, turn = p_next_turn,
    white_ms = case when g.turn = 'w' then greatest(0,g.white_ms - elapsed) else g.white_ms end,
    black_ms = case when g.turn = 'b' then greatest(0,g.black_ms - elapsed) else g.black_ms end,
    turn_started_at = now_at, status = case when p_result is null then 'active' else 'finished' end,
    result = p_result, reason = p_reason, finished_at = case when p_result is null then null else now_at end,
    version = version + 1 where id = g.id;
  return public.online_snapshot(p_user,p_game);
end $$;
revoke all on function public.online_snapshot(uuid,uuid), public.online_find(uuid,text), public.online_cancel(uuid), public.online_current(uuid), public.online_commit(uuid,uuid,integer,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.online_snapshot(uuid,uuid), public.online_find(uuid,text), public.online_cancel(uuid), public.online_current(uuid), public.online_commit(uuid,uuid,integer,text,text,text,text,text) to service_role;
