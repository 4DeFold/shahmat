-- Profile media are owner-written PNG data; public avatars are exposed only
-- through a bounded authenticated lookup, never through the owner-only table.
alter table public.profiles add column username_changed_at timestamptz;
create function public.profile_username_cooldown() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if TG_OP = 'INSERT' then
    new.username_changed_at := null;
  elsif new.username is distinct from old.username then
    if old.username_changed_at is not null and old.username_changed_at > clock_timestamp() - interval '7 days' then
      raise exception 'username_change_cooldown' using errcode = 'P0001';
    end if;
    new.username_changed_at := clock_timestamp();
  else
    new.username_changed_at := old.username_changed_at;
  end if;
  return new;
end $$;
revoke all on function public.profile_username_cooldown() from public, anon, authenticated;
create trigger profile_username_cooldown before insert or update on public.profiles
for each row execute function public.profile_username_cooldown();

-- A PNG signature and IHDR constrain accepted image dimensions even for
-- direct API callers. The UI re-encodes raster uploads as PNG before saving.
create function public.profile_png_valid(value text, max_width integer, max_height integer, max_bytes integer) returns boolean
language plpgsql immutable set search_path = pg_catalog as $$
declare bytes bytea; w bigint; h bigint;
begin
  if value is null then return true; end if;
  if length(value) > ((max_bytes + 2) / 3) * 4 + 22 or left(value,22) <> 'data:image/png;base64,' then return false; end if;
  begin bytes := decode(substr(value,23), 'base64'); exception when others then return false; end;
  if octet_length(bytes) < 33 or octet_length(bytes) > max_bytes
    or substring(bytes from 1 for 8) <> decode('89504e470d0a1a0a','hex')
    or substring(bytes from 9 for 8) <> decode('0000000d49484452','hex') then return false; end if;
  w := get_byte(bytes,16)::bigint*16777216 + get_byte(bytes,17)::bigint*65536 + get_byte(bytes,18)::bigint*256 + get_byte(bytes,19);
  h := get_byte(bytes,20)::bigint*16777216 + get_byte(bytes,21)::bigint*65536 + get_byte(bytes,22)::bigint*256 + get_byte(bytes,23);
  return w between 1 and max_width and h between 1 and max_height;
end $$;
revoke all on function public.profile_png_valid(text,integer,integer,integer) from public, anon;
grant execute on function public.profile_png_valid(text,integer,integer,integer) to authenticated;

create table public.profile_media (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  avatar text check (public.profile_png_valid(avatar,100,100,120000)),
  banner text check (public.profile_png_valid(banner,600,1200,2000000)),
  updated_at timestamptz not null default now()
);
alter table public.profile_media enable row level security;
revoke all on public.profile_media from public, anon, authenticated;
grant select,insert,update on public.profile_media to authenticated;
create policy profile_media_select_own on public.profile_media for select to authenticated using (user_id = (select auth.uid()));
create policy profile_media_insert_own on public.profile_media for insert to authenticated with check (user_id = (select auth.uid()));
create policy profile_media_update_own on public.profile_media for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Save text and both images atomically. Existing profiles remain compatible
-- with the previous client; its ordinary updates still hit the cooldown trigger.
create function public.profile_save(p_username text,p_bio text,p_avatar text,p_banner text) returns void
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'unauthorized'; end if;
  update public.profiles set username=p_username,bio=p_bio where id=actor;
  if not found then raise exception 'profile_not_found'; end if;
  insert into public.profile_media(user_id,avatar,banner) values(actor,p_avatar,p_banner)
  on conflict(user_id) do update set avatar=excluded.avatar,banner=excluded.banner,updated_at=now();
end $$;
revoke all on function public.profile_save(text,text,text,text) from public, anon;
grant execute on function public.profile_save(text,text,text,text) to authenticated;

create function public.profile_avatars(p_names text[]) returns table(username text,avatar text)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_names is null or cardinality(p_names)>100 then raise exception 'invalid names'; end if;
  return query select p.username, m.avatar from public.profiles p left join public.profile_media m on m.user_id=p.id
    where p.username = any(p_names);
end $$;
revoke all on function public.profile_avatars(text[]) from public, anon;
grant execute on function public.profile_avatars(text[]) to authenticated;

-- Keep profile counts efficient without changing the live match indexes.
create index online_games_finished_white_profile_idx on public.online_games(white_id) where status='finished';
create index online_games_finished_black_profile_idx on public.online_games(black_id) where status='finished';

-- Count finished online and bot games, excluding active/abandoned games.
create function public.profile_my_stats() returns table(games bigint)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'unauthorized'; end if;
  return query select (select count(*) from public.online_games g where g.status='finished' and actor in (g.white_id,g.black_id))
     + (select count(*) from public.bot_games b where b.user_id=actor and b.status in ('white_win','black_win','draw'));
end $$;
revoke all on function public.profile_my_stats() from public, anon;
grant execute on function public.profile_my_stats() to authenticated;
