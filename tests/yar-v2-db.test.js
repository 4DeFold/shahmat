import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003';
const migration='20261119101108_yar_v2_replay.sql';
test('v2 replay, limits, Elo preservation, weighted RPCs, rewards and live triggers',async()=>{
 const db=await PGlite.create();try{
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<migration).sort()) await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
  await db.query("insert into auth.users(id) values($1),($2),($3)",[A,B,C]);
  await db.query("insert into public.profiles(id,username) values($1,'Alice'),($2,'Bobby'),($3,'Carol')",[A,B,C]);
  // Include games before historical rating rollout and multiple games over the pair cap.
  const ids=[];
  for(let i=0;i<4;i++) {
   const id=(await db.query("insert into online_games(white_id,black_id,mode,white_ms,black_ms) values($1,$2,'blitz',180000,180000) returning id",[A,B])).rows[0].id;
   await db.query("update online_games set status='finished',result='white_win',finished_at=$2 where id=$1",[id,`2026-01-01T12:00:0${i}Z`]);ids.push(id);
  }
  const old=(await db.query('select user_id,elo_shadow from yar_mode_ratings order by user_id')).rows;
  await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
  const result=(await db.query('select user_id,yar,games,elo_shadow from yar_mode_ratings order by user_id')).rows;
  assert.deepEqual(result.map(r=>Number(r.yar)),[1028,972]);assert.deepEqual(result.map(r=>r.games),[3,3]);
  assert.deepEqual(result.map(r=>r.elo_shadow),old.map(r=>r.elo_shadow));
  assert.equal((await db.query('select count(*)::int n from yar_v2_backup.history')).rows[0].n,6);
  assert.equal((await db.query('select count(*)::int n from yar_history')).rows[0].n,6);
  assert.equal((await db.query("select time_control from online_games where id=$1",[ids[0]])).rows[0].time_control,'3');
  const live=(await db.query("insert into online_games(white_id,black_id,mode,white_ms,black_ms) values($1,$2,'rapid',600000,600000) returning id,time_control",[A,C])).rows[0];assert.equal(live.time_control,'10');
  await db.query("update online_games set status='finished',result='draw',finished_at='2026-01-02T00:00:00Z' where id=$1",[live.id]);
  assert.equal((await db.query('select count(*)::int n from yar_history where game_id=$1 and before_elo is not null',[live.id])).rows[0].n,2);
  await db.query("update yar_mode_ratings set yar=1200 where user_id=$1 and mode='blitz'",[A]);
  await db.query("update yar_mode_ratings set yar=1100 where user_id=$1 and mode='rapid'",[A]);
  await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);set role authenticated`);
  const rank=(await db.query("select * from rank_my_position('overall')")).rows[0]; assert.equal(Number(rank.yar),1067);
  assert.equal((await db.query("select profile_public('Alice') p")).rows[0].p.ratings.overall,1067);
  assert.equal(Number((await db.query("select * from yar_leaderboard('overall') where username='Alice'")).rows[0].yar),1067);
  await assert.rejects(db.query('select * from yar_v2_backup.history'),/permission denied/);
  await db.exec('reset role');
  await db.query("update yar_mode_ratings set yar=1600 where user_id=$1 and mode='blitz'",[A]);
  assert.equal((await db.query('select avatar_unlocked from profile_rewards where user_id=$1',[A])).rows[0].avatar_unlocked,true);
  await db.query("update yar_mode_ratings set yar=1000 where user_id=$1 and mode='blitz'",[A]);
  assert.equal((await db.query('select avatar_unlocked from profile_rewards where user_id=$1',[A])).rows[0].avatar_unlocked,true);
  await assert.rejects(db.query("update yar_mode_ratings set yar=1000.1 where user_id=$1",[A]),/yar_mode_ratings_integer_check/);
 }finally{await db.close()}
});

test('v2 player cap is 25 per UTC day across opponents and modes',async()=>{
 const db=await PGlite.create();try{
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<=migration).sort()) await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
  await db.query('insert into auth.users(id) values($1)',[A]);
  for(let i=1;i<=26;i++){
   const opponent=`00000000-0000-4000-9000-${String(i).padStart(12,'0')}`;
   await db.query('insert into auth.users(id) values($1)',[opponent]);
   const id=(await db.query("insert into online_games(white_id,black_id,mode,white_ms,black_ms) values($1,$2,$3,180000,180000) returning id",[A,opponent,i%2?'blitz':'rapid'])).rows[0].id;
   await db.query("update online_games set status='finished',result='white_win',finished_at='2026-01-01T23:59:00Z' where id=$1",[id]);
   if(i===26){
    assert.equal((await db.query('select count(*)::int n from yar_history where game_id=$1',[id])).rows[0].n,0);
    const next=(await db.query("insert into online_games(white_id,black_id,mode,white_ms,black_ms) values($1,$2,'rapid',180000,180000) returning id",[A,opponent])).rows[0].id;
    await db.query("update online_games set status='finished',result='white_win',finished_at='2026-01-02T00:00:00Z' where id=$1",[next]);
    assert.equal((await db.query('select count(*)::int n from yar_history where game_id=$1',[next])).rows[0].n,2);
   }
  }
  assert.equal((await db.query('select count(*)::int n from yar_history where user_id=$1',[A])).rows[0].n,26);
 }finally{await db.close()}
});
