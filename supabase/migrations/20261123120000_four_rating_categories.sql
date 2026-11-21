-- Four rating pools; old controls and the two-argument search API remain compatible.
alter table public.online_games drop constraint online_games_mode_check, add constraint online_games_mode_check check(mode in ('bullet','blitz','rapid','classical'));
alter table public.online_queue drop constraint online_queue_mode_check, add constraint online_queue_mode_check check(mode in ('bullet','blitz','rapid','classical'));
alter table public.yar_mode_ratings drop constraint yar_mode_ratings_mode_check, add constraint yar_mode_ratings_mode_check check(mode in ('bullet','blitz','rapid','classical'));
alter table public.yar_history drop constraint yar_history_mode_check, add constraint yar_history_mode_check check(mode in ('bullet','blitz','rapid','classical'));

-- Existing controls are stored as minutes, e.g. '3' and '60'.
alter table public.online_queue add column time_control text;
update public.online_queue set time_control=case mode when 'blitz' then '3' when 'rapid' then '10' when 'classical' then '60' end;
create function public.online_control_ms(p_mode text, p_control text) returns bigint
language sql immutable set search_path=pg_catalog as $$
 select case when (p_mode,regexp_replace(p_control,'\+0$','')) in (('bullet','1'),('bullet','1+1'),('bullet','2'),('bullet','2+1'),('blitz','3'),('blitz','3+2'),('blitz','5'),('blitz','5+3'),('rapid','10'),('rapid','10+5'),('rapid','15'),('rapid','15+10'),('classical','30'),('classical','30+20'),('classical','60'),('classical','60+40')) then split_part(p_control,'+',1)::bigint*60000 else null end
$$;
create or replace function public.online_default_time_control() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.time_control is null then new.time_control:=case new.mode when 'bullet' then '1' when 'blitz' then '3' when 'rapid' then '10' when 'classical' then '60' end; end if;
 return new;
