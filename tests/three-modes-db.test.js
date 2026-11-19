import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
test('three-mode migration preserves data, computes overall, enforces boundaries and theme privacy',async()=>{
 const db=await PGlite.create();try{
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  const files=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
  for(const file of files.filter(f=>f < files.find(x=>x.includes('three_modes')))) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  await db.query("insert into auth.users(id,raw_user_meta_data) values($1,'{\"palette\":\"amber\"}'),($2,'{}')",[A,B]);
  await db.query("insert into public.profiles(id,username) values($1,'Alice'),($2,'Bobby')",[A,B]);
  await db.query("insert into public.yar_mode_ratings(user_id,mode,yar,elo_shadow,games) values($1,'blitz',1300,1150,10)",[A]);
  const sql=await readFile('supabase/migrations/'+files.find(f=>f.includes('three_modes')),'utf8');
  await db.query("insert into public.online_queue(user_id,mode,queued_at,heartbeat_at) values($1,'daily',now(),now())",[B]);
  await assert.rejects(db.exec(sql),/daily data exists/);
  assert.equal((await db.query("select count(*)::int n from online_queue where mode='daily'")).rows[0].n,1,'migration never deletes daily data');
  await db.query('delete from public.online_queue where user_id=$1',[B]);
  await db.exec(sql);
  await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);set role authenticated`);
  const list=(await db.query("select * from rank_leaderboard('overall')")).rows;assert.equal(Number(list[0].yar),1100);assert.equal(Number(list[0].elo),1050);
  const profile=(await db.query("select profile_public('Alice') p")).rows[0].p;assert.equal(profile.ratings.overall,1100);assert.equal('daily' in profile.ratings,false);
  assert.equal((await db.query('select * from profile_rewards')).rows[0].avatar_unlocked,true);
  assert.equal((await db.query("select * from profile_avatar_themes(array['Alice'])")).rows[0].palette,'amber');
  await assert.rejects(db.query("select * from rank_leaderboard('daily')"),/invalid mode/);
  await db.exec('reset role;set role service_role');await assert.rejects(db.query("select public.online_find($1,'daily')",[A]),/invalid request/);
  await db.exec('reset role;set role anon');await assert.rejects(db.query("select * from profile_avatar_themes(array['Alice'])"),/permission denied/);
 }finally{await db.close();}
});
