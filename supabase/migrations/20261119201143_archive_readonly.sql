-- Read-only, account-scoped archive; never expose another player's account IDs.
create index if not exists online_games_archive_white on public.online_games (white_id, mode, finished_at desc, id) where status='finished';
create index if not exists online_games_archive_black on public.online_games (black_id, mode, finished_at desc, id) where status='finished';
create function public.my_archive_games(p_mode text, p_offset integer default 0)
returns table(id uuid, mode text, white_name text, black_name text, my_color text, moves jsonb, result text, reason text, finished_at timestamptz)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if p_mode not in ('blitz','rapid','classical') then raise exception 'invalid mode'; end if;
 return query select g.id,g.mode,w.username::text,b.username::text,
  case when g.white_id=auth.uid() then 'w' else 'b' end,g.moves,g.result,g.reason,g.finished_at
 from public.online_games g
 join public.profiles w on w.id=g.white_id join public.profiles b on b.id=g.black_id
 where g.status='finished' and g.mode=p_mode and auth.uid() in (g.white_id,g.black_id)
 order by g.finished_at desc nulls last,g.id desc limit 40 offset greatest(0,least(coalesce(p_offset,0),100000));
end $$;
revoke all on function public.my_archive_games(text,integer) from public,anon,authenticated;
grant execute on function public.my_archive_games(text,integer) to authenticated;