end $$;
create function public.online_find(p_user uuid,p_mode text,p_control text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare opponent uuid; game_id uuid; initial_ms bigint; g record;
begin
 p_control:=regexp_replace(p_control,'\+0$','');
 initial_ms:=public.online_control_ms(p_mode,p_control);
 if p_user is null or initial_ms is null then raise exception 'invalid request'; end if;
 perform pg_advisory_xact_lock(1870262189);
 for g in select id from public.online_games where status='active' and p_user in (white_id,black_id) loop perform public.online_snapshot(p_user,g.id); end loop;
 select id into game_id from public.online_games where status='active' and p_user in (white_id,black_id) order by created_at desc limit 1;
 if game_id is not null then delete from public.online_queue where user_id=p_user; return jsonb_build_object('state','matched','game_id',game_id); end if;
 delete from public.online_queue where heartbeat_at<clock_timestamp()-interval '30 seconds';
 select user_id into opponent from public.online_queue where mode=p_mode and time_control=p_control and user_id<>p_user order by queued_at limit 1;
 if opponent is not null then
  delete from public.online_queue where user_id in (p_user,opponent);
  insert into public.online_games(white_id,black_id,mode,time_control,white_ms,black_ms) values(opponent,p_user,p_mode,p_control,initial_ms,initial_ms) returning id into game_id;
  insert into public.online_presence(user_id,last_seen) values(opponent,clock_timestamp()),(p_user,clock_timestamp()) on conflict(user_id) do update set last_seen=excluded.last_seen;
  return jsonb_build_object('state','matched','game_id',game_id);
 end if;
 insert into public.online_queue(user_id,mode,time_control,queued_at,heartbeat_at) values(p_user,p_mode,p_control,clock_timestamp(),clock_timestamp())
 on conflict(user_id) do update set mode=excluded.mode,time_control=excluded.time_control,queued_at=case when public.online_queue.mode=excluded.mode and public.online_queue.time_control=excluded.time_control then public.online_queue.queued_at else excluded.queued_at end,heartbeat_at=excluded.heartbeat_at;
 return jsonb_build_object('state','searching');
end $$;
create or replace function public.online_find(p_user uuid,p_mode text) returns jsonb language sql security definer set search_path=pg_catalog,public as $$
 select public.online_find(p_user,p_mode,case p_mode when 'bullet' then '1' when 'blitz' then '3' when 'rapid' then '10' when 'classical' then '60' end)
$$;
revoke all on function public.online_find(uuid,text,text) from public,anon,authenticated;
grant execute on function public.online_find(uuid,text,text) to service_role;
create or replace function public.online_commit(p_user uuid, p_game uuid, p_version integer, p_san text, p_fen text, p_next_turn text, p_result text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare g public.online_games%rowtype; elapsed bigint; now_at timestamptz;
begin
  select * into g from public.online_games where id = p_game and p_user in (white_id,black_id) for update;
  if not found then return null; end if;
  now_at := clock_timestamp();
  if g.status <> 'active' or g.version <> p_version then return public.online_snapshot(p_user,p_game); end if;
  if (g.turn = 'w' and g.white_id <> p_user) or (g.turn = 'b' and g.black_id <> p_user) then raise exception 'not your turn'; end if;
  elapsed := greatest(0, floor(extract(epoch from (now_at - g.turn_started_at)) * 1000)::bigint);
  if (g.turn = 'w' and elapsed >= g.white_ms) or (g.turn = 'b' and elapsed >= g.black_ms) then return public.online_snapshot(p_user,p_game); end if;
  if jsonb_array_length(g.moves) >= 2000 then raise exception 'move limit reached'; end if;
  update public.online_games set moves = g.moves || to_jsonb(p_san), fen = p_fen, turn = p_next_turn,
    white_ms = case when g.turn = 'w' then greatest(0,g.white_ms - elapsed) + coalesce(nullif(split_part(g.time_control,'+',2),'')::bigint,0)*1000 else g.white_ms end,
    black_ms = case when g.turn = 'b' then greatest(0,g.black_ms - elapsed) + coalesce(nullif(split_part(g.time_control,'+',2),'')::bigint,0)*1000 else g.black_ms end,
    turn_started_at = now_at, status = case when p_result is null then 'active' else 'finished' end,
    result = p_result, reason = p_reason, finished_at = case when p_result is null then null else now_at end,
    version = version + 1 where id = g.id;
  return public.online_snapshot(p_user,p_game);
end $$;

-- Qualified categories alone participate, with game-count reliability weighting.
create function public.rating_overall(p_user uuid,p_elo boolean default false) returns numeric
language sql stable security definer set search_path=pg_catalog,public as $$
 select round(sum((case when p_elo then r.elo_shadow else r.yar end)*w.weight*least(1::numeric,r.games/20::numeric))/nullif(sum(w.weight*least(1::numeric,r.games/20::numeric)),0))
 from public.yar_mode_ratings r join (values ('bullet',0.7::numeric),('blitz',0.8),('rapid',0.9),('classical',1.0)) w(mode,weight) on r.mode=w.mode where r.user_id=p_user and r.games>=10
$$;
revoke all on function public.rating_overall(uuid,boolean) from public,anon,authenticated;

create or replace function public.rank_leaderboard(p_mode text default 'overall') returns table(username text, yar numeric, elo numeric, ranked boolean) language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if p_mode is null or p_mode not in ('overall','bullet','blitz','rapid','classical') then raise exception 'invalid mode'; end if;
 return query with scores as (select p.id,p.username::text player_name,
 case when p_mode='overall' then public.rating_overall(p.id,false) else coalesce(max(r.yar) filter(where r.mode=p_mode),1000) end raw_yar,
 case when p_mode='overall' then public.rating_overall(p.id,true) else coalesce(max(r.elo_shadow) filter(where r.mode=p_mode),1000) end raw_elo,
 case when p_mode='overall' then public.rating_overall(p.id,false) is not null else coalesce(max(r.games) filter(where r.mode=p_mode),0)>=10 end is_ranked
 from public.profiles p left join public.yar_mode_ratings r on r.user_id=p.id group by p.id,p.username) select s.player_name,s.raw_yar,round(s.raw_elo,1),s.is_ranked from scores s order by s.raw_yar desc nulls last,lower(s.player_name),s.id limit 100;
end $$;

create or replace function public.rank_my_position(p_mode text default 'overall') returns table(username text, yar numeric, elo numeric, ranked boolean, place bigint) language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if p_mode is null or p_mode not in ('overall','bullet','blitz','rapid','classical') then raise exception 'invalid mode'; end if;
 return query with scores as (select p.id,p.username::text player_name,
 case when p_mode='overall' then public.rating_overall(p.id,false) else coalesce(max(r.yar) filter(where r.mode=p_mode),1000) end raw_yar,
 case when p_mode='overall' then public.rating_overall(p.id,true) else coalesce(max(r.elo_shadow) filter(where r.mode=p_mode),1000) end raw_elo,
 case when p_mode='overall' then public.rating_overall(p.id,false) is not null else coalesce(max(r.games) filter(where r.mode=p_mode),0)>=10 end is_ranked
 from public.profiles p left join public.yar_mode_ratings r on r.user_id=p.id group by p.id,p.username) select o.player_name,o.raw_yar,round(o.raw_elo,1),o.is_ranked,case when o.raw_yar is not null then o.pos else null end from (select s.*,row_number() over(order by s.raw_yar desc nulls last,lower(s.player_name),s.id) pos from scores s) o where o.id=auth.uid();
end $$;

create or replace function public.yar_leaderboard(p_mode text default 'overall') returns table(username text, yar numeric, ranked boolean) language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if p_mode is null or p_mode not in ('overall','bullet','blitz','rapid','classical') then raise exception 'invalid mode'; end if;
 return query with scores as (select p.id,p.username::text player_name,
 case when p_mode='overall' then public.rating_overall(p.id,false) else coalesce(max(r.yar) filter(where r.mode=p_mode),1000) end raw_yar,
 case when p_mode='overall' then public.rating_overall(p.id,true) else coalesce(max(r.elo_shadow) filter(where r.mode=p_mode),1000) end raw_elo,
 case when p_mode='overall' then public.rating_overall(p.id,false) is not null else coalesce(max(r.games) filter(where r.mode=p_mode),0)>=10 end is_ranked
 from public.profiles p left join public.yar_mode_ratings r on r.user_id=p.id group by p.id,p.username) select s.player_name,s.raw_yar,s.is_ranked from scores s order by s.is_ranked desc,s.raw_yar desc nulls last,lower(s.player_name),s.id limit 100;
end $$;

create or replace function public.yar_my_position(p_mode text default 'overall') returns table(username text, yar numeric, ranked boolean, place bigint) language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if p_mode is null or p_mode not in ('overall','bullet','blitz','rapid','classical') then raise exception 'invalid mode'; end if;
 return query with scores as (select p.id,p.username::text player_name,
 case when p_mode='overall' then public.rating_overall(p.id,false) else coalesce(max(r.yar) filter(where r.mode=p_mode),1000) end raw_yar,
 case when p_mode='overall' then public.rating_overall(p.id,true) else coalesce(max(r.elo_shadow) filter(where r.mode=p_mode),1000) end raw_elo,
 case when p_mode='overall' then public.rating_overall(p.id,false) is not null else coalesce(max(r.games) filter(where r.mode=p_mode),0)>=10 end is_ranked
 from public.profiles p left join public.yar_mode_ratings r on r.user_id=p.id group by p.id,p.username) select o.player_name,o.raw_yar,o.is_ranked,case when o.is_ranked then o.pos else null end from (select s.*,row_number() over(order by s.is_ranked desc,s.raw_yar desc nulls last,lower(s.player_name),s.id) pos from scores s) o where o.id=auth.uid();
end $$;

create or replace function public.rank_game_players(p_game uuid) returns table(player text,username text,yar numeric,elo numeric)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare g public.online_games%rowtype; actor uuid:=auth.uid();
begin
 if actor is null then raise exception 'unauthorized'; end if;
 select * into g from public.online_games where id=p_game and actor in (white_id,black_id);
 if not found then raise exception 'game not found'; end if;
 return query select case when p.id=actor then 'self' else 'opponent' end,p.username::text,
 case when r.games>=10 then round(r.yar,1) else public.rating_overall(p.id,false) end,
 case when r.games>=10 then round(r.elo_shadow,1) else public.rating_overall(p.id,true) end
 from public.profiles p left join public.yar_mode_ratings r on r.user_id=p.id and r.mode=g.mode where p.id in (g.white_id,g.black_id);
end $$;
create or replace function public.profile_update_rewards() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare score numeric;
begin
 score:=public.rating_overall(new.user_id,false);
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
 'piece_set',case when u.raw_user_meta_data->>'piece_set' in ('cburnett','classic','angular','rounded','regent','turnier','courtyard','manor','chessnut','fantasy','spatial','celtic','merida','firi','rhosgfx','kiwen-suwi','mono') then u.raw_user_meta_data->>'piece_set' else 'cburnett' end,
 'avatar',case when coalesce(re.avatar_unlocked,false) then m.avatar end,'banner',case when coalesce(re.banner_unlocked,false) then m.banner end,
 'ratings',jsonb_build_object('overall',public.rating_overall(p.id,false),
 'bullet',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='bullet'),1000),
 'blitz',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='blitz'),1000),
 'rapid',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='rapid'),1000),
 'classical',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='classical'),1000)),
 'games',jsonb_build_object('bullet',(select count(*) from public.online_games g where g.status='finished' and g.mode='bullet' and p.id in (g.white_id,g.black_id)),
 'blitz',(select count(*) from public.online_games g where g.status='finished' and g.mode='blitz' and p.id in (g.white_id,g.black_id)),
 'rapid',(select count(*) from public.online_games g where g.status='finished' and g.mode='rapid' and p.id in (g.white_id,g.black_id)),
 'classical',(select count(*) from public.online_games g where g.status='finished' and g.mode='classical' and p.id in (g.white_id,g.black_id)),
 'bot',(select count(*) from public.bot_games g where g.user_id=p.id and g.status in ('white_win','black_win','draw')))) into result
 from public.profiles p join auth.users u on u.id=p.id left join public.profile_media m on m.user_id=p.id left join public.profile_rewards re on re.user_id=p.id where lower(p.username)=lower(p_name);
 return result;
