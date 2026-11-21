-- Counts are for all saved, completed archive games, not just rated games.
create function public.my_archive_stats() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null then raise exception 'unauthorized'; end if;
 select jsonb_build_object(
   'bullet',count(*) filter(where mode='bullet'), 'blitz',count(*) filter(where mode='blitz'),
   'rapid',count(*) filter(where mode='rapid'), 'classical',count(*) filter(where mode='classical'),
   'bot',(select count(*) from public.bot_games where user_id=actor and status<>'active')) into result
 from public.online_games where status='finished' and actor in (white_id,black_id);
 return result;
end $$;
revoke all on function public.my_archive_stats() from public,anon,authenticated;
grant execute on function public.my_archive_stats() to authenticated;
