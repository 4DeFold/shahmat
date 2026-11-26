-- Load friends and clan rankings independently; searching for a friend must not
-- recalculate every clan's rating. The original RPC remains for older previews.
create function public.social_friends_snapshot(p_search text default '') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid();
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 return jsonb_build_object(
  'friends',coalesce((select jsonb_agg(jsonb_build_object('username',p.username,'state',case when f.accepted then 'friend' when f.requester=actor then 'outgoing' else 'incoming' end) order by lower(p.username)) from public.social_friendships f join public.profiles p on p.id=case when f.requester=actor then f.recipient else f.requester end where actor in (f.requester,f.recipient)),'[]'::jsonb),
  'players',coalesce((select jsonb_agg(jsonb_build_object('username',x.username,'state',x.state) order by lower(x.username)) from (select p.username,case when f.accepted then 'friend' when f.requester=actor then 'outgoing' when f.recipient=actor then 'incoming' else 'none' end state from public.profiles p left join public.social_friendships f on least(f.requester,f.recipient)=least(actor,p.id) and greatest(f.requester,f.recipient)=greatest(actor,p.id) where p.id<>actor and length(trim(p_search))>=2 and strpos(lower(p.username),lower(trim(p_search)))>0 order by lower(p.username) limit 25) x),'[]'::jsonb)
 );
end $$;
create function public.social_clans_snapshot(p_search text default '') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); my_clan uuid;
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 select clan_id into my_clan from public.social_clan_members where user_id=actor;
 return jsonb_build_object(
  'clans',coalesce((with matching as materialized (select c.* from public.social_clans c where strpos(lower(c.name),lower(trim(coalesce(p_search,''))))>0), scores as materialized (select m.clan_id,m.user_id,public.rating_overall(m.user_id,false) score from public.social_clan_members m join matching c on c.id=m.clan_id) select jsonb_agg(to_jsonb(x) order by x.rating desc nulls last,lower(x.name),x.id) from (select c.id,c.name,c.description,c.open,count(s.user_id)::int members,round(avg(s.score)) rating,count(s.score)::int rated,exists(select 1 from public.social_clan_requests q where q.clan_id=c.id and q.user_id=actor) requested from matching c left join scores s on s.clan_id=c.id group by c.id,c.name,c.description,c.open order by rating desc nulls last,lower(c.name),c.id limit 100) x),'[]'::jsonb),
  'my_clan',my_clan,
  'owned',exists(select 1 from public.social_clans where id=my_clan and owner=actor)
 );
end $$;
revoke all on function public.social_friends_snapshot(text),public.social_clans_snapshot(text) from public,anon;
grant execute on function public.social_friends_snapshot(text),public.social_clans_snapshot(text) to authenticated;
