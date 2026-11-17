-- Feedback is private to service administrators. Authenticated users may only
-- submit through the validated, rate-limited RPC, never read or edit reports.
create table public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug','idea')),
  message text not null check (char_length(btrim(message)) between 5 and 2000),
  created_at timestamptz not null default clock_timestamp()
);
create index feedback_user_recent on public.feedback(user_id, created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from public, anon, authenticated;
grant all on public.feedback to service_role;
create function public.submit_feedback(p_category text, p_message text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'unauthorized'; end if;
  if p_category is null or p_category not in ('bug','idea') or p_message is null or char_length(btrim(p_message)) not between 5 and 2000 then raise exception 'invalid feedback'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 1870262191));
  if (select count(*) from public.feedback where user_id=actor and created_at > clock_timestamp() - interval '10 minutes') >= 3 then raise exception 'feedback rate limit'; end if;
  insert into public.feedback(user_id, category, message) values (actor, p_category, btrim(p_message));
end $$;
revoke all on function public.submit_feedback(text,text) from public, anon, authenticated;
grant execute on function public.submit_feedback(text,text) to authenticated;

-- Same ordering and calibration as yar_leaderboard; returns only the caller,
-- including when outside the public top 100. Never exposes user IDs.
create function public.yar_my_position(p_mode text default 'overall')
returns table(username text, yar numeric, ranked boolean, place bigint)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_mode is null or p_mode not in ('overall','blitz','rapid','classical','daily') then raise exception 'invalid mode'; end if;
  return query with scores as (
    select p.id, p.username::text as player_name,
      case when p_mode='overall' then (4000 + coalesce(sum(r.yar - 1000),0))/4
        else coalesce(max(r.yar) filter (where r.mode=p_mode),1000) end as raw_score,
      coalesce(sum(r.games),0) >= 10 as is_ranked
    from public.profiles p left join public.yar_mode_ratings r on r.user_id=p.id
    group by p.id,p.username
  ), ordered as (
    select s.*, row_number() over (order by s.is_ranked desc, s.raw_score desc, lower(s.player_name), s.id) as place from scores s
  ) select o.player_name, round(o.raw_score,1), o.is_ranked, case when o.is_ranked then o.place else null end from ordered o where o.id=auth.uid();
end $$;
revoke all on function public.yar_my_position(text) from public, anon, authenticated;
grant execute on function public.yar_my_position(text) to authenticated;
