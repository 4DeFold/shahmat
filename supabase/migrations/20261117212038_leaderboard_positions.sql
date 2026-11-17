-- Display a position for every player, including calibration. Order is always
-- by full-precision ЯР, independently of calibration and the display unit.
create or replace function public.rank_leaderboard(p_mode text default 'overall')
returns table(username text, yar numeric, elo numeric, ranked boolean)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_mode is null or p_mode not in ('overall','blitz','rapid','classical','daily') then raise exception 'invalid mode'; end if;
  return query with scores as (
    select p.id,p.username::text player_name,
      case when p_mode='overall' then (4000+coalesce(sum(r.yar-1000),0))/4 else coalesce(max(r.yar) filter(where r.mode=p_mode),1000) end raw_yar,
      case when p_mode='overall' then (4000+coalesce(sum(r.elo_shadow-1000),0))/4 else coalesce(max(r.elo_shadow) filter(where r.mode=p_mode),1000) end raw_elo,
      coalesce(sum(r.games),0)>=10 is_ranked
    from public.profiles p left join public.yar_mode_ratings r on r.user_id=p.id group by p.id,p.username
  ) select s.player_name, round(s.raw_yar,1),round(s.raw_elo,1),s.is_ranked from scores s
  order by s.raw_yar desc,lower(s.player_name),s.id limit 100;
end $$;
revoke all on function public.rank_leaderboard(text) from public, anon, authenticated;
grant execute on function public.rank_leaderboard(text) to authenticated;

create or replace function public.rank_my_position(p_mode text default 'overall')
returns table(username text, yar numeric, elo numeric, ranked boolean, place bigint)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_mode is null or p_mode not in ('overall','blitz','rapid','classical','daily') then raise exception 'invalid mode'; end if;
  return query with scores as (
    select p.id,p.username::text player_name,
      case when p_mode='overall' then (4000+coalesce(sum(r.yar-1000),0))/4 else coalesce(max(r.yar) filter(where r.mode=p_mode),1000) end raw_yar,
      case when p_mode='overall' then (4000+coalesce(sum(r.elo_shadow-1000),0))/4 else coalesce(max(r.elo_shadow) filter(where r.mode=p_mode),1000) end raw_elo,
      coalesce(sum(r.games),0)>=10 is_ranked
    from public.profiles p left join public.yar_mode_ratings r on r.user_id=p.id group by p.id,p.username
  ), ordered as (select s.*,row_number() over(order by s.raw_yar desc,lower(s.player_name),s.id) pos from scores s)
  select o.player_name,round(o.raw_yar,1),round(o.raw_elo,1),o.is_ranked,o.pos from ordered o where o.id=auth.uid();
end $$;
revoke all on function public.rank_my_position(text) from public, anon, authenticated;
grant execute on function public.rank_my_position(text) to authenticated;

