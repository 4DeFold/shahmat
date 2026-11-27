-- Direct challenges never enter the public matchmaking queue.
create table public.direct_challenges (
 id uuid primary key default gen_random_uuid(),
 sender uuid not null references public.profiles(id) on delete cascade,
 recipient uuid not null references public.profiles(id) on delete cascade,
 state text not null default 'pending' check (state in ('pending','accepted','proposed','started','cancelled')),
 mode text, time_control text, game_id uuid references public.online_games(id) on delete set null,
 sender_seen boolean not null default false, recipient_seen boolean not null default false,
 expires_at timestamptz not null default clock_timestamp()+interval '3 minutes',
 created_at timestamptz not null default clock_timestamp(), check(sender<>recipient)
);
create index direct_challenges_sender on public.direct_challenges(sender,created_at desc);
create index direct_challenges_recipient on public.direct_challenges(recipient,created_at desc);
alter table public.direct_challenges enable row level security;
revoke all on public.direct_challenges from public,anon,authenticated;

create function public.direct_related(a uuid,b uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.social_friendships f where f.accepted and least(f.requester,f.recipient)=least(a,b) and greatest(f.requester,f.recipient)=greatest(a,b))
 or exists(select 1 from public.social_clan_members x join public.social_clan_members y on y.clan_id=x.clan_id where x.user_id=a and y.user_id=b)
$$;
create function public.direct_busy(p_user uuid) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare g record;
begin
 for g in select id from public.online_games where status='active' and p_user in (white_id,black_id) loop perform public.online_snapshot(p_user,g.id); end loop;
 return exists(select 1 from public.online_games where status='active' and p_user in (white_id,black_id))
 or exists(select 1 from public.social_bot_activity a join public.bot_games b on b.id=a.game_id and b.user_id=a.user_id where a.user_id=p_user and a.last_seen>clock_timestamp()-interval '40 seconds' and b.status='active');
end $$;
revoke all on function public.direct_related(uuid,uuid),public.direct_busy(uuid) from public,anon,authenticated;

create function public.direct_challenge_action(p_action text,p_id uuid default null,p_name text default null,p_mode text default null,p_control text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); target uuid; c public.direct_challenges%rowtype; ms bigint; gid uuid;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor) then raise exception 'unauthorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(1870262189);
 if p_action='send' then
  select id into target from public.profiles where lower(username)=lower(trim(p_name)) limit 1;
  if target is null or target=actor or not public.direct_related(actor,target) then raise exception 'not_related'; end if;
  if public.direct_busy(actor) or public.direct_busy(target) then raise exception 'player_busy'; end if;
  if exists(select 1 from public.direct_challenges d where d.state in ('pending','accepted','proposed') and d.expires_at>clock_timestamp() and (actor in (d.sender,d.recipient) or target in (d.sender,d.recipient))) then raise exception 'challenge_busy'; end if;
  insert into public.direct_challenges(sender,recipient) values(actor,target) returning * into c;
 elsif p_action in ('accept','propose','confirm','cancel','seen') then
  select * into c from public.direct_challenges where id=p_id and actor in (sender,recipient) for update;
  if not found then raise exception 'challenge_not_found'; end if;
  if p_action='seen' and c.state='started' then
   update public.direct_challenges set sender_seen=sender_seen or actor=sender,recipient_seen=recipient_seen or actor=recipient where id=c.id returning * into c;
  elsif p_action='cancel' and c.state in ('pending','accepted','proposed') then
   update public.direct_challenges set state='cancelled',expires_at=clock_timestamp()+interval '30 seconds' where id=c.id returning * into c;
  else
   if c.expires_at<=clock_timestamp() or c.state not in ('pending','accepted','proposed') then raise exception 'challenge_expired'; end if;
   if not public.direct_related(c.sender,c.recipient) then raise exception 'not_related'; end if;
   if public.direct_busy(c.sender) or public.direct_busy(c.recipient) then raise exception 'player_busy'; end if;
   if p_action='accept' and actor=c.recipient and c.state='pending' then
    update public.direct_challenges set state='accepted',expires_at=clock_timestamp()+interval '3 minutes' where id=c.id returning * into c;
   elsif p_action='propose' and actor=c.sender and c.state='accepted' then
    p_control:=regexp_replace(p_control,'\+0$',''); ms:=public.online_control_ms(p_mode,p_control);
    if ms is null then raise exception 'invalid_control'; end if;
    update public.direct_challenges set state='proposed',mode=p_mode,time_control=p_control,expires_at=clock_timestamp()+interval '3 minutes' where id=c.id returning * into c;
   elsif p_action='confirm' and actor=c.recipient and c.state='proposed' then
    ms:=public.online_control_ms(c.mode,c.time_control);
    delete from public.online_queue where user_id in (c.sender,c.recipient);
    insert into public.online_games(white_id,black_id,mode,game_kind,time_control,white_ms,black_ms) values(c.sender,c.recipient,c.mode,'friendly',c.time_control,ms,ms) returning id into gid;
    insert into public.online_presence(user_id,last_seen) values(c.sender,clock_timestamp()),(c.recipient,clock_timestamp()) on conflict(user_id) do update set last_seen=excluded.last_seen;
    update public.direct_challenges set state='started',game_id=gid,expires_at=clock_timestamp()+interval '3 minutes' where id=c.id returning * into c;
   else raise exception 'invalid_transition'; end if;
  end if;
 else raise exception 'invalid_action'; end if;
 return jsonb_build_object('id',c.id,'state',c.state);
end $$;

-- One private snapshot for notifications on any page; never reveal a request to
-- someone currently in a game. Stale records are ignored, not globally deleted.
create function public.direct_challenge_snapshot() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); c public.direct_challenges%rowtype; name text;
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 select d.* into c from public.direct_challenges d where actor in (d.sender,d.recipient) and d.expires_at>clock_timestamp()
 and (d.state in ('pending','accepted','proposed') or d.state='started' and not (case when actor=d.sender then d.sender_seen else d.recipient_seen end) or d.state='cancelled')
 order by case d.state when 'started' then 0 when 'pending' then 1 when 'accepted' then 1 when 'proposed' then 1 else 2 end,d.created_at desc limit 1;
 if not found then return null; end if;
 if c.state in ('pending','accepted','proposed') and (not public.direct_related(c.sender,c.recipient)
  or exists(select 1 from public.online_games g where g.status='active' and (c.sender in (g.white_id,g.black_id) or c.recipient in (g.white_id,g.black_id)) and clock_timestamp()<g.turn_started_at+(case when g.turn='w' then g.white_ms else g.black_ms end * interval '1 millisecond'))
  or exists(select 1 from public.social_bot_activity a join public.bot_games b on b.id=a.game_id and b.user_id=a.user_id where a.user_id in (c.sender,c.recipient) and a.last_seen>clock_timestamp()-interval '40 seconds' and b.status='active')) then return null; end if;
 select username into name from public.profiles where id=case when actor=c.sender then c.recipient else c.sender end;
 return jsonb_build_object('id',c.id,'state',c.state,'outgoing',actor=c.sender,'name',name,'mode',c.mode,'control',c.time_control,'game_id',c.game_id);
end $$;
revoke all on function public.direct_challenge_action(text,uuid,text,text,text),public.direct_challenge_snapshot() from public,anon;
grant execute on function public.direct_challenge_action(text,uuid,text,text,text),public.direct_challenge_snapshot() to authenticated;
