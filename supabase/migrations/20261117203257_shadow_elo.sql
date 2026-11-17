-- Elo starts from 1000 at rollout; existing games are not backfilled. It is
-- display-only, per mode, and never participates in eligibility or ordering.
alter table public.yar_mode_ratings add column elo_shadow numeric(12,4) not null default 1000;
alter table public.yar_history add column before_elo numeric(12,4), add column after_elo numeric(12,4);

-- Trigger names determine the order: the existing yar trigger runs first.
-- Only games admitted by that trigger are rated; the same transaction and lock
-- protect both systems and leave existing ЯР calculation unchanged.
create function public.elo_rate_finished_game() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare w numeric; b numeric; expected double precision; score double precision; wn numeric; bn numeric;
begin
  perform pg_advisory_xact_lock(1870262190);
  if not exists (select 1 from public.yar_history where game_id=new.id and user_id=new.white_id and before_elo is null)
     or not exists (select 1 from public.yar_history where game_id=new.id and user_id=new.black_id and before_elo is null) then return new; end if;
  select elo_shadow into strict w from public.yar_mode_ratings where user_id=new.white_id and mode=new.mode;
  select elo_shadow into strict b from public.yar_mode_ratings where user_id=new.black_id and mode=new.mode;
  expected := 1 / (1 + power(10::double precision, greatest(-20,least(20,(b-w)::double precision/400))));
  score := case new.result when 'white_win' then 1 when 'draw' then 0.5 else 0 end;
  wn := w + 20 * (score-expected); bn := b + 20 * (expected-score);
  update public.yar_mode_ratings set elo_shadow=case when user_id=new.white_id then wn else bn end
    where mode=new.mode and user_id in (new.white_id,new.black_id);
  update public.yar_history set before_elo=case when user_id=new.white_id then w else b end,
    after_elo=case when user_id=new.white_id then wn else bn end where game_id=new.id;
  return new;
end $$;
revoke all on function public.elo_rate_finished_game() from public, anon, authenticated;
create trigger z_elo_rate_finished_game after update of status on public.online_games
for each row when (old.status='active' and new.status='finished') execute function public.elo_rate_finished_game();

-- The shadow column never changes the ЯР ordering or the calibration rule.
create function public.rank_leaderboard(p_mode text default 'overall')
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
  order by s.is_ranked desc,s.raw_yar desc,lower(s.player_name),s.id limit 100;
end $$;
revoke all on function public.rank_leaderboard(text) from public, anon, authenticated;
grant execute on function public.rank_leaderboard(text) to authenticated;

create function public.rank_my_position(p_mode text default 'overall')
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
  ), ordered as (select s.*,row_number() over(order by s.is_ranked desc,s.raw_yar desc,lower(s.player_name),s.id) pos from scores s)
  select o.player_name,round(o.raw_yar,1),round(o.raw_elo,1),o.is_ranked,case when o.is_ranked then o.pos else null end from ordered o where o.id=auth.uid();
end $$;
revoke all on function public.rank_my_position(text) from public, anon, authenticated;
grant execute on function public.rank_my_position(text) to authenticated;

-- Only participants may look up the two names and the mode ratings of a match.
create function public.rank_game_players(p_game uuid)
returns table(player text, username text, yar numeric, elo numeric)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare g public.online_games%rowtype; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'unauthorized'; end if;
  select * into g from public.online_games where id=p_game and actor in (white_id,black_id);
  if not found then raise exception 'game not found'; end if;
  return query select case when p.id=actor then 'self' else 'opponent' end,p.username::text,
    round(coalesce(r.yar,1000),1),round(coalesce(r.elo_shadow,1000),1)
    from public.profiles p left join public.yar_mode_ratings r on r.user_id=p.id and r.mode=g.mode
    where p.id in (g.white_id,g.black_id);
end $$;
revoke all on function public.rank_game_players(uuid) from public, anon, authenticated;
grant execute on function public.rank_game_players(uuid) to authenticated;
