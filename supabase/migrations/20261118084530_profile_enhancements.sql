-- Durable milestones based on overall ЯР, not Elo. Existing history is replayed
-- from the current score so players retain milestones earned before this feature.
create table public.profile_rewards (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  avatar_unlocked boolean not null default false,
  banner_unlocked boolean not null default false,
  avatar_seen boolean not null default false,
  banner_seen boolean not null default false
);
alter table public.profile_rewards enable row level security;
revoke all on public.profile_rewards from public, anon, authenticated;
grant select on public.profile_rewards to authenticated;
create policy profile_rewards_select_own on public.profile_rewards for select to authenticated using (user_id=auth.uid());

with current_scores as (
 select p.id, (4000+coalesce(sum(r.yar-1000),0))/4 score from public.profiles p left join public.yar_mode_ratings r on r.user_id=p.id group by p.id
), history as (
 select h.user_id,h.finished_at,h.game_id, sum(h.after_yar-h.before_yar) over(partition by h.user_id order by h.finished_at,h.game_id rows unbounded preceding) delta,
 sum(h.after_yar-h.before_yar) over(partition by h.user_id) total_delta from public.yar_history h
), peaks as (
 select c.id,greatest(c.score,coalesce(max(c.score+(h.delta-h.total_delta)/4),c.score)) peak
 from current_scores c left join history h on h.user_id=c.id group by c.id,c.score
)
insert into public.profile_rewards(user_id,avatar_unlocked,banner_unlocked)
select id,peak>=1100,peak>=1200 from peaks where peak>=1100;

create function public.profile_update_rewards() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare score numeric;
begin
 select (4000+coalesce(sum(yar-1000),0))/4 into score from public.yar_mode_ratings where user_id=new.user_id;
 if score>=1100 then
  insert into public.profile_rewards(user_id,avatar_unlocked,banner_unlocked) values(new.user_id,true,score>=1200)
  on conflict(user_id) do update set avatar_unlocked=true,banner_unlocked=public.profile_rewards.banner_unlocked or excluded.banner_unlocked;
 end if;
 return new;
end $$;
revoke all on function public.profile_update_rewards() from public,anon,authenticated;
create trigger profile_update_rewards after insert or update of yar on public.yar_mode_ratings for each row execute function public.profile_update_rewards();

create function public.profile_ack_rewards(p_avatar boolean,p_banner boolean) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 update public.profile_rewards set avatar_seen=avatar_seen or (coalesce(p_avatar,false) and avatar_unlocked),banner_seen=banner_seen or (coalesce(p_banner,false) and banner_unlocked) where user_id=auth.uid();
end $$;
revoke all on function public.profile_ack_rewards(boolean,boolean) from public,anon;
grant execute on function public.profile_ack_rewards(boolean,boolean) to authenticated;

-- Existing PNGs remain valid. New JPEGs are bounded by byte size and SOF size.
create function public.profile_jpeg_valid(value text,max_width integer,max_height integer,max_bytes integer) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare b bytea; n integer; i integer:=2; marker integer; len integer; w integer; h integer;
begin
 if value is null then return true; end if;
 if left(value,23)<>'data:image/jpeg;base64,' or length(value)>((max_bytes+2)/3)*4+23 then return false; end if;
 begin b:=decode(substr(value,24),'base64'); exception when others then return false; end;
 n:=octet_length(b); if n<12 or n>max_bytes or get_byte(b,0)<>255 or get_byte(b,1)<>216 then return false; end if;
 while i+3<n loop
  if get_byte(b,i)<>255 then return false; end if;
  while i<n and get_byte(b,i)=255 loop i:=i+1; end loop;
  if i>=n then return false; end if; marker:=get_byte(b,i); i:=i+1;
  if marker in (216,217,1) or marker between 208 and 215 then continue; end if;
  if i+1>=n then return false; end if; len:=get_byte(b,i)*256+get_byte(b,i+1);
  if len<2 or i+len>n then return false; end if;
  if marker in (192,193,194,195,197,198,199,201,202,203,205,206,207) then
   if len<8 then return false; end if;
   h:=get_byte(b,i+3)*256+get_byte(b,i+4); w:=get_byte(b,i+5)*256+get_byte(b,i+6);
   return w between 1 and max_width and h between 1 and max_height;
  end if;
  if marker=218 then return false; end if;
  i:=i+len;
 end loop;
 return false;
