-- Tag only direct games so a replay cannot silently enter public matchmaking.
create index direct_challenges_game on public.direct_challenges(game_id) where game_id is not null;
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
 'direct_challenge',exists(select 1 from public.direct_challenges d where d.game_id=g.id),
 'opponent_offline',g.status='active' and last_seen is not null and last_seen>=g.created_at and last_seen<now_at-interval '60 seconds',
 'game_age_ms',greatest(0,floor(extract(epoch from (now_at-g.created_at))*1000)::bigint));
end $$;
