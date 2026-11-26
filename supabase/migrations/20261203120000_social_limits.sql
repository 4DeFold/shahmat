-- Existing clans keep their current membership and have no minimum until edited.
alter table public.social_clans add column min_rating integer not null default 0 check(min_rating between 0 and 3000);
create function public.social_action_v2(p_action text,p_name text default null,p_clan uuid default null,p_description text default null,p_open boolean default null,p_min_rating integer default null) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); target uuid; c public.social_clans%rowtype; f public.social_friendships%rowtype; my_clan uuid;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor) then raise exception 'unauthorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(1912601231);
 if p_action in ('friend_request','friend_accept','friend_remove') then
  select id into target from public.profiles where lower(username)=lower(trim(p_name)) limit 1;
  if target is null or target=actor then raise exception 'player_not_found'; end if;
  select * into f from public.social_friendships where least(requester,recipient)=least(actor,target) and greatest(requester,recipient)=greatest(actor,target);
  if p_action='friend_request' then
   if f.requester is not null then raise exception 'friend_exists'; end if;
   if (select count(*) from public.social_friendships where accepted and actor in (requester,recipient))>=100 or (select count(*) from public.social_friendships where accepted and target in (requester,recipient))>=100 then raise exception 'friend_limit'; end if;
   if (select count(*) from public.social_friendships where requester=actor and not accepted)>=40 then raise exception 'request_limit'; end if;
   insert into public.social_friendships(requester,recipient) values(actor,target);
  elsif p_action='friend_accept' then
   if f.recipient is distinct from actor or f.accepted then raise exception 'request_not_found'; end if;
   if (select count(*) from public.social_friendships where accepted and actor in (requester,recipient))>=100 or (select count(*) from public.social_friendships where accepted and target in (requester,recipient))>=100 then raise exception 'friend_limit'; end if;
   update public.social_friendships set accepted=true where requester=f.requester and recipient=f.recipient;
  else
   if f.requester is null then raise exception 'request_not_found'; end if;
   delete from public.social_friendships where requester=f.requester and recipient=f.recipient;
  end if;
  return;
 end if;
 select clan_id into my_clan from public.social_clan_members where user_id=actor;
 if p_action='clan_create' then
  if my_clan is not null then raise exception 'already_in_clan'; end if;
  if coalesce(public.rating_overall(actor,false),0)<1050 then raise exception 'creation_rating_low'; end if;
  if coalesce(p_min_rating,0) not between 0 and 3000 then raise exception 'invalid_clan'; end if;
  if p_name is null or char_length(trim(p_name)) not between 3 and 40 or p_name ~ '[[:cntrl:]]' or char_length(coalesce(p_description,''))>300 or p_open is null then raise exception 'invalid_clan'; end if;
  insert into public.social_clans(name,description,owner,open,min_rating) values(trim(p_name),trim(coalesce(p_description,'')),actor,p_open,coalesce(p_min_rating,0)) returning id into p_clan;
  insert into public.social_clan_members(clan_id,user_id) values(p_clan,actor);
  delete from public.social_clan_requests where user_id=actor;
  return;
 end if;
 select * into c from public.social_clans where id=p_clan;
 if c.id is null then raise exception 'clan_not_found'; end if;
 if p_action='clan_join' then
  if c.min_rating>0 and coalesce(public.rating_overall(actor,false),0)<c.min_rating then raise exception 'join_rating_low'; end if;
  if my_clan is not null then raise exception 'already_in_clan'; end if;
  if (select count(*) from public.social_clan_members where clan_id=c.id)>=50 then raise exception 'clan_full'; end if;
  if c.open then insert into public.social_clan_members(clan_id,user_id) values(c.id,actor); delete from public.social_clan_requests where user_id=actor;
  else if (select count(*) from public.social_clan_requests where user_id=actor)>=20 and not exists(select 1 from public.social_clan_requests where clan_id=c.id and user_id=actor) then raise exception 'request_limit'; end if;
   insert into public.social_clan_requests(clan_id,user_id) values(c.id,actor) on conflict do nothing; end if;
 elsif p_action='clan_cancel' then
  delete from public.social_clan_requests where clan_id=c.id and user_id=actor;
 elsif p_action='clan_leave' then
  if my_clan is distinct from c.id then raise exception 'not_member'; end if;
  if c.owner=actor then raise exception 'owner_cannot_leave'; end if;
  delete from public.social_clan_members where user_id=actor;
 elsif p_action in ('clan_accept','clan_reject','clan_kick','clan_transfer') then
  if c.owner<>actor then raise exception 'not_owner' using errcode='42501'; end if;
  select id into target from public.profiles where lower(username)=lower(trim(p_name)) limit 1;
  if target is null or target=actor then raise exception 'player_not_found'; end if;
  if p_action in ('clan_accept','clan_reject') then
   if not exists(select 1 from public.social_clan_requests where clan_id=c.id and user_id=target) then raise exception 'request_not_found'; end if;
   if p_action='clan_accept' then
    if c.min_rating>0 and coalesce(public.rating_overall(target,false),0)<c.min_rating then raise exception 'join_rating_low'; end if;
    if exists(select 1 from public.social_clan_members where user_id=target) then raise exception 'already_in_clan'; end if;
    if (select count(*) from public.social_clan_members where clan_id=c.id)>=50 then raise exception 'clan_full'; end if;
    insert into public.social_clan_members(clan_id,user_id) values(c.id,target);
    delete from public.social_clan_requests where user_id=target;
   else delete from public.social_clan_requests where clan_id=c.id and user_id=target; end if;
  elsif p_action='clan_kick' then
   delete from public.social_clan_members where clan_id=c.id and user_id=target;
   if not found then raise exception 'not_member'; end if;
  else
   if not exists(select 1 from public.social_clan_members where clan_id=c.id and user_id=target) then raise exception 'not_member'; end if;
   update public.social_clans set owner=target where id=c.id;
  end if;
 elsif p_action='clan_edit' then
  if c.owner<>actor then raise exception 'not_owner' using errcode='42501'; end if;
  if p_name is null or char_length(trim(p_name)) not between 3 and 40 or p_name ~ '[[:cntrl:]]' or char_length(coalesce(p_description,''))>300 or p_open is null then raise exception 'invalid_clan'; end if;
  if p_min_rating is not null and p_min_rating not between 0 and 3000 then raise exception 'invalid_clan'; end if;
  update public.social_clans set name=trim(p_name),description=trim(coalesce(p_description,'')),open=p_open,min_rating=coalesce(p_min_rating,min_rating) where id=c.id;
 elsif p_action='clan_delete' then
  if c.owner<>actor then raise exception 'not_owner' using errcode='42501'; end if;
  delete from public.social_clans where id=c.id;
 else raise exception 'invalid_action'; end if;
