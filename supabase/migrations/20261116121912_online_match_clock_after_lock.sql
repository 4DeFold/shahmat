create or replace function public.online_snapshot(p_user uuid, p_game uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare g public.online_games%rowtype; elapsed bigint; now_at timestamptz;
begin
  select * into g from public.online_games where id = p_game and p_user in (white_id, black_id) for update;
  if not found then return null; end if;
  now_at := clock_timestamp();
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
create or replace function public.online_commit(p_user uuid, p_game uuid, p_version integer, p_san text, p_fen text, p_next_turn text, p_result text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare g public.online_games%rowtype; elapsed bigint; now_at timestamptz;
begin
  select * into g from public.online_games where id = p_game and p_user in (white_id,black_id) for update;
  if not found then return null; end if;
  now_at := clock_timestamp();
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
