-- Completion survives deletion of the corresponding unrated game.
create table public.bot_progress (
 user_id uuid not null references auth.users(id) on delete cascade,
 level smallint not null check(level between 1 and 6),
 completed_at timestamptz not null default now(), primary key(user_id,level)
);
alter table public.bot_progress enable row level security;
revoke all on public.bot_progress from public,anon,authenticated;
grant select,insert,update on public.bot_progress to authenticated;
create policy bot_progress_read_own on public.bot_progress for select to authenticated using(user_id=auth.uid());
create policy bot_progress_insert_own on public.bot_progress for insert to authenticated with check(user_id=auth.uid());
create policy bot_progress_update_own on public.bot_progress for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
insert into public.bot_progress(user_id,level) select distinct user_id,level from public.bot_games where status='white_win' on conflict do nothing;
grant delete on public.bot_games to authenticated;
create policy bot_games_delete_own on public.bot_games for delete to authenticated using(user_id=auth.uid());
