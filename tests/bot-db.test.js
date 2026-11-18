import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',G='00000000-0000-4000-8000-000000000003';
test('bot game table is separate, unrated and only the owner can read or write',async()=>{
 const db=await PGlite.create(); try {
  await db.exec("create role anon; create role authenticated; create schema auth; grant usage on schema auth to authenticated; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  await db.exec(await readFile('supabase/migrations/20261117225951_bot_games.sql','utf8'));
  await db.query('insert into auth.users values ($1),($2)',[A,B]);
  await db.exec(`select set_config('request.jwt.claim.sub','${A}',false); set role authenticated;`);
  await db.query("insert into public.bot_games(id,user_id,level,moves,status,started_at) values ($1,$2,1,array['e4'],'active',now())",[G,A]);
  await assert.rejects(db.query("insert into public.bot_games(id,user_id,level,status,started_at) values ('00000000-0000-4000-8000-000000000004',$1,1,'active',now())",[B]),/row-level security/);
  await assert.rejects(db.query("insert into public.bot_games(id,user_id,level,status,started_at) values ('00000000-0000-4000-8000-000000000005',$1,7,'active',now())",[A]),/check constraint/);
  await db.exec(`select set_config('request.jwt.claim.sub','${B}',false)`);
  assert.equal((await db.query('select * from public.bot_games')).rows.length,0);
  assert.equal((await db.query("update public.bot_games set status='draw' returning id")).rows.length,0);
  await db.exec('reset role; set role anon'); await assert.rejects(db.query('select * from public.bot_games'),/permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int n from pg_trigger where tgrelid='public.bot_games'::regclass and not tgisinternal")).rows[0].n,0);
 } finally {await db.close();}
});
