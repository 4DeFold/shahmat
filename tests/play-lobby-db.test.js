import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004'];
test('friendly and rated queues and controls are isolated; friendly finishes never change either rating',async()=>{
 const db=await PGlite.create();try{
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
  for(const [i,id] of ids.entries()){await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into profiles(id,username) values($1,$2)',[id,'User'+i]);}
  const find=async(id,kind,control='3')=>(await db.query("select online_find_kind($1,'blitz',$2,$3) x",[id,control,kind])).rows[0].x;
  assert.equal((await find(ids[0],'friendly')).state,'searching');
  assert.equal((await find(ids[1],'rated')).state,'searching');
  assert.equal((await find(ids[2],'friendly','3+2')).state,'searching');
  const match=await find(ids[3],'friendly');assert.equal(match.state,'matched');
  let g=(await db.query('select * from online_games where id=$1',[match.game_id])).rows[0];assert.equal(g.game_kind,'friendly');assert.equal(g.white_id,ids[0]);assert.equal(g.black_id,ids[3]);
  await db.query("update online_games set status='finished',result='white_win',finished_at=clock_timestamp() where id=$1",[g.id]);
  await db.exec(`set request.jwt.claim.sub='${ids[0]}'`);
  assert.deepEqual((await db.query('select * from rank_game_result($1)',[g.id])).rows,[]);
  assert.equal((await db.query('select count(*)::int n from yar_history where game_id=$1',[g.id])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from yar_mode_ratings')).rows[0].n,0);
  const rated=(await db.query("select online_find($1,'blitz') r",[ids[0]])).rows[0].r;assert.equal(rated.state,'matched');
  g=(await db.query('select * from online_games where id=$1',[rated.game_id])).rows[0];assert.equal(g.game_kind,'rated');assert.equal(g.white_id,ids[1]);
  await db.query("update online_games set status='finished',result='white_win',finished_at=clock_timestamp() where id=$1",[g.id]);
  assert.equal((await db.query('select count(*)::int n from yar_history where game_id=$1 and before_elo is not null',[g.id])).rows[0].n,2);
  const changes=(await db.query('select * from rank_game_result($1) order by player',[g.id])).rows;assert.equal(changes.length,2);
  assert.ok(Number(changes.find(r=>r.player==='self').after_yar)<Number(changes.find(r=>r.player==='self').before_yar));
  assert.ok(Number(changes.find(r=>r.player==='opponent').after_yar)>Number(changes.find(r=>r.player==='opponent').before_yar));
  await db.exec(`set request.jwt.claim.sub='${ids[2]}'`);await assert.rejects(db.query('select * from rank_game_result($1)',[g.id]),/game not found/);
  assert.equal((await db.query("select has_function_privilege('anon','public.rank_game_result(uuid)','execute') allowed")).rows[0].allowed,false);
  await assert.rejects(db.query("select online_find_kind($1,'bullet','3','friendly')",[ids[0]]),/invalid request/);
  await db.exec("set request.jwt.claim.sub=''");
  await assert.rejects(db.query('select * from play_demo_games()'),/unauthorized/);
  await assert.rejects(db.query('select * from rank_game_result($1)',[g.id]),/unauthorized/);
 } finally{await db.close()}
});

test('pool counts include fresh searchers and online players in unexpired games only',async()=>{
 const db=await PGlite.create();try {
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
  for(const id of ids)await db.query('insert into auth.users(id) values($1)',[id]);
  await assert.rejects(db.query('select * from play_lobby_online_counts()'),/unauthorized/);
  await db.exec(`set request.jwt.claim.sub='${ids[0]}'`);
  await db.query("insert into online_queue(user_id,mode,game_kind,time_control,heartbeat_at) values ($1,'blitz','rated','3+2',now()),($2,'rapid','friendly','10',now()-interval '31 seconds')",[ids[0],ids[1]]);
  await db.query("insert into online_games(white_id,black_id,mode,game_kind,time_control,white_ms,black_ms) values($1,$2,'rapid','friendly','10',600000,600000)",[ids[1],ids[2]]);
  await db.query("insert into online_presence(user_id,last_seen) values($1,now()),($2,now()-interval '61 seconds')",[ids[1],ids[2]]);
  let rows=(await db.query('select * from play_lobby_online_counts() order by game_kind')).rows;
  assert.deepEqual(rows.map(r=>[r.game_kind,r.mode,r.time_control,Number(r.online)]),[['friendly','rapid','10',1],['rated','blitz','3+2',1]]);
  await db.query("update online_presence set last_seen=now() where user_id=$1",[ids[2]]);
  await db.query("update online_queue set heartbeat_at=now() where user_id=$1",[ids[1]]); // Duplicate user is counted once per pool.
  rows=(await db.query("select online from play_lobby_online_counts() where game_kind='friendly'")).rows;assert.equal(Number(rows[0].online),2);
  await db.exec("update online_games set turn_started_at=now()-interval '11 minutes'");
  rows=(await db.query("select online from play_lobby_online_counts() where game_kind='friendly'")).rows;assert.equal(Number(rows[0].online),1);
  assert.equal((await db.query("select has_function_privilege('anon','public.play_lobby_online_counts()','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close()}
});
