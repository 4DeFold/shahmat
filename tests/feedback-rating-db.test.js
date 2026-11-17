import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('feedback is authenticated, private, validated and limited; own rating is exact even outside top 100', async () => {
  const db=await PGlite.create();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create table public.profiles(id uuid primary key references auth.users(id), username text not null); create table public.yar_mode_ratings(user_id uuid references auth.users(id),mode text,yar numeric,games integer);");
    await db.exec(await readFile('supabase/migrations/20261117090956_yar_leaderboard_efficiency.sql','utf8'));
    await db.exec(await readFile('supabase/migrations/20261117195201_feedback_and_own_rating.sql','utf8'));
    await db.exec("insert into auth.users select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid from generate_series(1,105) i; insert into public.profiles select id,'Player' || right(id::text,12) from auth.users; insert into public.yar_mode_ratings select id,'blitz',1200,10 from auth.users;");
    const own='00000000-0000-4000-8000-000000000105';
    await db.exec(`select set_config('request.jwt.claim.sub','${own}',false); set role authenticated;`);
    const me=(await db.query("select * from public.yar_my_position('blitz')")).rows[0];
    assert.equal(me.username,'Player000000000105'); assert.equal(Number(me.place),105); assert.equal(Number(me.yar),1200);
    assert.equal((await db.query("select * from public.yar_leaderboard('blitz')")).rows.length,100);
    await assert.rejects(db.query('select * from public.feedback'),/permission denied/);
    await assert.rejects(db.query("select public.submit_feedback('bug','x')"),/invalid feedback/);
    await db.query("select public.submit_feedback('bug','  Board bug  ')");
    await db.query("select public.submit_feedback('idea','An idea')"); await db.query("select public.submit_feedback('bug','Another bug')");
    await assert.rejects(db.query("select public.submit_feedback('bug','Fourth message')"),/rate limit/);
    await db.exec('reset role');
    assert.equal((await db.query('select message from public.feedback order by id')).rows[0].message,'Board bug');
    assert.equal((await db.query("select has_function_privilege('anon','public.submit_feedback(text,text)','execute') as allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});
