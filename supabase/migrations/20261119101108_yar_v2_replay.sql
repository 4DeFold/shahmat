-- Lock game writes first (same order as the live finish transaction), then the rating lock.
-- Everything, including the private backup and replay, commits atomically.
lock table public.online_games in access exclusive mode;
select pg_advisory_xact_lock(1870262190);
lock table public.yar_mode_ratings, public.yar_history in access exclusive mode;
create schema yar_v2_backup;
revoke all on schema yar_v2_backup from public, anon, authenticated, service_role;
create table yar_v2_backup.mode_ratings as table public.yar_mode_ratings;
create table yar_v2_backup.history as table public.yar_history;
create table yar_v2_backup.rewards as table public.profile_rewards;
revoke all on all tables in schema yar_v2_backup from public, anon, authenticated, service_role;

alter table public.online_games add column time_control text;
-- Existing matchmaking has always used 3, 10 and 60 minutes for these modes.
update public.online_games set time_control=case mode when 'blitz' then '3' when 'rapid' then '10' when 'classical' then '60' end;
create function public.online_default_time_control() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.time_control is null then new.time_control:=case new.mode when 'blitz' then '3' when 'rapid' then '10' when 'classical' then '60' end; end if;
 return new;
end $$;
create trigger online_default_time_control before insert on public.online_games for each row execute function public.online_default_time_control();

drop trigger profile_update_rewards on public.yar_mode_ratings;
alter table public.yar_mode_ratings drop constraint yar_mode_ratings_yar_check;
alter table public.yar_mode_ratings alter column yar type numeric;
alter table public.yar_history alter column before_yar type numeric, alter column after_yar type numeric;

-- Shared by the live trigger and chronological replay; both callers hold the game
-- table lock/row lock and this transaction-wide lock, in that order.
create function public.yar_apply_game(g public.online_games) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare w numeric; b numeric; expected double precision; score double precision; d integer; day_start timestamptz;
begin
 if g.status <> 'finished' or g.result is null or g.result not in ('white_win','black_win','draw') or g.finished_at is null then return; end if;
 perform pg_advisory_xact_lock(1870262190);
 if exists(select 1 from public.yar_history where game_id=g.id) then return; end if;
 day_start:=date_trunc('day',g.finished_at at time zone 'UTC') at time zone 'UTC';
 if exists(select 1 from public.yar_history where user_id in (g.white_id,g.black_id) and finished_at>=day_start and finished_at<day_start+interval '1 day' group by user_id having count(*)>=25)
 or exists(select 1 from public.yar_history where user_id=g.white_id and opponent_id=g.black_id and finished_at>=day_start and finished_at<day_start+interval '1 day' having count(*)>=3) then return; end if;
 insert into public.yar_mode_ratings(user_id,mode) values(g.white_id,g.mode),(g.black_id,g.mode) on conflict do nothing;
 select yar into strict w from public.yar_mode_ratings where user_id=g.white_id and mode=g.mode;
 select yar into strict b from public.yar_mode_ratings where user_id=g.black_id and mode=g.mode;
 expected:=1/(1+power(10::double precision,greatest(-20,least(20,(b-w)::double precision/400))));
 score:=case g.result when 'white_win' then 1 when 'draw' then 0.5 else 0 end;
 d:=round((20*(score-expected))::numeric)::integer;
 update public.yar_mode_ratings set yar=w+d,games=games+1 where user_id=g.white_id and mode=g.mode;
 update public.yar_mode_ratings set yar=b-d,games=games+1 where user_id=g.black_id and mode=g.mode;
 insert into public.yar_history(game_id,user_id,opponent_id,mode,before_yar,after_yar,finished_at)
 values(g.id,g.white_id,g.black_id,g.mode,w,w+d,g.finished_at),(g.id,g.black_id,g.white_id,g.mode,b,b-d,g.finished_at);
end $$;
revoke all on function public.yar_apply_game(public.online_games) from public,anon,authenticated,service_role;
create or replace function public.yar_rate_finished_game() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.yar_apply_game(new); return new; end $$;

