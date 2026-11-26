-- Only a score, not private progress/history, is exposed to other players.
-- These functions do not read or modify the online-game rating tables.
create or replace function public.puzzle_public_score(p_progress jsonb)
returns numeric language sql immutable set search_path = pg_catalog as $$
 select case when jsonb_typeof(p_progress->'history')='array'
                  and jsonb_typeof(p_progress->'rating')='number'
             then case when jsonb_array_length(p_progress->'history')>0
                         and (p_progress->>'rating')::numeric between 100 and 3000
                       then round((p_progress->>'rating')::numeric) end end
$$;
revoke all on function public.puzzle_public_score(jsonb) from public, anon, authenticated;

create or replace function public.puzzle_leaderboard()
returns table(username text, yar numeric, elo numeric, ranked boolean)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
 return query
  select p.username::text, s.score, s.score, true
  from public.puzzle_progress pp join public.profiles p on p.id=pp.user_id
  cross join lateral (select public.puzzle_public_score(pp.progress) score) s
  where s.score is not null
  order by s.score desc, lower(p.username::text), p.id limit 100;
end $$;

create or replace function public.puzzle_my_position()
returns table(username text, yar numeric, elo numeric, ranked boolean, place bigint)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
 return query with scores as (
  select p.id,p.username::text player_name, public.puzzle_public_score(pp.progress) score
  from public.profiles p left join public.puzzle_progress pp on pp.user_id=p.id
 ), ranked_players as (
  select s.*,row_number() over(order by s.score desc,lower(s.player_name),s.id) pos
  from scores s where s.score is not null
 ) select s.player_name,s.score,s.score,(s.score is not null),r.pos
 from scores s left join ranked_players r on r.id=s.id where s.id=auth.uid();
end $$;

create or replace function public.profile_puzzle_rating(p_name text)
returns numeric language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
 return (select public.puzzle_public_score(pp.progress) from public.profiles p
         left join public.puzzle_progress pp on pp.user_id=p.id
         where lower(p.username::text)=lower(p_name) limit 1);
end $$;
revoke all on function public.puzzle_leaderboard() from public, anon;
revoke all on function public.puzzle_my_position() from public, anon;
revoke all on function public.profile_puzzle_rating(text) from public, anon;
grant execute on function public.puzzle_leaderboard() to authenticated;
grant execute on function public.puzzle_my_position() to authenticated;
grant execute on function public.profile_puzzle_rating(text) to authenticated;