end $$;
revoke all on function public.profile_jpeg_valid(text,integer,integer,integer) from public,anon;
grant execute on function public.profile_jpeg_valid(text,integer,integer,integer) to authenticated;
alter table public.profile_media drop constraint profile_media_avatar_check, drop constraint profile_media_banner_check;
alter table public.profile_media add constraint profile_media_avatar_check check (public.profile_png_valid(avatar,100,100,120000) or public.profile_jpeg_valid(avatar,384,384,200000)),
 add constraint profile_media_banner_check check (public.profile_png_valid(banner,600,1200,2000000) or public.profile_jpeg_valid(banner,1440,480,450000));

-- Also guard direct table writes. Existing locked media is preserved but hidden;
-- unchanged media may be retained when saving text.
create function public.profile_media_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare a boolean; b boolean; prior_avatar text; prior_banner text;
begin
 if tg_op='INSERT' then select avatar,banner into prior_avatar,prior_banner from public.profile_media where user_id=new.user_id; else prior_avatar:=old.avatar; prior_banner:=old.banner; end if;
 select avatar_unlocked,banner_unlocked into a,b from public.profile_rewards where user_id=new.user_id;
 if new.avatar is not null and not coalesce(a,false) and new.avatar is distinct from prior_avatar then raise exception 'avatar_locked'; end if;
 if new.banner is not null and not coalesce(b,false) and new.banner is distinct from prior_banner then raise exception 'banner_locked'; end if;
 return new;
end $$;
revoke all on function public.profile_media_guard() from public,anon,authenticated;
create trigger profile_media_guard before insert or update on public.profile_media for each row execute function public.profile_media_guard();

create or replace function public.profile_avatars(p_names text[]) returns table(username text,avatar text)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if p_names is null or cardinality(p_names)>100 then raise exception 'invalid names'; end if;
 return query select p.username,case when coalesce(r.avatar_unlocked,false) then m.avatar end from public.profiles p left join public.profile_media m on m.user_id=p.id left join public.profile_rewards r on r.user_id=p.id where p.username=any(p_names);
end $$;

-- Public profile exposes only the fields required by cards and profile views.
create function public.profile_public(p_name text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 select jsonb_build_object('username',p.username,'bio',p.bio,
 'palette',case when u.raw_user_meta_data->>'palette' in ('monochrome','gray','forest','atelier','wood','earth','ocean','amber','lavender','sand') then u.raw_user_meta_data->>'palette' else 'monochrome' end,
 'theme',case when u.raw_user_meta_data->>'palette_theme' in ('dark','light') then u.raw_user_meta_data->>'palette_theme' when u.raw_user_meta_data->>'palette_effective_theme' in ('dark','light') then u.raw_user_meta_data->>'palette_effective_theme' else 'light' end,
 'avatar',case when coalesce(re.avatar_unlocked,false) then m.avatar end,'banner',case when coalesce(re.banner_unlocked,false) then m.banner end,
 'ratings',jsonb_build_object('overall',round((4000+coalesce((select sum(yar-1000) from public.yar_mode_ratings where user_id=p.id),0))/4,1),
 'blitz',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='blitz'),1000),
 'rapid',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='rapid'),1000),
 'classical',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='classical'),1000),
 'daily',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='daily'),1000)),
 'games',jsonb_build_object('blitz',(select count(*) from public.online_games g where g.status='finished' and g.mode='blitz' and p.id in (g.white_id,g.black_id)),
 'rapid',(select count(*) from public.online_games g where g.status='finished' and g.mode='rapid' and p.id in (g.white_id,g.black_id)),
 'classical',(select count(*) from public.online_games g where g.status='finished' and g.mode='classical' and p.id in (g.white_id,g.black_id)),
 'daily',(select count(*) from public.online_games g where g.status='finished' and g.mode='daily' and p.id in (g.white_id,g.black_id)),
 'bot',(select count(*) from public.bot_games g where g.user_id=p.id and g.status in ('white_win','black_win','draw')))) into result
 from public.profiles p join auth.users u on u.id=p.id left join public.profile_media m on m.user_id=p.id left join public.profile_rewards re on re.user_id=p.id where lower(p.username)=lower(p_name);
 return result;
end $$;
revoke all on function public.profile_public(text) from public,anon;
grant execute on function public.profile_public(text) to authenticated;
