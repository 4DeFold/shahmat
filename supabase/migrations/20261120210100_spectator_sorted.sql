-- Sort before pagination; only public names, mode ratings and position are exposed.
create function public.spectator_modes() returns table(mode text, game_count bigint)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 return query select g.mode,count(*) from public.online_games g where g.status='active' and g.mode in ('blitz','rapid','classical') and clock_timestamp() < g.turn_started_at+(case when g.turn='w' then g.white_ms else g.black_ms end * interval '1 millisecond') group by g.mode;
end $$;
create function public.spectator_games_sorted(p_mode text default 'all',p_offset integer default 0)
returns table(id uuid,white_name text,black_name text,mode text,move_count integer,fen text,moves jsonb,version integer,white_yar numeric,black_yar numeric)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if p_mode not in ('all','blitz','rapid','classical') then raise exception 'invalid mode'; end if;
 return query select g.id,w.username::text,b.username::text,g.mode,jsonb_array_length(g.moves),g.fen,g.moves,g.version,coalesce(wr.yar,1000),coalesce(br.yar,1000)
 from public.online_games g join public.profiles w on w.id=g.white_id join public.profiles b on b.id=g.black_id
 left join public.yar_mode_ratings wr on wr.user_id=g.white_id and wr.mode=g.mode left join public.yar_mode_ratings br on br.user_id=g.black_id and br.mode=g.mode
 where g.status='active' and g.mode in ('blitz','rapid','classical') and (p_mode='all' or g.mode=p_mode) and clock_timestamp() < g.turn_started_at+(case when g.turn='w' then g.white_ms else g.black_ms end * interval '1 millisecond')
 order by greatest(coalesce(wr.yar,1000),coalesce(br.yar,1000)) desc,g.created_at desc,g.id limit 50 offset greatest(0,least(coalesce(p_offset,0),10000));
end $$;
revoke all on function public.spectator_modes(),public.spectator_games_sorted(text,integer) from public,anon,authenticated;
grant execute on function public.spectator_modes(),public.spectator_games_sorted(text,integer) to authenticated;
