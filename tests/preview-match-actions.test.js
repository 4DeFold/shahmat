import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002', C='00000000-0000-4000-8000-000000000003';
test('isolated match actions serialize resignation, disconnection claims, reconnection and timeout', async () => {
 const db=await PGlite.create();
 try {
  await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
  await db.exec(await readFile('supabase/migrations/20261117031548_isolated_preview_matchplay_actions.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261117042549_preview_game_age.sql','utf8'));
  await db.query('insert into auth.users values ($1),($2),($3)',[A,B,C]);
  const call=async(sql,args)=>(await db.query(`select public.${sql} as result`,args)).rows[0].result;
  const match=async()=>{ await call('preview_online_find($1,$2)',[A,'rapid']); return (await call('preview_online_find($1,$2)',[B,'rapid'])).game_id; };
  let id=await match();
  assert.ok((await call('preview_online_match_snapshot($1,$2)',[A,id])).game_age_ms < 60000);
  await db.query("update public.preview_online_games set created_at=clock_timestamp()-interval '61 seconds' where id=$1",[id]);
  assert.ok((await call('preview_online_match_snapshot($1,$2)',[A,id])).game_age_ms >= 60000);
  assert.equal(await call('preview_online_finish($1,$2,$3)',[C,id,'resign']), null);
  let game=await call('preview_online_finish($1,$2,$3)',[A,id,'resign']);
  assert.equal(game.result,'black_win'); assert.equal(game.reason,'resignation'); assert.equal(game.status,'finished');
  assert.equal((await call('preview_online_finish($1,$2,$3)',[B,id,'resign'])).result,'black_win');
  id=await match();
  assert.equal((await call('preview_online_finish($1,$2,$3)',[A,id,'offline_win'])).status,'active');
  await db.query('delete from public.preview_online_presence where user_id=$1',[B]);
  assert.equal((await call('preview_online_finish($1,$2,$3)',[A,id,'offline_win'])).status,'active');
  await call('preview_online_heartbeat($1)',[B]);
  assert.equal((await call('preview_online_match_snapshot($1,$2)',[A,id])).opponent_offline,false);
  await db.query("update public.preview_online_presence set last_seen=clock_timestamp()-interval '61 seconds' where user_id=$1",[B]);
  // Eligibility must not rely on an old signal predating this game.
  assert.equal((await call('preview_online_match_snapshot($1,$2)',[A,id])).opponent_offline,false);
  await db.query("update public.preview_online_games set created_at=clock_timestamp()-interval '2 minutes' where id=$1",[id]);
  assert.equal((await call('preview_online_match_snapshot($1,$2)',[A,id])).opponent_offline,true);
  await call('preview_online_heartbeat($1)',[B]);
  assert.equal((await call('preview_online_finish($1,$2,$3)',[A,id,'offline_win'])).status,'active');
  await db.query("update public.preview_online_presence set last_seen=clock_timestamp()-interval '61 seconds' where user_id=$1",[B]);
  game=await call('preview_online_finish($1,$2,$3)',[A,id,'offline_draw']);
  assert.equal(game.status,'finished'); assert.equal(game.result,'draw'); assert.equal(game.reason,'opponent_offline');
  id=await match(); await call('preview_online_heartbeat($1)',[B]);
  await db.query("update public.preview_online_games set created_at=clock_timestamp()-interval '2 minutes' where id=$1",[id]);
  await db.query("update public.preview_online_presence set last_seen=clock_timestamp()-interval '61 seconds' where user_id=$1",[B]);
  game=await call('preview_online_finish($1,$2,$3)',[A,id,'offline_win']); assert.equal(game.result,'white_win');
  id=await match(); await db.query("update public.preview_online_games set white_ms=1,turn_started_at=clock_timestamp()-interval '1 second' where id=$1",[id]);
  game=await call('preview_online_finish($1,$2,$3)',[B,id,'resign']); assert.equal(game.reason,'timeout'); assert.equal(game.result,'black_win');
  await db.exec('set role authenticated'); await assert.rejects(call('preview_online_finish($1,$2,$3)',[A,id,'resign']),/permission denied/);
 } finally { await db.close(); }
});
