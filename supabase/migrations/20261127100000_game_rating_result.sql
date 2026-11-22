-- Applied remotely as 20261122043747; local version follows the lobby migrations.
-- Only the two participants may read the exact recorded rating change of this game.
-- Empty results also cover friendly games and rated games excluded by daily limits.
create function public.rank_game_result(p_game uuid)
returns table(player text, before_yar numeric, after_yar numeric, before_elo numeric, after_elo numeric)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare g public.online_games%rowtype; actor uuid := auth.uid();
begin
 if actor is null then raise exception 'unauthorized'; end if;
 select * into g from public.online_games where id=p_game and actor in (white_id,black_id);
 if not found then raise exception 'game not found'; end if;
 if g.status <> 'finished' or g.game_kind <> 'rated' then return; end if;
 return query select case when h.user_id=actor then 'self' else 'opponent' end,
   h.before_yar,h.after_yar,h.before_elo,h.after_elo
 from public.yar_history h
 where h.game_id=g.id and h.user_id in (g.white_id,g.black_id);
end $$;
revoke all on function public.rank_game_result(uuid) from public,anon,authenticated;
grant execute on function public.rank_game_result(uuid) to authenticated;
