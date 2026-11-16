-- Storage foundation only: no game rules or direct client writes are enabled.
create table public.games (
  id uuid primary key default gen_random_uuid(),
  white_player_id uuid references auth.users(id) on delete set null,
  black_player_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'finished', 'aborted')),
  result text check (result in ('white_win', 'black_win', 'draw')),
  result_reason text,
  initial_fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  initial_time_ms bigint check (initial_time_ms >= 0),
  increment_ms bigint check (increment_ms >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint games_distinct_players check (white_player_id is null or black_player_id is null or white_player_id <> black_player_id),
  constraint games_time_order check (started_at is null or finished_at is null or finished_at >= started_at)
);
create index games_white_player_created_idx on public.games (white_player_id, created_at desc);
create index games_black_player_created_idx on public.games (black_player_id, created_at desc);

create table public.game_moves (
  game_id uuid not null references public.games(id) on delete cascade,
  ply integer not null check (ply > 0),
  color text not null check (color in ('white', 'black')),
  uci text not null check (uci ~ '^[a-h][1-8][a-h][1-8][qrbn]?$'),
  san text,
  fen_after text,
  white_time_ms bigint check (white_time_ms >= 0),
  black_time_ms bigint check (black_time_ms >= 0),
  played_at timestamptz not null default now(),
  primary key (game_id, ply)
);

comment on table public.games is 'Storage foundation; game state must be managed and validated by trusted server code.';
comment on column public.games.initial_time_ms is 'Initial clock per player in milliseconds; null for an untimed game.';
comment on column public.games.increment_ms is 'Clock increment in milliseconds; null if unspecified.';
comment on column public.games.white_player_id is 'Auth user ID; set to null on account deletion to retain game history.';
comment on column public.games.black_player_id is 'Auth user ID; set to null on account deletion to retain game history.';
comment on table public.game_moves is 'Ordered half-moves; uniqueness does not validate chess legality or prevent gaps.';
comment on column public.game_moves.ply is 'One-based sequential half-move number within this game.';
comment on column public.game_moves.uci is 'Move in UCI coordinate notation, including promotion when applicable.';
comment on column public.game_moves.white_time_ms is 'White clock remaining immediately after this move, if recorded.';
comment on column public.game_moves.black_time_ms is 'Black clock remaining immediately after this move, if recorded.';

alter table public.games enable row level security;
alter table public.game_moves enable row level security;
-- Explicitly deny client access until authorization and trusted game logic exist.
revoke all on table public.games, public.game_moves from public, anon, authenticated;
grant all on table public.games, public.game_moves to service_role;