end $$;

create or replace function public.my_archive_all(p_offset integer default 0)
returns table(id uuid, mode text, white_name text, black_name text, my_color text, moves jsonb, result text, reason text, finished_at timestamptz, level smallint)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 return query select q.id,q.mode,q.white_name,q.black_name,q.my_color,q.moves,q.result,q.reason,q.finished_at,q.level from (
  select g.id,g.mode,w.username::text white_name,b.username::text black_name,case when g.white_id=auth.uid() then 'w' else 'b' end my_color,g.moves,g.result,g.reason,g.finished_at,null::smallint level
  from public.online_games g join public.profiles w on w.id=g.white_id join public.profiles b on b.id=g.black_id
  where g.status='finished' and g.mode in ('bullet','blitz','rapid','classical') and auth.uid() in (g.white_id,g.black_id)
  union all
  select bg.id,'bot'::text,null::text,null::text,bg.player_color,to_jsonb(bg.moves),bg.status,null::text,bg.updated_at,bg.level from public.bot_games bg where bg.user_id=auth.uid() and bg.status<>'active'
 ) q order by q.finished_at desc nulls last,q.id desc limit 40 offset greatest(0,least(coalesce(p_offset,0),100000));
end $$;


create or replace function public.my_archive_games(p_mode text, p_offset integer default 0)
returns table(id uuid, mode text, white_name text, black_name text, my_color text, moves jsonb, result text, reason text, finished_at timestamptz)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if p_mode not in ('bullet','blitz','rapid','classical') then raise exception 'invalid mode'; end if;
 return query select g.id,g.mode,w.username::text,b.username::text,
  case when g.white_id=auth.uid() then 'w' else 'b' end,g.moves,g.result,g.reason,g.finished_at
 from public.online_games g
 join public.profiles w on w.id=g.white_id join public.profiles b on b.id=g.black_id
 where g.status='finished' and g.mode=p_mode and auth.uid() in (g.white_id,g.black_id)
 order by g.finished_at desc nulls last,g.id desc limit 40 offset greatest(0,least(coalesce(p_offset,0),100000));
