-- Puzzle progress is separate from game ratings. Clients can only read their
-- own row; writes use a revision check to prevent lost updates across devices.
create table if not exists public.puzzle_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  progress jsonb,
  updated_at timestamptz not null default now(),
  constraint puzzle_progress_size check (progress is null or (jsonb_typeof(progress) = 'object' and octet_length(progress::text) <= 524288))
);
alter table public.puzzle_progress enable row level security;
revoke all on public.puzzle_progress from anon, authenticated;
grant select on public.puzzle_progress to authenticated;
create policy puzzle_progress_read_own on public.puzzle_progress for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.save_puzzle_progress(p_expected_revision bigint, p_progress jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); current_row public.puzzle_progress;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_progress is null or jsonb_typeof(p_progress) <> 'object' or octet_length(p_progress::text) > 524288 then
    raise exception 'Invalid puzzle progress' using errcode = '22023';
  end if;
  insert into public.puzzle_progress(user_id) values (uid) on conflict (user_id) do nothing;
  select * into current_row from public.puzzle_progress where user_id = uid for update;
  if current_row.revision <> p_expected_revision then
    return jsonb_build_object('accepted', false, 'revision', current_row.revision, 'progress', current_row.progress);
  end if;
  update public.puzzle_progress set progress = p_progress, revision = revision + 1, updated_at = now()
    where user_id = uid returning * into current_row;
  return jsonb_build_object('accepted', true, 'revision', current_row.revision, 'progress', current_row.progress);
end;
$$;
revoke all on function public.save_puzzle_progress(bigint,jsonb) from public, anon;
grant execute on function public.save_puzzle_progress(bigint,jsonb) to authenticated;
