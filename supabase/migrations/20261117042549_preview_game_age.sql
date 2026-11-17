-- Expose authoritative age only on the isolated preview snapshot. The client
-- uses this to reveal the resign control one minute after a match was created.
create or replace function public.preview_online_match_snapshot(p_user uuid, p_game uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare snap jsonb; g public.preview_online_games%rowtype; last_seen timestamptz; opponent uuid; now_at timestamptz;
begin
  snap := public.preview_online_snapshot(p_user, p_game);
  if snap is null then return null; end if;
  select * into g from public.preview_online_games where id = p_game;
  opponent := case when g.white_id = p_user then g.black_id else g.white_id end;
  select p.last_seen into last_seen from public.preview_online_presence p where p.user_id = opponent;
  now_at := clock_timestamp();
  return snap || jsonb_build_object(
    'opponent_offline', g.status = 'active' and last_seen is not null and last_seen >= g.created_at and last_seen < now_at - interval '60 seconds',
    'game_age_ms', greatest(0, floor(extract(epoch from (now_at - g.created_at)) * 1000)::bigint)
  );
end $$;
