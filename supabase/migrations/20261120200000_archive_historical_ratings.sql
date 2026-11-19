-- Capture the mode ratings at the creation of new games. Existing games are
-- deliberately not backfilled from today's ratings.
alter table public.online_games add column white_yar_at_start numeric, add column black_yar_at_start numeric;
create function public.online_capture_start_ratings() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 select coalesce((select yar from public.yar_mode_ratings where user_id=new.white_id and mode=new.mode),1000),
        coalesce((select yar from public.yar_mode_ratings where user_id=new.black_id and mode=new.mode),1000)
 into new.white_yar_at_start,new.black_yar_at_start;
 return new;
end $$;
revoke all on function public.online_capture_start_ratings() from public,anon,authenticated;
create trigger online_capture_start_ratings before insert on public.online_games for each row execute function public.online_capture_start_ratings();
-- Ratings recorded for the completed game, never current profile ratings.
create function public.my_archive_ratings(p_games uuid[])
returns table(game_id uuid, white_yar numeric, black_yar numeric)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if coalesce(cardinality(p_games),0)>40 then raise exception 'too many games'; end if;
 return query select g.id, coalesce(g.white_yar_at_start,w.before_yar), coalesce(g.black_yar_at_start,b.before_yar)
 from public.online_games g
 left join public.yar_history w on w.game_id=g.id and w.user_id=g.white_id
 left join public.yar_history b on b.game_id=g.id and b.user_id=g.black_id
 where g.id=any(p_games) and g.status='finished' and auth.uid() in (g.white_id,g.black_id);
end $$;
revoke all on function public.my_archive_ratings(uuid[]) from public,anon,authenticated;
grant execute on function public.my_archive_ratings(uuid[]) to authenticated;
