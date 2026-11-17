-- ЯР is server-controlled. Existing games are intentionally not backfilled.
-- Overall ЯР is derived from the four mode ratings, including 1000 for an unplayed mode.
create table public.yar_mode_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('blitz','rapid','classical','daily')),
  yar numeric(10,4) not null default 1000 check (yar between 0 and 2600),
  games integer not null default 0 check (games >= 0),
  primary key (user_id, mode)
);
create table public.yar_history (
  game_id uuid not null references public.online_games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  opponent_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('blitz','rapid','classical','daily')),
  before_yar numeric(10,4) not null,
  after_yar numeric(10,4) not null,
  finished_at timestamptz not null,
  primary key (game_id, user_id),
  check (user_id <> opponent_id)
);
create index yar_history_daily_idx on public.yar_history(user_id, finished_at);
create index yar_history_pair_idx on public.yar_history(user_id, opponent_id, finished_at);
alter table public.yar_mode_ratings enable row level security;
alter table public.yar_history enable row level security;
revoke all on public.yar_mode_ratings, public.yar_history from public, anon, authenticated;
grant all on public.yar_mode_ratings, public.yar_history to service_role;

-- A single lock makes the two-player update, caps, and idempotence atomic.
create function public.yar_rate_finished_game() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare w public.yar_mode_ratings%rowtype; b public.yar_mode_ratings%rowtype;
  ratio double precision; draw_term double precision; expected double precision;
  white_score double precision; weight double precision; w_next numeric; b_next numeric;
  day_start timestamptz; day_end timestamptz;
begin
  if new.result not in ('white_win','black_win','draw') or new.result is null or new.finished_at is null then return new; end if;
  perform pg_advisory_xact_lock(1870262190);
  if exists (select 1 from public.yar_history where game_id = new.id) then return new; end if;
  day_start := date_trunc('day', new.finished_at at time zone 'UTC') at time zone 'UTC';
  day_end := day_start + interval '1 day';
  -- Both players must be eligible; otherwise this game does not affect either.
  if exists (select 1 from public.yar_history where user_id in (new.white_id,new.black_id)
    and finished_at >= day_start and finished_at < day_end group by user_id having count(*) >= 25)
    or exists (select 1 from public.yar_history where user_id = new.white_id and opponent_id = new.black_id
      and finished_at >= day_start and finished_at < day_end having count(*) >= 3) then return new; end if;
  insert into public.yar_mode_ratings(user_id,mode) values (new.white_id,new.mode),(new.black_id,new.mode) on conflict do nothing;
  select * into w from public.yar_mode_ratings where user_id=new.white_id and mode=new.mode;
  select * into b from public.yar_mode_ratings where user_id=new.black_id and mode=new.mode;
  -- Davidson model, ν = 0.9, and decaying K from RANKING_STRUCTURE.md.
  ratio := power(10::double precision, (w.yar-b.yar)::double precision / 400);
  draw_term := 0.9 * sqrt(ratio);
  expected := (ratio + 0.5 * draw_term) / (ratio + 1 + draw_term);
  white_score := case new.result when 'white_win' then 1 when 'draw' then 0.5 else 0 end;
  -- Daily has no specified weight in the document; use classical's 1.0.
  weight := case new.mode when 'blitz' then 0.85 else 1 end;
  w_next := greatest(0,least(2600,w.yar + weight * (6 + 42 / (1 + w.games::double precision / 8)) * (white_score-expected)));
  b_next := greatest(0,least(2600,b.yar + weight * (6 + 42 / (1 + b.games::double precision / 8)) * (expected-white_score)));
  update public.yar_mode_ratings set yar=w_next, games=games+1 where user_id=w.user_id and mode=w.mode;
  update public.yar_mode_ratings set yar=b_next, games=games+1 where user_id=b.user_id and mode=b.mode;
  insert into public.yar_history(game_id,user_id,opponent_id,mode,before_yar,after_yar,finished_at)
  values (new.id,w.user_id,b.user_id,new.mode,w.yar,w_next,new.finished_at),
         (new.id,b.user_id,w.user_id,new.mode,b.yar,b_next,new.finished_at);
  return new;
end $$;
revoke all on function public.yar_rate_finished_game() from public, anon, authenticated;
create trigger yar_rate_finished_game after update of status on public.online_games
for each row when (old.status = 'active' and new.status = 'finished') execute function public.yar_rate_finished_game();

-- Only the public nickname and requested score are exposed, never profiles or history.
create function public.yar_leaderboard(p_mode text default 'overall')
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
    order by ranked desc, score desc, lower(p.username::text), p.id
    limit 100;
end $$;
revoke all on function public.yar_leaderboard(text) from public, anon, authenticated;
grant execute on function public.yar_leaderboard(text) to authenticated, service_role;
