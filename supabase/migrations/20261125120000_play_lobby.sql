-- Old clients remain rated and retain the same default controls.
alter table public.online_games add column game_kind text not null default 'rated' check(game_kind in ('rated','friendly'));
alter table public.online_queue add column game_kind text not null default 'rated' check(game_kind in ('rated','friendly'));
create index online_queue_kind_control_idx on public.online_queue(mode,game_kind,time_control,queued_at);

-- A distinct function name avoids PostgREST ambiguity with legacy overloads.
create function public.online_find_kind(p_user uuid,p_mode text,p_control text,p_kind text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare opponent uuid; game_id uuid; initial_ms bigint; g record;
begin
 p_control:=regexp_replace(p_control,'\+0$','');
 initial_ms:=public.online_control_ms(p_mode,p_control);
 if p_user is null or initial_ms is null or p_kind is null or p_kind not in ('rated','friendly') then raise exception 'invalid request'; end if;
 perform pg_advisory_xact_lock(1870262189);
 for g in select id from public.online_games where status='active' and p_user in (white_id,black_id) loop perform public.online_snapshot(p_user,g.id); end loop;
 select id into game_id from public.online_games where status='active' and p_user in (white_id,black_id) order by created_at desc limit 1;
 if game_id is not null then delete from public.online_queue where user_id=p_user; return jsonb_build_object('state','matched','game_id',game_id); end if;
 delete from public.online_queue where heartbeat_at<clock_timestamp()-interval '30 seconds';
 select user_id into opponent from public.online_queue where mode=p_mode and game_kind=p_kind and time_control=p_control and user_id<>p_user order by queued_at limit 1;
 if opponent is not null then
  delete from public.online_queue where user_id in (p_user,opponent);
  insert into public.online_games(white_id,black_id,mode,game_kind,time_control,white_ms,black_ms) values(opponent,p_user,p_mode,p_kind,p_control,initial_ms,initial_ms) returning id into game_id;
  insert into public.online_presence(user_id,last_seen) values(opponent,clock_timestamp()),(p_user,clock_timestamp()) on conflict(user_id) do update set last_seen=excluded.last_seen;
  return jsonb_build_object('state','matched','game_id',game_id);
 end if;
 insert into public.online_queue(user_id,mode,game_kind,time_control,queued_at,heartbeat_at) values(p_user,p_mode,p_kind,p_control,clock_timestamp(),clock_timestamp())
 on conflict(user_id) do update set mode=excluded.mode,game_kind=excluded.game_kind,time_control=excluded.time_control,queued_at=case when public.online_queue.mode=excluded.mode and public.online_queue.game_kind=excluded.game_kind and public.online_queue.time_control=excluded.time_control then public.online_queue.queued_at else excluded.queued_at end,heartbeat_at=excluded.heartbeat_at;
 return jsonb_build_object('state','searching');
end $$;
-- Legacy searches delegate to the same isolation mechanism.
create or replace function public.online_find(p_user uuid,p_mode text,p_control text) returns jsonb language sql security definer set search_path=pg_catalog,public as $$
 select public.online_find_kind(p_user,p_mode,p_control,'rated')
$$;
revoke all on function public.online_find_kind(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.online_find_kind(uuid,text,text,text) to service_role;

-- Unrated games cannot affect ЯР or Elo, including when replayed later.
create or replace function public.yar_apply_game(g public.online_games) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare w numeric; b numeric; expected double precision; score double precision; d integer; day_start timestamptz;
begin
 if g.game_kind <> 'rated' or g.status <> 'finished' or g.result is null or g.result not in ('white_win','black_win','draw') or g.finished_at is null then return; end if;
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

create or replace function public.online_match_snapshot(p_user uuid, p_game uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare snap jsonb; g public.online_games%rowtype; last_seen timestamptz; opponent uuid; now_at timestamptz;
begin
 snap:=public.online_snapshot(p_user,p_game);
 if snap is null then return null; end if;
 select * into g from public.online_games where id=p_game;
 opponent:=case when g.white_id=p_user then g.black_id else g.white_id end;
 select p.last_seen into last_seen from public.online_presence p where p.user_id=opponent;
 now_at:=clock_timestamp();
 return snap || jsonb_build_object('game_kind',g.game_kind,'time_control',g.time_control,
 'opponent_offline',g.status='active' and last_seen is not null and last_seen>=g.created_at and last_seen<now_at-interval '60 seconds',
 'game_age_ms',greatest(0,floor(extract(epoch from (now_at-g.created_at))*1000)::bigint));
end $$;

-- Public board replay only: never return account identifiers or names.
create function public.play_demo_games() returns table(moves jsonb)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 return query select g.moves from public.online_games g where g.status='finished' and g.reason='checkmate' and jsonb_array_length(g.moves)>=3 order by random() limit 20;
end $$;
revoke all on function public.play_demo_games() from public,anon,authenticated;
grant execute on function public.play_demo_games() to authenticated;