create or replace function public.rank_leaderboard(p_mode text default 'overall')
returns table(username text, yar numeric, elo numeric, ranked boolean)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_mode is null or p_mode not in ('overall','blitz','rapid','classical') then raise exception 'invalid mode'; end if;
  return query with scores as (
    select p.id,p.username::text player_name,
      case when p_mode='overall' then round((6000+coalesce(sum((r.yar-1000)*case r.mode when 'blitz' then 1 when 'rapid' then 2 else 3 end),0))/6) else coalesce(max(r.yar) filter(where r.mode=p_mode),1000) end raw_yar,
      case when p_mode='overall' then (3000+coalesce(sum(r.elo_shadow-1000),0))/3 else coalesce(max(r.elo_shadow) filter(where r.mode=p_mode),1000) end raw_elo,
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
  if p_mode is null or p_mode not in ('overall','blitz','rapid','classical') then raise exception 'invalid mode'; end if;
  return query with scores as (
    select p.id,p.username::text player_name,
      case when p_mode='overall' then round((6000+coalesce(sum((r.yar-1000)*case r.mode when 'blitz' then 1 when 'rapid' then 2 else 3 end),0))/6) else coalesce(max(r.yar) filter(where r.mode=p_mode),1000) end raw_yar,
      case when p_mode='overall' then (3000+coalesce(sum(r.elo_shadow-1000),0))/3 else coalesce(max(r.elo_shadow) filter(where r.mode=p_mode),1000) end raw_elo,
      coalesce(sum(r.games),0)>=10 is_ranked
    from public.profiles p left join public.yar_mode_ratings r on r.user_id=p.id group by p.id,p.username
  ), ordered as (select s.*,row_number() over(order by s.raw_yar desc,lower(s.player_name),s.id) pos from scores s)
  select o.player_name,round(o.raw_yar,1),round(o.raw_elo,1),o.is_ranked,o.pos from ordered o where o.id=auth.uid();
end $$;
revoke all on function public.rank_my_position(text) from public, anon, authenticated;
grant execute on function public.rank_my_position(text) to authenticated;

-- Fold the three mode defaults into one aggregate. No rows or ratings are changed.
create or replace function public.yar_leaderboard(p_mode text default 'overall')
returns table(username text, yar numeric, ranked boolean)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_mode is null or p_mode not in ('overall','blitz','rapid','classical') then raise exception 'invalid mode'; end if;
  return query
    with player_scores as (
      select p.id, p.username::text as player_name,
        case when p_mode='overall' then round((6000+coalesce(sum((r.yar-1000)*case r.mode when 'blitz' then 1 when 'rapid' then 2 else 3 end),0))/6)
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
-- Same ordering and calibration as yar_leaderboard; returns only the caller,
-- including when outside the public top 100. Never exposes user IDs.
create or replace function public.yar_my_position(p_mode text default 'overall')
returns table(username text, yar numeric, ranked boolean, place bigint)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_mode is null or p_mode not in ('overall','blitz','rapid','classical') then raise exception 'invalid mode'; end if;
  return query with scores as (
    select p.id, p.username::text as player_name,
      case when p_mode='overall' then round((6000+coalesce(sum((r.yar-1000)*case r.mode when 'blitz' then 1 when 'rapid' then 2 else 3 end),0))/6)
        else coalesce(max(r.yar) filter (where r.mode=p_mode),1000) end as raw_score,
      coalesce(sum(r.games),0) >= 10 as is_ranked
    from public.profiles p left join public.yar_mode_ratings r on r.user_id=p.id
    group by p.id,p.username
  ), ordered as (
    select s.*, row_number() over (order by s.is_ranked desc, s.raw_score desc, lower(s.player_name), s.id) as place from scores s
  ) select o.player_name, round(o.raw_score,1), o.is_ranked, case when o.is_ranked then o.place else null end from ordered o where o.id=auth.uid();
end $$;
revoke all on function public.yar_my_position(text) from public, anon, authenticated;
grant execute on function public.yar_my_position(text) to authenticated;
create or replace function public.profile_update_rewards() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare score numeric;
begin
 select round((6000+coalesce(sum((yar-1000)*case mode when 'blitz' then 1 when 'rapid' then 2 else 3 end),0))/6) into score from public.yar_mode_ratings where user_id=new.user_id;
 if score>=1100 then
  insert into public.profile_rewards(user_id,avatar_unlocked,banner_unlocked) values(new.user_id,true,score>=1200)
  on conflict(user_id) do update set avatar_unlocked=true,banner_unlocked=public.profile_rewards.banner_unlocked or excluded.banner_unlocked;
 end if;
 return new;
end $$;
create or replace function public.profile_public(p_name text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 select jsonb_build_object('username',p.username,'bio',p.bio,
 'palette',case when u.raw_user_meta_data->>'palette' in ('monochrome','gray','forest','atelier','wood','earth','ocean','amber','lavender','sand') then u.raw_user_meta_data->>'palette' else 'monochrome' end,
 'theme',case when u.raw_user_meta_data->>'palette_theme' in ('dark','light') then u.raw_user_meta_data->>'palette_theme' when u.raw_user_meta_data->>'palette_effective_theme' in ('dark','light') then u.raw_user_meta_data->>'palette_effective_theme' else 'light' end,
 'avatar',case when coalesce(re.avatar_unlocked,false) then m.avatar end,'banner',case when coalesce(re.banner_unlocked,false) then m.banner end,
 'ratings',jsonb_build_object('overall',(select round((6000+coalesce(sum((yar-1000)*case mode when 'blitz' then 1 when 'rapid' then 2 else 3 end),0))/6) from public.yar_mode_ratings where user_id=p.id),
 'blitz',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='blitz'),1000),
 'rapid',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='rapid'),1000),
 'classical',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='classical'),1000)),
 'games',jsonb_build_object('blitz',(select count(*) from public.online_games g where g.status='finished' and g.mode='blitz' and p.id in (g.white_id,g.black_id)),
 'rapid',(select count(*) from public.online_games g where g.status='finished' and g.mode='rapid' and p.id in (g.white_id,g.black_id)),
 'classical',(select count(*) from public.online_games g where g.status='finished' and g.mode='classical' and p.id in (g.white_id,g.black_id)),
 'bot',(select count(*) from public.bot_games g where g.user_id=p.id and g.status in ('white_win','black_win','draw')))) into result
 from public.profiles p join auth.users u on u.id=p.id left join public.profile_media m on m.user_id=p.id left join public.profile_rewards re on re.user_id=p.id where lower(p.username)=lower(p_name);
 return result;
end $$;

create trigger profile_update_rewards after insert or update of yar on public.yar_mode_ratings for each row execute function public.profile_update_rewards();

-- Preserve Elo values and old permanent rewards. Reconstruct only ЯР; no Elo trigger
-- runs during replay. Old Elo history is copied back for games it already covered.
alter table public.yar_mode_ratings disable trigger profile_update_rewards;
update public.yar_mode_ratings set yar=1000,games=0;
alter table public.yar_mode_ratings enable trigger profile_update_rewards;
delete from public.yar_history;
do $$ declare g public.online_games%rowtype; begin
 for g in select * from public.online_games where status='finished' and result in ('white_win','black_win','draw') and finished_at is not null order by finished_at,id loop
  perform public.yar_apply_game(g);
 end loop;
end $$;
update public.yar_history h set before_elo=b.before_elo,after_elo=b.after_elo from yar_v2_backup.history b where h.game_id=b.game_id and h.user_id=b.user_id;
alter table public.yar_mode_ratings add constraint yar_mode_ratings_integer_check check(yar=trunc(yar));
alter table public.yar_history add constraint yar_history_integer_check check(before_yar=trunc(before_yar) and after_yar=trunc(after_yar));
