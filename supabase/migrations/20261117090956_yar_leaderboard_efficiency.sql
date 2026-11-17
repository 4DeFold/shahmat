-- Fold the four mode defaults into one aggregate. No rows or ratings are changed.
create or replace function public.yar_leaderboard(p_mode text default 'overall')
returns table(username text, yar numeric, ranked boolean)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_mode is null or p_mode not in ('overall','blitz','rapid','classical','daily') then raise exception 'invalid mode'; end if;
  return query
    with player_scores as (
      select p.id, p.username::text as player_name,
        case when p_mode='overall' then (4000 + coalesce(sum(r.yar - 1000),0))/4
          else coalesce(max(r.yar) filter (where r.mode=p_mode),1000) end as raw_score,
        coalesce(sum(r.games),0) >= 10 as is_ranked
      from public.profiles p
      left join public.yar_mode_ratings r on r.user_id=p.id
      group by p.id,p.username
    )
    select player_name, round(raw_score,1), is_ranked from player_scores
    order by is_ranked desc, raw_score desc, lower(player_name), id
    limit 100;
end $$;
revoke all on function public.yar_leaderboard(text) from public, anon, authenticated;
grant execute on function public.yar_leaderboard(text) to authenticated, service_role;
