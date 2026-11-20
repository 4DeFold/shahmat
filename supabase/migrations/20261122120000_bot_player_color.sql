-- Existing games were always played as white; retain that interpretation.
alter table public.bot_games add column if not exists player_color text not null default 'w' check (player_color in ('w','b'));

create or replace function public.my_archive_all(p_offset integer default 0)
returns table(id uuid, mode text, white_name text, black_name text, my_color text, moves jsonb, result text, reason text, finished_at timestamptz, level smallint)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 return query select q.id,q.mode,q.white_name,q.black_name,q.my_color,q.moves,q.result,q.reason,q.finished_at,q.level from (
  select g.id,g.mode,w.username::text white_name,b.username::text black_name,case when g.white_id=auth.uid() then 'w' else 'b' end my_color,g.moves,g.result,g.reason,g.finished_at,null::smallint level
  from public.online_games g join public.profiles w on w.id=g.white_id join public.profiles b on b.id=g.black_id
  where g.status='finished' and g.mode in ('blitz','rapid','classical') and auth.uid() in (g.white_id,g.black_id)
  union all
  select bg.id,'bot'::text,null::text,null::text,bg.player_color,to_jsonb(bg.moves),bg.status,null::text,bg.updated_at,bg.level from public.bot_games bg where bg.user_id=auth.uid() and bg.status<>'active'
 ) q order by q.finished_at desc nulls last,q.id desc limit 40 offset greatest(0,least(coalesce(p_offset,0),100000));
end $$;
