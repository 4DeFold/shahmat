-- Spectators receive only public display names and board state; no account IDs,
-- presence, private profile media or write access. These functions never tick
-- or finalize a clock: matchplay remains the authoritative game service.
create function public.spectator_games(p_offset integer default 0)
returns table(id uuid, white_name text, black_name text, mode text, move_count integer)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 return query select g.id, w.username::text, b.username::text, g.mode, jsonb_array_length(g.moves)
 from public.online_games g join public.profiles w on w.id=g.white_id join public.profiles b on b.id=g.black_id
 where g.status='active' and clock_timestamp() < g.turn_started_at + (case when g.turn='w' then g.white_ms else g.black_ms end * interval '1 millisecond')
 order by g.created_at desc,g.id limit 50 offset greatest(0,least(coalesce(p_offset,0),10000));
end $$;
create function public.spectator_game(p_game uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 select jsonb_build_object('id',g.id,'white_name',w.username,'black_name',b.username,'mode',g.mode,'status',g.status,
  'result',g.result,'reason',g.reason,'moves',g.moves,'turn',g.turn,'version',g.version,
  'white_ms',case when g.status='active' and g.turn='w' then greatest(0,g.white_ms-floor(extract(epoch from (clock_timestamp()-g.turn_started_at))*1000)::bigint) else g.white_ms end,
  'black_ms',case when g.status='active' and g.turn='b' then greatest(0,g.black_ms-floor(extract(epoch from (clock_timestamp()-g.turn_started_at))*1000)::bigint) else g.black_ms end,
  'white_yar',coalesce(wr.yar,1000),'black_yar',coalesce(br.yar,1000)) into result
 from public.online_games g join public.profiles w on w.id=g.white_id join public.profiles b on b.id=g.black_id
 left join public.yar_mode_ratings wr on wr.user_id=g.white_id and wr.mode=g.mode
 left join public.yar_mode_ratings br on br.user_id=g.black_id and br.mode=g.mode
 where g.id=p_game and (g.status='active' or (g.status='finished' and g.finished_at>clock_timestamp()-interval '10 minutes'));
 return result;
end $$;
revoke all on function public.spectator_games(integer), public.spectator_game(uuid) from public,anon,authenticated;
grant execute on function public.spectator_games(integer), public.spectator_game(uuid) to authenticated;
