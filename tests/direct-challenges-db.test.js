import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('private challenges require consent, relationship and two available players',async()=>{
 const db=new PGlite(), A='11111111-1111-1111-1111-111111111111',B='22222222-2222-2222-2222-222222222222',C='33333333-3333-3333-3333-333333333333';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table profiles(id uuid primary key,username text);insert into profiles values('${A}','Alice'),('${B}','Bob'),('${C}','Carol');
  create table social_friendships(requester uuid,recipient uuid,accepted boolean);insert into social_friendships values('${A}','${B}',true);
  create table social_clan_members(clan_id uuid,user_id uuid);
  create table online_games(id uuid primary key default gen_random_uuid(),white_id uuid,black_id uuid,status text default 'active',turn text default 'w',turn_started_at timestamptz default now(),mode text,game_kind text,time_control text,white_ms bigint,black_ms bigint);
  create table online_queue(user_id uuid primary key);create table online_presence(user_id uuid primary key,last_seen timestamptz);
  create table bot_games(id uuid primary key,user_id uuid,status text);create table social_bot_activity(user_id uuid,game_id uuid,last_seen timestamptz);
  create function online_snapshot(uuid,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
  create function online_control_ms(text,text) returns bigint language sql as $$select case when $1='blitz' and $2 in ('3','3+2') then 180000 else null end$$;`);
  await db.exec(readFileSync('supabase/migrations/20261206120000_direct_challenges.sql','utf8'));
  const as=id=>db.exec(`set role authenticated;set request.jwt.claim.sub='${id}'`);
  const act=async (action,id=null,name=null,mode=null,control=null)=>(await db.query('select direct_challenge_action($1,$2,$3,$4,$5) d',[action,id,name,mode,control])).rows[0].d;
  const snapshot=async()=>(await db.query('select direct_challenge_snapshot() d')).rows[0].d;
  await as(A);await assert.rejects(act('send',null,'Carol'),/not_related/);await assert.rejects(db.query('select * from direct_challenges'));
  const id=(await act('send',null,'Bob')).id;assert.equal((await snapshot()).state,'pending');await assert.rejects(act('accept',id),/invalid_transition/);
  await as(C);assert.equal(await snapshot(),null);await assert.rejects(act('accept',id),/challenge_not_found/);
  await as(B);assert.equal((await snapshot()).name,'Alice');await assert.rejects(act('confirm',id),/invalid_transition/);await act('accept',id);
  await as(A);await assert.rejects(act('propose',id,null,'blitz','999'),/invalid_control/);await act('propose',id,null,'blitz','3+2');await assert.rejects(act('confirm',id),/invalid_transition/);
  await db.exec(`reset role;insert into online_queue values('${A}'),('${B}')`);await as(B);await act('confirm',id);const started=await snapshot();assert.equal(started.state,'started');assert.ok(started.game_id);
  await assert.rejects(act('confirm',id),/challenge_expired/);await act('seen',id);assert.equal(await snapshot(),null);await as(A);assert.equal((await snapshot()).game_id,started.game_id);await act('seen',id);
  await db.exec('reset role');const rows=(await db.query('select * from online_games')).rows;assert.equal(rows.length,1);assert.equal(rows[0].game_kind,'friendly');assert.equal((await db.query('select * from online_queue')).rows.length,0);
  await as(A);await assert.rejects(act('send',null,'Bob'),/player_busy/);
  await db.exec(`reset role;update online_games set status='finished';insert into bot_games values(gen_random_uuid(),'${B}','active');insert into social_bot_activity select '${B}',id,now() from bot_games`);
  await as(A);await assert.rejects(act('send',null,'Bob'),/player_busy/);
  await db.exec("reset role;delete from social_bot_activity");await as(A);const id2=(await act('send',null,'Bob')).id;
  await db.exec(`reset role;insert into online_games(white_id,black_id,mode,game_kind,time_control,white_ms,black_ms) values('${B}','${C}','blitz','rated','3',180000,180000)`);
  await as(B);assert.equal(await snapshot(),null);await assert.rejects(act('accept',id2),/player_busy/);
 }finally{await db.close()}
});
