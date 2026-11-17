import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002', C='00000000-0000-4000-8000-000000000003';
test('shadow Elo starts separately, rates eligible games once, and never determines places',async()=>{
 const db=await PGlite.create(); try {
  await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create table public.profiles(id uuid primary key references auth.users(id), username text not null);");
  for(const n of ['20261116121744_online_matchplay.sql','20261116121912_online_match_clock_after_lock.sql','20261117085337_yar_ratings.sql','20261117090956_yar_leaderboard_efficiency.sql','20261117195201_feedback_and_own_rating.sql','20261117203257_shadow_elo.sql','20261117212038_leaderboard_positions.sql']) await db.exec(await readFile('supabase/migrations/'+n,'utf8'));
  await db.query('insert into auth.users values ($1),($2),($3)',[A,B,C]);
  await db.query("insert into public.profiles values ($1,'Alice'),($2,'Bob'),($3,'Carol')",[A,B,C]);
  const finish=async (result,mode='rapid')=>{const id=(await db.query('insert into public.online_games(white_id,black_id,mode,white_ms,black_ms) values ($1,$2,$3,1000,1000) returning id',[A,B,mode])).rows[0].id; await db.query("update public.online_games set status='finished',result=$2,finished_at='2026-01-01T12:00:00Z' where id=$1",[id,result]);return id;};
  let id=await finish('white_win'); let scores=(await db.query('select * from public.yar_mode_ratings order by user_id')).rows;
  assert.equal(Number(scores[0].elo_shadow),1010); assert.equal(Number(scores[1].elo_shadow),990); assert.equal(Number(scores[0].yar),1024);
  await db.query("update public.online_games set reason='checkmate' where id=$1",[id]); assert.equal(Number((await db.query('select elo_shadow from public.yar_mode_ratings where user_id=$1',[A])).rows[0].elo_shadow),1010);
  await finish('draw');
  let afterDraw=(await db.query('select elo_shadow from public.yar_mode_ratings order by user_id')).rows;
  const expected=1/(1+10**((990-1010)/400));
  assert.equal(Number(afterDraw[0].elo_shadow),Number((1010+20*(.5-expected)).toFixed(4)));
  await finish('black_win'); await finish('white_win');
  assert.equal((await db.query('select count(*)::int n from public.yar_history')).rows[0].n,6);
  assert.equal((await db.query('select count(*)::int n from public.yar_history where before_elo is not null and after_elo is not null')).rows[0].n,6);
  await db.exec(`select set_config('request.jwt.claim.sub','${A}',false); set role authenticated`);
  const list=(await db.query("select * from public.rank_leaderboard('rapid')")).rows;
  assert.deepEqual(list.map(x=>x.username),['Alice','Carol','Bob']);
  const own=(await db.query("select * from public.rank_my_position('rapid')")).rows[0];
  assert.equal(own.ranked,false); assert.equal(Number(own.place),1);
  assert.equal(own.username,'Alice'); assert.equal(Number(own.elo),Number(list.find(x=>x.username==='Alice').elo));
  const overall=(await db.query("select * from public.rank_my_position('overall')")).rows[0];
  assert.equal(Number(overall.elo),Number(((3000+Number(own.elo))/4).toFixed(1)));
  await assert.rejects(db.query("select * from public.rank_my_position('bogus')"),/invalid mode/);
  const players=(await db.query('select * from public.rank_game_players($1)',[id])).rows; assert.equal(players.length,2); assert.equal(players.find(x=>x.player==='self').username,'Alice');
  await assert.rejects(db.query('select * from public.yar_mode_ratings'),/permission denied/);
  await db.exec(`select set_config('request.jwt.claim.sub','${C}',false)`); await assert.rejects(db.query('select * from public.rank_game_players($1)',[id]),/game not found/);
 } finally { await db.close(); }
});


test('all players have positions in full precision ЯР order including beyond the first 100',async()=>{
 const db=await PGlite.create(); try {
  await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create table public.profiles(id uuid primary key references auth.users(id), username text not null);");
  for(const n of ['20261116121744_online_matchplay.sql','20261116121912_online_match_clock_after_lock.sql','20261117085337_yar_ratings.sql','20261117090956_yar_leaderboard_efficiency.sql','20261117195201_feedback_and_own_rating.sql','20261117203257_shadow_elo.sql','20261117212038_leaderboard_positions.sql']) await db.exec(await readFile('supabase/migrations/'+n,'utf8'));
  await db.exec(`insert into auth.users select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid from generate_series(1,102) i;
   insert into public.profiles select id, 'user' || right(id::text,12) from auth.users;
   insert into public.yar_mode_ratings(user_id,mode,yar,games,elo_shadow) values ('${A}','rapid',1005.04,1,900),('${B}','rapid',1005.03,10,1500);
   select set_config('request.jwt.claim.sub','${A}',false); set role authenticated;`);
  const list=(await db.query("select * from public.rank_leaderboard('rapid')")).rows;
  assert.equal(list.length,100); assert.equal(list[0].username,'user000000000001'); assert.equal(list[0].ranked,false);
  assert.equal(list[1].username,'user000000000002'); assert.equal(list[1].ranked,true);
  assert.equal(Number((await db.query("select place from public.rank_my_position('rapid')")).rows[0].place),1);
  await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',false)");
  assert.equal(Number((await db.query("select place from public.rank_my_position('rapid')")).rows[0].place),102);
 } finally {await db.close();}
});