end $$;
create or replace function public.social_action(p_action text,p_name text default null,p_clan uuid default null,p_description text default null,p_open boolean default null) returns void
language sql security definer set search_path=pg_catalog,public as $$
 select public.social_action_v2(p_action,p_name,p_clan,p_description,p_open,null)
$$;
revoke all on function public.social_action_v2(text,text,uuid,text,boolean,integer) from public,anon;
grant execute on function public.social_action_v2(text,text,uuid,text,boolean,integer) to authenticated;

create or replace function public.social_clan_detail(p_clan uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 select jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'open',c.open,'min_rating',c.min_rating,'owner',op.username,
 'is_owner',c.owner=actor,'is_member',exists(select 1 from public.social_clan_members where clan_id=c.id and user_id=actor),
 'requested',exists(select 1 from public.social_clan_requests where clan_id=c.id and user_id=actor),
 'members',coalesce((select jsonb_agg(jsonb_build_object('username',p.username,'owner',m.user_id=c.owner,'rating',public.rating_overall(m.user_id,false)) order by (m.user_id=c.owner) desc,lower(p.username)) from public.social_clan_members m join public.profiles p on p.id=m.user_id where m.clan_id=c.id),'[]'::jsonb),
 'requests',case when c.owner=actor then coalesce((select jsonb_agg(jsonb_build_object('username',p.username) order by q.created_at) from public.social_clan_requests q join public.profiles p on p.id=q.user_id where q.clan_id=c.id),'[]'::jsonb) else '[]'::jsonb end)
 into result from public.social_clans c join public.profiles op on op.id=c.owner where c.id=p_clan;
 return result;
end $$;

