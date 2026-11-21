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
  assert.equal((await db.query('select count(*)::int n from yar_history where game_id=$1',[g.id])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from yar_mode_ratings')).rows[0].n,0);
  const rated=(await db.query("select online_find($1,'blitz') r",[ids[0]])).rows[0].r;assert.equal(rated.state,'matched');
  g=(await db.query('select * from online_games where id=$1',[rated.game_id])).rows[0];assert.equal(g.game_kind,'rated');assert.equal(g.white_id,ids[1]);
  await db.query("update online_games set status='finished',result='white_win',finished_at=clock_timestamp() where id=$1",[g.id]);
  assert.equal((await db.query('select count(*)::int n from yar_history where game_id=$1 and before_elo is not null',[g.id])).rows[0].n,2);
  await assert.rejects(db.query("select online_find_kind($1,'bullet','3','friendly')",[ids[0]]),/invalid request/);
  await assert.rejects(db.query('select * from play_demo_games()'),/unauthorized/);
 } finally{await db.close()}
});
