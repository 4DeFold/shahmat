create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  bio text not null default '' check (char_length(bio) <= 280),
  palette text not null default 'monochrome' check (palette = 'monochrome'),
  created_at timestamptz not null default now()
);
create unique index profiles_username_unique on public.profiles (lower(username));
alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;
create policy "Users can read their profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Users can create their profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users can update their profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
