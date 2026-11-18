-- Separate, unrated local-engine games. No triggers reference online_games or ЯР.
create table public.bot_games (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  level smallint not null check (level between 1 and 6),
  moves text[] not null default '{}' check (cardinality(moves) <= 1000),
  status text not null check (status in ('active','white_win','black_win','draw','abandoned')),
  started_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index bot_games_owner_updated on public.bot_games(user_id, updated_at desc);
alter table public.bot_games enable row level security;
revoke all on public.bot_games from public, anon, authenticated;
grant select, insert, update on public.bot_games to authenticated;
create policy bot_games_read_own on public.bot_games for select to authenticated using (user_id = auth.uid());
create policy bot_games_insert_own on public.bot_games for insert to authenticated with check (user_id = auth.uid());
create policy bot_games_update_own on public.bot_games for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
