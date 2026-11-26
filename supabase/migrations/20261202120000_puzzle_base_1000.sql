-- Snapshot the exact pre-migration rows under a write lock. This is intentionally
-- private and retained for recovery; revision bumps invalidate stale clients.
lock table public.puzzle_progress in share row exclusive mode;
create table public.puzzle_progress_base_1500_backup as table public.puzzle_progress;
alter table public.puzzle_progress_base_1500_backup enable row level security;
revoke all on public.puzzle_progress_base_1500_backup from public, anon, authenticated;

create function public.puzzle_rebase_1000(p jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare entry jsonb; rebuilt jsonb:='[]'::jsonb; score integer:=1000; before_score integer; task_rating double precision; success boolean;
begin
 if p is null then return null; end if;
 if p->>'version' is distinct from '1' or jsonb_typeof(p->'history') is distinct from 'array' then
   raise exception 'Invalid puzzle progress history' using errcode='22023';
 end if;
 for entry in select value from jsonb_array_elements(p->'history') order by (value->>'at')::numeric, value->>'id' collate "C" loop
   if jsonb_typeof(entry->'id') is distinct from 'string' or jsonb_typeof(entry->'success') is distinct from 'boolean' or jsonb_typeof(entry->'rating') is distinct from 'number' or jsonb_typeof(entry->'at') is distinct from 'number' or jsonb_typeof(entry->'themes') is distinct from 'array' then
     raise exception 'Invalid puzzle result' using errcode='22023';
   end if;
   before_score:=score; task_rating:=(entry->>'rating')::double precision; success:=(entry->>'success')::boolean;
   score:=greatest(100,least(3000,score+floor(32*((case when success then 1 else 0 end)-1/(1+power(10::double precision,(task_rating-score)/400)))+0.5)::integer));
   rebuilt:=jsonb_build_array(jsonb_set(entry,'{delta}',to_jsonb(score-before_score))) || rebuilt;
 end loop;
 return jsonb_set(jsonb_set(jsonb_set(p,'{history}',rebuilt),'{rating}',to_jsonb(score)),'{ratingBase}','1000'::jsonb,true);
end $$;
revoke all on function public.puzzle_rebase_1000(jsonb) from public,anon,authenticated;

update public.puzzle_progress set progress=public.puzzle_rebase_1000(progress), revision=revision+1, updated_at=now() where progress is not null;

-- Also normalize old production clients, which can continue writing version 1
-- during the branch preview. CAS still prevents overwriting concurrent work.
create or replace function public.save_puzzle_progress(p_expected_revision bigint, p_progress jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); current_row public.puzzle_progress;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_progress is null or jsonb_typeof(p_progress)<>'object' or octet_length(p_progress::text)>524288 then raise exception 'Invalid puzzle progress' using errcode='22023'; end if;
 insert into public.puzzle_progress(user_id) values(uid) on conflict(user_id) do nothing;
 select * into current_row from public.puzzle_progress where user_id=uid for update;
 if current_row.revision<>p_expected_revision then return jsonb_build_object('accepted',false,'revision',current_row.revision,'progress',current_row.progress); end if;
 update public.puzzle_progress set progress=public.puzzle_rebase_1000(p_progress),revision=revision+1,updated_at=now() where user_id=uid returning * into current_row;
 return jsonb_build_object('accepted',true,'revision',current_row.revision,'progress',current_row.progress);
end $$;
