-- Keep old identifiers readable by older deployed clients during rollout.
-- Publish only a whitelisted piece-set identifier, never raw auth metadata.
create or replace function public.profile_public(p_name text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 select jsonb_build_object('username',p.username,'bio',p.bio,
 'palette',case when u.raw_user_meta_data->>'palette' in ('monochrome','gray','forest','atelier','wood','earth','ocean','amber','lavender','sand') then u.raw_user_meta_data->>'palette' else 'monochrome' end,
 'theme',case when u.raw_user_meta_data->>'palette_theme' in ('dark','light') then u.raw_user_meta_data->>'palette_theme' when u.raw_user_meta_data->>'palette_effective_theme' in ('dark','light') then u.raw_user_meta_data->>'palette_effective_theme' else 'light' end,
 'piece_set',case when u.raw_user_meta_data->>'piece_set' in ('cburnett','classic','angular','rounded','regent','turnier','courtyard','manor','chessnut','fantasy','spatial','celtic') then u.raw_user_meta_data->>'piece_set' else 'cburnett' end,
 'avatar',case when coalesce(re.avatar_unlocked,false) then m.avatar end,'banner',case when coalesce(re.banner_unlocked,false) then m.banner end,
 'ratings',jsonb_build_object('overall',(select round((6000+coalesce(sum((yar-1000)*case mode when 'blitz' then 1 when 'rapid' then 2 else 3 end),0))/6) from public.yar_mode_ratings where user_id=p.id),
 'blitz',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='blitz'),1000),
 'rapid',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='rapid'),1000),
 'classical',coalesce((select round(yar,1) from public.yar_mode_ratings where user_id=p.id and mode='classical'),1000)),
 'games',jsonb_build_object('blitz',(select count(*) from public.online_games g where g.status='finished' and g.mode='blitz' and p.id in (g.white_id,g.black_id)),
 'rapid',(select count(*) from public.online_games g where g.status='finished' and g.mode='rapid' and p.id in (g.white_id,g.black_id)),
 'classical',(select count(*) from public.online_games g where g.status='finished' and g.mode='classical' and p.id in (g.white_id,g.black_id)),
 'bot',(select count(*) from public.bot_games g where g.user_id=p.id and g.status in ('white_win','black_win','draw')))) into result
 from public.profiles p join auth.users u on u.id=p.id left join public.profile_media m on m.user_id=p.id left join public.profile_rewards re on re.user_id=p.id where lower(p.username)=lower(p_name);
 return result;
end $$;

create or replace function public.profile_piece_sets(p_names text[]) returns table(username text,piece_set text)
language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if coalesce(cardinality(p_names),0)>100 then raise exception 'too many names'; end if;
 return query select p.username,case when u.raw_user_meta_data->>'piece_set' in ('cburnett','classic','angular','rounded','regent','turnier','courtyard','manor','chessnut','fantasy','spatial','celtic') then u.raw_user_meta_data->>'piece_set' else 'cburnett' end from public.profiles p join auth.users u on u.id=p.id where p.username=any(p_names);
end $$;
revoke all on function public.profile_piece_sets(text[]) from public,anon;
grant execute on function public.profile_piece_sets(text[]) to authenticated;
