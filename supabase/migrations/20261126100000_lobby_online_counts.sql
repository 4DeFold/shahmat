-- Aggregate only currently searching or connected players in ongoing games.
-- One row per pool; no player identity is exposed to the client.
create function public.play_lobby_online_counts()
returns table(game_kind text, mode text, time_control text, online bigint)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 return query
 with current_players as (
  select q.user_id, q.game_kind, q.mode, regexp_replace(q.time_control,'\+0$','') as time_control
    from public.online_queue q where q.heartbeat_at >= statement_timestamp() - interval '30 seconds'
  union
  select p.user_id, g.game_kind, g.mode, regexp_replace(g.time_control,'\+0$','')
    from public.online_games g
    cross join lateral (values (g.white_id),(g.black_id)) as p(user_id)
    join public.online_presence presence on presence.user_id=p.user_id
   where g.status='active' and presence.last_seen >= statement_timestamp() - interval '60 seconds'
     and g.turn_started_at + (case when g.turn='w' then g.white_ms else g.black_ms end * interval '1 millisecond') > statement_timestamp()
 )
 select c.game_kind,c.mode,c.time_control,count(*) from current_players c
 group by c.game_kind,c.mode,c.time_control;
end $$;
revoke all on function public.play_lobby_online_counts() from public,anon,authenticated;
grant execute on function public.play_lobby_online_counts() to authenticated;
