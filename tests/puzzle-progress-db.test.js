import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';

test('puzzle progress is private and revision checks prevent stale overwrites',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon; insert into auth.users values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');`);
  await db.exec(readFileSync('supabase/migrations/20261128120000_puzzle_progress.sql','utf8'));
  await db.exec(`set role authenticated; set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';`);
  let r=await db.query(`select public.save_puzzle_progress(0,'{"version":1,"rating":1516,"history":[]}'::jsonb) as result`);assert.equal(r.rows[0].result.accepted,true);assert.equal(r.rows[0].result.revision,1);
  r=await db.query(`select public.save_puzzle_progress(0,'{"version":1,"rating":1,"history":[]}'::jsonb) as result`);assert.equal(r.rows[0].result.accepted,false);assert.equal(r.rows[0].result.progress.rating,1516);
  await assert.rejects(db.query(`update public.puzzle_progress set progress='{}'`));
  await db.exec(`set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222'`);r=await db.query('select * from public.puzzle_progress');assert.equal(r.rows.length,0);
  r=await db.query(`select public.save_puzzle_progress(0,'{"version":1,"rating":1400,"history":[]}'::jsonb) as result`);assert.equal(r.rows[0].result.accepted,true);r=await db.query('select * from public.puzzle_progress');assert.equal(r.rows.length,1);assert.equal(r.rows[0].progress.rating,1400);
  await db.exec('reset role; set role anon');await assert.rejects(db.query(`select public.save_puzzle_progress(0,'{}'::jsonb)`));
 }finally{await db.close()}
});
