-- Social data is private by default; all access goes through authenticated RPCs.
create table public.social_friendships (
 requester uuid not null references public.profiles(id) on delete cascade,
 recipient uuid not null references public.profiles(id) on delete cascade,
 accepted boolean not null default false,
 created_at timestamptz not null default now(),
 check(requester <> recipient), primary key(requester,recipient)
);
create index social_friend_recipient on public.social_friendships(recipient);
create unique index social_friend_pair on public.social_friendships(least(requester,recipient),greatest(requester,recipient));
create table public.social_clans (
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(name) between 3 and 40),
 description text not null default '' check(char_length(description)<=300),
 owner uuid not null references public.profiles(id) on delete cascade,
 open boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index social_clan_name on public.social_clans(lower(name));
create table public.social_clan_members (
 clan_id uuid not null references public.social_clans(id) on delete cascade,
 user_id uuid primary key references public.profiles(id) on delete cascade,
 joined_at timestamptz not null default now()
);
create index social_clan_members_clan on public.social_clan_members(clan_id);
create table public.social_clan_requests (
 clan_id uuid not null references public.social_clans(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(clan_id,user_id)
);
create index social_clan_requests_user on public.social_clan_requests(user_id);
alter table public.social_friendships enable row level security;
alter table public.social_clans enable row level security;
alter table public.social_clan_members enable row level security;
alter table public.social_clan_requests enable row level security;
revoke all on public.social_friendships, public.social_clans, public.social_clan_members, public.social_clan_requests from public, anon, authenticated;

create function public.social_snapshot(p_search text default '',p_clan_search text default '') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); my_clan uuid; result jsonb;
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 select clan_id into my_clan from public.social_clan_members where user_id=actor;
 select jsonb_build_object(
  'friends',coalesce((select jsonb_agg(jsonb_build_object('username',p.username,'state',case when f.accepted then 'friend' when f.requester=actor then 'outgoing' else 'incoming' end) order by lower(p.username)) from public.social_friendships f join public.profiles p on p.id=case when f.requester=actor then f.recipient else f.requester end where actor in (f.requester,f.recipient)),'[]'::jsonb),
  'players',coalesce((select jsonb_agg(jsonb_build_object('username',x.username,'state',x.state) order by lower(x.username)) from (select p.username,case when f.accepted then 'friend' when f.requester=actor then 'outgoing' when f.recipient=actor then 'incoming' else 'none' end state from public.profiles p left join public.social_friendships f on least(f.requester,f.recipient)=least(actor,p.id) and greatest(f.requester,f.recipient)=greatest(actor,p.id) where p.id<>actor and length(trim(p_search))>=2 and strpos(lower(p.username),lower(trim(p_search)))>0 order by lower(p.username) limit 25) x),'[]'::jsonb),
  'clans',coalesce((select jsonb_agg(to_jsonb(x) order by x.rating desc nulls last,lower(x.name),x.id) from (select c.id,c.name,c.description,c.open,count(m.user_id)::int members,round(avg(public.rating_overall(m.user_id,false))) rating, count(public.rating_overall(m.user_id,false))::int rated,exists(select 1 from public.social_clan_requests q where q.clan_id=c.id and q.user_id=actor) requested from public.social_clans c left join public.social_clan_members m on m.clan_id=c.id where strpos(lower(c.name),lower(trim(coalesce(p_clan_search,''))))>0 group by c.id order by rating desc nulls last,lower(c.name),c.id limit 100) x),'[]'::jsonb),
  'my_clan',my_clan,
  'owned',exists(select 1 from public.social_clans where id=my_clan and owner=actor)
 ) into result;
 return result;
end $$;

create function public.social_clan_detail(p_clan uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 select jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'open',c.open,'owner',op.username,
 'is_owner',c.owner=actor,'is_member',exists(select 1 from public.social_clan_members where clan_id=c.id and user_id=actor),
 'requested',exists(select 1 from public.social_clan_requests where clan_id=c.id and user_id=actor),
 'members',coalesce((select jsonb_agg(jsonb_build_object('username',p.username,'owner',m.user_id=c.owner,'rating',public.rating_overall(m.user_id,false)) order by (m.user_id=c.owner) desc,lower(p.username)) from public.social_clan_members m join public.profiles p on p.id=m.user_id where m.clan_id=c.id),'[]'::jsonb),
 'requests',case when c.owner=actor then coalesce((select jsonb_agg(jsonb_build_object('username',p.username) order by q.created_at) from public.social_clan_requests q join public.profiles p on p.id=q.user_id where q.clan_id=c.id),'[]'::jsonb) else '[]'::jsonb end)
 into result from public.social_clans c join public.profiles op on op.id=c.owner where c.id=p_clan;
 return result;
end $$;

-- Serialize short social mutations to make pair uniqueness, capacity and owner transitions atomic.
create function public.social_action(p_action text,p_name text default null,p_clan uuid default null,p_description text default null,p_open boolean default null) returns void
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
   if (select count(*) from public.social_friendships where requester=actor and not accepted)>=40 then raise exception 'request_limit'; end if;
   insert into public.social_friendships(requester,recipient) values(actor,target);
  elsif p_action='friend_accept' then
   if f.recipient is distinct from actor or f.accepted then raise exception 'request_not_found'; end if;
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
  if p_name is null or char_length(trim(p_name)) not between 3 and 40 or p_name ~ '[[:cntrl:]]' or char_length(coalesce(p_description,''))>300 or p_open is null then raise exception 'invalid_clan'; end if;
  insert into public.social_clans(name,description,owner,open) values(trim(p_name),trim(coalesce(p_description,'')),actor,p_open) returning id into p_clan;
  insert into public.social_clan_members(clan_id,user_id) values(p_clan,actor);
  delete from public.social_clan_requests where user_id=actor;
  return;
 end if;
 select * into c from public.social_clans where id=p_clan;
 if c.id is null then raise exception 'clan_not_found'; end if;
 if p_action='clan_join' then
  if my_clan is not null then raise exception 'already_in_clan'; end if;
  if (select count(*) from public.social_clan_members where clan_id=c.id)>=100 then raise exception 'clan_full'; end if;
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
    if exists(select 1 from public.social_clan_members where user_id=target) then raise exception 'already_in_clan'; end if;
    if (select count(*) from public.social_clan_members where clan_id=c.id)>=100 then raise exception 'clan_full'; end if;
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
  update public.social_clans set name=trim(p_name),description=trim(coalesce(p_description,'')),open=p_open where id=c.id;
 elsif p_action='clan_delete' then
  if c.owner<>actor then raise exception 'not_owner' using errcode='42501'; end if;
  delete from public.social_clans where id=c.id;
 else raise exception 'invalid_action'; end if;
end $$;
revoke all on function public.social_snapshot(text,text),public.social_clan_detail(uuid),public.social_action(text,text,uuid,text,boolean) from public,anon;
grant execute on function public.social_snapshot(text,text),public.social_clan_detail(uuid),public.social_action(text,text,uuid,text,boolean) to authenticated;
