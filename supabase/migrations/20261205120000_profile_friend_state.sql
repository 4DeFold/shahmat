-- Resolve the exact user, without depending on the paginated player search.
create function public.social_friend_state(p_name text) returns text
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); target uuid; f public.social_friendships%rowtype;
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 select id into target from public.profiles where lower(username)=lower(trim(p_name)) limit 1;
 if target is null then raise exception 'player_not_found'; end if;
 if target=actor then return 'self'; end if;
 select * into f from public.social_friendships where least(requester,recipient)=least(actor,target) and greatest(requester,recipient)=greatest(actor,target);
 return case when f.requester is null then 'none' when f.accepted then 'friend' when f.requester=actor then 'outgoing' else 'incoming' end;
end $$;
revoke all on function public.social_friend_state(text) from public,anon;
grant execute on function public.social_friend_state(text) to authenticated;
