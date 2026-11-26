-- Bot activity is ephemeral and distinct from saved games. A saved, unfinished
-- game alone does not mean its owner is currently playing it.
create table public.social_bot_activity (
 user_id uuid primary key references auth.users(id) on delete cascade,
 game_id uuid not null references public.bot_games(id) on delete cascade,
 last_seen timestamptz not null default now()
);
alter table public.social_bot_activity enable row level security;
revoke all on public.social_bot_activity from public,anon,authenticated;

create function public.social_bot_heartbeat(p_game uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid();
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 if p_game is null then
  delete from public.social_bot_activity where user_id=actor;
 elsif exists(select 1 from public.bot_games where id=p_game and user_id=actor and status='active') then
  insert into public.social_bot_activity(user_id,game_id,last_seen) values(actor,p_game,clock_timestamp())
  on conflict(user_id) do update set game_id=excluded.game_id,last_seen=excluded.last_seen;
 end if;
end $$;
revoke all on function public.social_bot_heartbeat(uuid) from public,anon;
grant execute on function public.social_bot_heartbeat(uuid) to authenticated;

-- Private helper: only accepted friends, fellow clan members and the player
-- themselves can see presence or bot activity. No arbitrary-user RPC is exposed.
create function public.social_member_activity(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); seen timestamptz; game jsonb;
begin
 if actor is null or not (actor=p_user or exists(select 1 from public.social_friendships f where f.accepted and least(f.requester,f.recipient)=least(actor,p_user) and greatest(f.requester,f.recipient)=greatest(actor,p_user)) or exists(select 1 from public.social_clan_members a join public.social_clan_members b on b.clan_id=a.clan_id where a.user_id=actor and b.user_id=p_user)) then return '{}'::jsonb; end if;
 select last_seen into seen from public.online_presence where user_id=p_user;
 select jsonb_build_object('kind','online','id',g.id,'fen',g.fen,'moves',g.moves,'mode',g.mode,'white',w.username,'black',b.username,'turn',g.turn)
 into game from public.online_games g join public.profiles w on w.id=g.white_id join public.profiles b on b.id=g.black_id
 where g.status='active' and p_user in (g.white_id,g.black_id)
   and clock_timestamp()<g.turn_started_at+(case when g.turn='w' then g.white_ms else g.black_ms end * interval '1 millisecond')
 order by g.created_at desc limit 1;
 if game is null then
  select jsonb_build_object('kind','bot','id',g.id,'moves',to_jsonb(g.moves),'level',g.level,'player_color',g.player_color)
  into game from public.social_bot_activity a join public.bot_games g on g.id=a.game_id and g.user_id=a.user_id
  where a.user_id=p_user and a.last_seen>clock_timestamp()-interval '40 seconds' and g.status='active' limit 1;
 end if;
 return jsonb_build_object('last_seen',seen,'online',seen>clock_timestamp()-interval '45 seconds','game',game);
end $$;
revoke all on function public.social_member_activity(uuid) from public,anon,authenticated;

create or replace function public.social_friends_snapshot(p_search text default '') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid();
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 return jsonb_build_object(
  'friends',coalesce((select jsonb_agg(jsonb_build_object('username',p.username,'state',case when f.accepted then 'friend' when f.requester=actor then 'outgoing' else 'incoming' end) || public.social_member_activity(p.id) order by lower(p.username)) from public.social_friendships f join public.profiles p on p.id=case when f.requester=actor then f.recipient else f.requester end where actor in (f.requester,f.recipient)),'[]'::jsonb),
  'players',coalesce((select jsonb_agg(jsonb_build_object('username',x.username,'state',x.state) order by lower(x.username)) from (select p.username,case when f.accepted then 'friend' when f.requester=actor then 'outgoing' when f.recipient=actor then 'incoming' else 'none' end state from public.profiles p left join public.social_friendships f on least(f.requester,f.recipient)=least(actor,p.id) and greatest(f.requester,f.recipient)=greatest(actor,p.id) where p.id<>actor and length(trim(p_search))>=2 and strpos(lower(p.username),lower(trim(p_search)))>0 order by lower(p.username) limit 25) x),'[]'::jsonb)
 );
end $$;

create or replace function public.social_clan_detail(p_clan uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 select jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'open',c.open,'min_rating',c.min_rating,'owner',op.username,
 'is_owner',c.owner=actor,'is_member',exists(select 1 from public.social_clan_members where clan_id=c.id and user_id=actor),
 'requested',exists(select 1 from public.social_clan_requests where clan_id=c.id and user_id=actor),
 'members',coalesce((select jsonb_agg(jsonb_build_object('username',p.username,'owner',m.user_id=c.owner,'rating',public.rating_overall(m.user_id,false)) || public.social_member_activity(m.user_id) order by (m.user_id=c.owner) desc,lower(p.username)) from public.social_clan_members m join public.profiles p on p.id=m.user_id where m.clan_id=c.id),'[]'::jsonb),
 'requests',case when c.owner=actor then coalesce((select jsonb_agg(jsonb_build_object('username',p.username) order by q.created_at) from public.social_clan_requests q join public.profiles p on p.id=q.user_id where q.clan_id=c.id),'[]'::jsonb) else '[]'::jsonb end)
 into result from public.social_clans c join public.profiles op on op.id=c.owner where c.id=p_clan;
 return result;
end $$;


-- The directory includes every clan, not only the first hundred.
create or replace function public.social_clans_snapshot(p_search text default '') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); my_clan uuid;
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 select clan_id into my_clan from public.social_clan_members where user_id=actor;
 return jsonb_build_object(
  'clans',coalesce((with matching as materialized (select c.* from public.social_clans c where strpos(lower(c.name),lower(trim(coalesce(p_search,''))))>0), scores as materialized (select m.clan_id,m.user_id,public.rating_overall(m.user_id,false) score from public.social_clan_members m join matching c on c.id=m.clan_id) select jsonb_agg(to_jsonb(x) order by x.rating desc nulls last,lower(x.name),x.id) from (select c.id,c.name,c.description,c.open,count(s.user_id)::int members,round(avg(s.score)) rating,count(s.score)::int rated,exists(select 1 from public.social_clan_requests q where q.clan_id=c.id and q.user_id=actor) requested from matching c left join scores s on s.clan_id=c.id group by c.id,c.name,c.description,c.open order by rating desc nulls last,lower(c.name),c.id ) x),'[]'::jsonb),
  'my_clan',my_clan,
  'owned',exists(select 1 from public.social_clans where id=my_clan and owner=actor)
 );
end $$;
