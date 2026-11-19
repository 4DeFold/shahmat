-- Extend the public live list with position snapshots for board previews.
drop function public.spectator_games(integer);
create function public.spectator_games(p_offset integer default 0)
returns table(id uuid, white_name text, black_name text, mode text, move_count integer, fen text, moves jsonb, version integer)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 return query select g.id, w.username::text, b.username::text, g.mode, jsonb_array_length(g.moves),g.fen,g.moves,g.version
 from public.online_games g join public.profiles w on w.id=g.white_id join public.profiles b on b.id=g.black_id
 where g.status='active' and clock_timestamp() < g.turn_started_at + (case when g.turn='w' then g.white_ms else g.black_ms end * interval '1 millisecond')
 order by g.created_at desc,g.id limit 50 offset greatest(0,least(coalesce(p_offset,0),10000));
end $$;
revoke all on function public.spectator_games(integer) from public,anon,authenticated;
grant execute on function public.spectator_games(integer) to authenticated;
