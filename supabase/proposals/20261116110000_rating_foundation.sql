-- Storage only. Do not apply to the shared production database for a preview.
-- There is deliberately no client read/write access or rating-update function:
-- a trusted, transactional game service must validate the result first.
create table public.player_ratings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  rating numeric(9,4) not null default 1000 check (rating between 0 and 2600),
  rated_games integer not null default 0 check (rated_games >= 0),
  division integer not null default 0 check (division between 0 and 7),
  division_peak integer not null default 0 check (division_peak between division and 7)
);
create table public.player_modes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('classic', 'rapid', 'blitz', 'bullet', 'bot', 'friendly')),
  rating numeric(9,4) not null default 1000 check (rating between 0 and 2600),
  games integer not null default 0 check (games >= 0),
  wins integer not null default 0 check (wins >= 0),
  draws integer not null default 0 check (draws >= 0),
  losses integer not null default 0 check (losses >= 0),
  primary key (profile_id, mode),
  check (games = wins + draws + losses)
);
create table public.rating_history (
  game_id uuid not null references public.games(id),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid not null references public.profiles(id),
  mode text not null check (mode in ('classic', 'rapid', 'blitz', 'bullet')),
  rating_before numeric(9,4) not null check (rating_before between 0 and 2600),
  rating_after numeric(9,4) not null check (rating_after between 0 and 2600),
  created_at timestamptz not null default now(),
  primary key (game_id, profile_id),
  check (profile_id <> opponent_id)
);
create index rating_history_player_time_idx on public.rating_history (profile_id, created_at);
create index rating_history_pair_time_idx on public.rating_history (profile_id, opponent_id, created_at);
alter table public.player_ratings enable row level security;
alter table public.player_modes enable row level security;
alter table public.rating_history enable row level security;
revoke all on public.player_ratings, public.player_modes, public.rating_history from public, anon, authenticated;
grant all on public.player_ratings, public.player_modes, public.rating_history to service_role;
