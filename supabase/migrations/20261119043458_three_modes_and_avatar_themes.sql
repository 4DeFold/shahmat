-- Never destroy existing daily games/history implicitly. Requires an explicit data decision if any appear.
lock table public.online_games, public.online_queue, public.yar_mode_ratings, public.yar_history in access exclusive mode;
do $$ begin
 if exists(select 1 from public.online_games where mode='daily') or exists(select 1 from public.online_queue where mode='daily') or exists(select 1 from public.yar_mode_ratings where mode='daily') or exists(select 1 from public.yar_history where mode='daily') then
  raise exception 'daily data exists; archive or remove it explicitly before migration';
 end if;
end $$;
alter table public.online_games drop constraint online_games_mode_check, add constraint online_games_mode_check check(mode in ('blitz','rapid','classical'));
alter table public.online_queue drop constraint online_queue_mode_check, add constraint online_queue_mode_check check(mode in ('blitz','rapid','classical'));
alter table public.yar_mode_ratings drop constraint yar_mode_ratings_mode_check, add constraint yar_mode_ratings_mode_check check(mode in ('blitz','rapid','classical'));
alter table public.yar_history drop constraint yar_history_mode_check, add constraint yar_history_mode_check check(mode in ('blitz','rapid','classical'));
-- Display a position for every player, including calibration. Order is always
-- by full-precision ЯР, independently of calibration and the display unit.
create or replace function public.rank_leaderboard(p_mode text default 'overall')
returns table(username text, yar numeric, elo numeric, ranked boolean)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_mode is null or p_mode not in ('overall','blitz','rapid','classical') then raise exception 'invalid mode'; end if;
  return query with scores as (
    select p.id,p.username::text player_name,
      case when p_mode='overall' then (3000+coalesce(sum(r.yar-1000),0))/3 else coalesce(max(r.yar) filter(where r.mode=p_mode),1000) end raw_yar,
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
      case when p_mode='overall' then (3000+coalesce(sum(r.yar-1000),0))/3 else coalesce(max(r.yar) filter(where r.mode=p_mode),1000) end raw_yar,
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
        case when p_mode='overall' then (3000 + coalesce(sum(r.yar - 1000),0))/3
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
      case when p_mode='overall' then (3000 + coalesce(sum(r.yar - 1000),0))/3
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
 select (3000+coalesce(sum(yar-1000),0))/3 into score from public.yar_mode_ratings where user_id=new.user_id;
 if score>=1100 then
  insert into public.profile_rewards(user_id,avatar_unlocked,banner_unlocked) values(new.user_id,true,score>=1200)
  on conflict(user_id) do update set avatar_unlocked=true,banner_unlocked=public.profile_rewards.banner_unlocked or excluded.banner_unlocked;
 end if;
 return new;
end $$;
insert into public.profile_rewards(user_id,avatar_unlocked,banner_unlocked)
select p.id,(3000+coalesce(sum(r.yar-1000),0))/3>=1100,(3000+coalesce(sum(r.yar-1000),0))/3>=1200
from public.profiles p left join public.yar_mode_ratings r on r.user_id=p.id group by p.id
having (3000+coalesce(sum(r.yar-1000),0))/3>=1100
on conflict(user_id) do update set avatar_unlocked=public.profile_rewards.avatar_unlocked or excluded.avatar_unlocked,banner_unlocked=public.profile_rewards.banner_unlocked or excluded.banner_unlocked;
create or replace function public.profile_public(p_name text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 select jsonb_build_object('username',p.username,'bio',p.bio,
 'palette',case when u.raw_user_meta_data->>'palette' in ('monochrome','gray','forest','atelier','wood','earth','ocean','amber','lavender','sand') then u.raw_user_meta_data->>'palette' else 'monochrome' end,
 'theme',case when u.raw_user_meta_data->>'palette_theme' in ('dark','light') then u.raw_user_meta_data->>'palette_theme' when u.raw_user_meta_data->>'palette_effective_theme' in ('dark','light') then u.raw_user_meta_data->>'palette_effective_theme' else 'light' end,
 'avatar',case when coalesce(re.avatar_unlocked,false) then m.avatar end,'banner',case when coalesce(re.banner_unlocked,false) then m.banner end,
 'ratings',jsonb_build_object('overall',round((3000+coalesce((select sum(yar-1000) from public.yar_mode_ratings where user_id=p.id),0))/3,1),
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
create or replace function public.online_find(p_user uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare opponent uuid; game_id uuid; initial_ms bigint; g record;
begin
  initial_ms := case p_mode when 'blitz' then 180000 when 'rapid' then 600000 when 'classical' then 3600000 else null end;
  if p_user is null or initial_ms is null then raise exception 'invalid request'; end if;
  perform pg_advisory_xact_lock(1870262189);
  -- Finalize any expired game for this player before looking for a new match.
  for g in select id from public.online_games where status = 'active' and p_user in (white_id, black_id) loop
    perform public.online_snapshot(p_user, g.id);
  end loop;
  select id into game_id from public.online_games where status = 'active' and p_user in (white_id, black_id) order by created_at desc limit 1;
  if game_id is not null then
    delete from public.online_queue where user_id = p_user;
    return jsonb_build_object('state','matched','game_id',game_id);
  end if;
  delete from public.online_queue where heartbeat_at < clock_timestamp() - interval '30 seconds';
  select user_id into opponent from public.online_queue where mode = p_mode and user_id <> p_user order by queued_at limit 1;
  if opponent is not null then
    delete from public.online_queue where user_id in (p_user, opponent);
    insert into public.online_games(white_id, black_id, mode, white_ms, black_ms) values (opponent, p_user, p_mode, initial_ms, initial_ms) returning id into game_id;
    insert into public.online_presence(user_id,last_seen) values (opponent,clock_timestamp()),(p_user,clock_timestamp()) on conflict(user_id) do update set last_seen=excluded.last_seen;
    return jsonb_build_object('state','matched','game_id',game_id);
  end if;
  insert into public.online_queue(user_id, mode, queued_at, heartbeat_at) values (p_user,p_mode,clock_timestamp(),clock_timestamp())
  on conflict (user_id) do update set mode = excluded.mode,
    queued_at = case when public.online_queue.mode = excluded.mode then public.online_queue.queued_at else excluded.queued_at end,
    heartbeat_at = excluded.heartbeat_at;
  return jsonb_build_object('state','searching');
end $$;
-- Return only public palette identifiers; never expose user metadata.
create function public.profile_avatar_themes(p_names text[]) returns table(username text,palette text)
language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if p_names is null or cardinality(p_names)>100 then raise exception 'invalid names'; end if;
 return query select p.username,case when u.raw_user_meta_data->>'palette' in ('monochrome','gray','forest','atelier','wood','earth','ocean','amber','lavender','sand') then u.raw_user_meta_data->>'palette' else 'monochrome' end from public.profiles p join auth.users u on u.id=p.id where p.username=any(p_names);
end $$;
revoke all on function public.profile_avatar_themes(text[]) from public,anon;
grant execute on function public.profile_avatar_themes(text[]) to authenticated;
