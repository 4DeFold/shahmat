-- Order on the full stored precision, even when displayed scores round to the same value.
create or replace function public.yar_leaderboard(p_mode text default 'overall')
returns table(username text, yar numeric, ranked boolean)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_mode is null or p_mode not in ('overall','blitz','rapid','classical','daily') then raise exception 'invalid mode'; end if;
  return query
    select p.username::text, case when p_mode='overall' then round(avg(coalesce(r.yar,1000)), 1)
      else round(max(coalesce(r.yar,1000)) filter (where modes.mode=p_mode), 1) end as score,
      coalesce(sum(r.games),0) >= 10 as ranked
    from public.profiles p
    cross join (values ('blitz'),('rapid'),('classical'),('daily')) as modes(mode)
    left join public.yar_mode_ratings r on r.user_id=p.id and r.mode=modes.mode
    group by p.id,p.username
    order by ranked desc, (case when p_mode='overall' then avg(coalesce(r.yar,1000))
      else max(coalesce(r.yar,1000)) filter (where modes.mode=p_mode) end) desc, lower(p.username::text), p.id
    limit 100;
end $$;
revoke all on function public.yar_leaderboard(text) from public, anon, authenticated;
grant execute on function public.yar_leaderboard(text) to authenticated, service_role;
