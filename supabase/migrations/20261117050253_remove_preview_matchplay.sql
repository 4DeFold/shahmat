-- Remove only the retired preview data store. Refuse to discard games or queues.
lock table public.preview_online_games, public.preview_online_queue, public.preview_online_presence in access exclusive mode;
do $$ begin
  if exists (select 1 from public.preview_online_games) or exists (select 1 from public.preview_online_queue) then
    raise exception 'Preview games or queue are not empty; cleanup aborted';
  end if;
end $$;
drop function public.preview_online_finish(uuid,uuid,text);
drop function public.preview_online_match_snapshot(uuid,uuid);
drop function public.preview_online_heartbeat(uuid);
drop function public.preview_online_commit(uuid,uuid,integer,text,text,text,text,text);
drop function public.preview_online_snapshot(uuid,uuid);
drop function public.preview_online_current(uuid);
drop function public.preview_online_cancel(uuid);
drop function public.preview_online_find(uuid,text);
drop table public.preview_online_presence;
drop table public.preview_online_queue;
drop table public.preview_online_games;