end $$;
revoke all on function public.my_archive_games(text,integer) from public,anon,authenticated;
grant execute on function public.my_archive_games(text,integer) to authenticated;


-- Sort before pagination; only public names, mode ratings and position are exposed.
create or replace function public.spectator_modes() returns table(mode text, game_count bigint)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 return query select g.mode,count(*) from public.online_games g where g.status='active' and g.mode in ('bullet','blitz','rapid','classical') and clock_timestamp() < g.turn_started_at+(case when g.turn='w' then g.white_ms else g.black_ms end * interval '1 millisecond') group by g.mode;
end $$;
create or replace function public.spectator_games_sorted(p_mode text default 'all',p_offset integer default 0)
returns table(id uuid,white_name text,black_name text,mode text,move_count integer,fen text,moves jsonb,version integer,white_yar numeric,black_yar numeric)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if p_mode not in ('all','bullet','blitz','rapid','classical') then raise exception 'invalid mode'; end if;
 return query select g.id,w.username::text,b.username::text,g.mode,jsonb_array_length(g.moves),g.fen,g.moves,g.version,coalesce(wr.yar,1000),coalesce(br.yar,1000)
 from public.online_games g join public.profiles w on w.id=g.white_id join public.profiles b on b.id=g.black_id
 left join public.yar_mode_ratings wr on wr.user_id=g.white_id and wr.mode=g.mode left join public.yar_mode_ratings br on br.user_id=g.black_id and br.mode=g.mode
 where g.status='active' and g.mode in ('bullet','blitz','rapid','classical') and (p_mode='all' or g.mode=p_mode) and clock_timestamp() < g.turn_started_at+(case when g.turn='w' then g.white_ms else g.black_ms end * interval '1 millisecond')
 order by greatest(coalesce(wr.yar,1000),coalesce(br.yar,1000)) desc,g.created_at desc,g.id limit 50 offset greatest(0,least(coalesce(p_offset,0),10000));
end $$;
revoke all on function public.spectator_modes(),public.spectator_games_sorted(text,integer) from public,anon,authenticated;
grant execute on function public.spectator_modes(),public.spectator_games_sorted(text,integer) to authenticated;

