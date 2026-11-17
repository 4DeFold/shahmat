import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { updateRating } from '../rating/rank.js';

const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002', C='00000000-0000-4000-8000-000000000003';
test('completed online games update separate mode scores exactly once; average, permissions and daily caps', async () => {
  const db=await PGlite.create();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create table public.profiles(id uuid primary key references auth.users(id), username text not null);");
    for (const name of ['20261116121744_online_matchplay.sql','20261116121912_online_match_clock_after_lock.sql','20261117085337_yar_ratings.sql','20261117085657_yar_order_precision.sql']) await db.exec(await readFile(`supabase/migrations/${name}`,'utf8'));
    await db.query('insert into auth.users values ($1),($2),($3)',[A,B,C]);
    await db.query("insert into public.profiles values ($1,'Alice'),($2,'Bob'),($3,'Carol')",[A,B,C]);
    const finish=async (white,black,mode,result,when='2026-01-01T12:00:00Z') => {
      const id=(await db.query('insert into public.online_games(white_id,black_id,mode,white_ms,black_ms) values($1,$2,$3,180000,180000) returning id',[white,black,mode])).rows[0].id;
      await db.query("update public.online_games set status='finished', result=$2, finished_at=$3 where id=$1",[id,result,when]); return id;
    };
    const game=await finish(A,B,'blitz','white_win');
    const ratings=(await db.query('select * from public.yar_mode_ratings order by user_id')).rows;
    assert.equal(Number(ratings[0].yar), Number(updateRating(1000,1000,0,1,'blitz').toFixed(4)));
    assert.equal(Number(ratings[1].yar), Number(updateRating(1000,1000,0,0,'blitz').toFixed(4)));
    await db.query("update public.online_games set reason='checkmate' where id=$1",[game]);
    assert.equal((await db.query('select count(*)::int as n from public.yar_history')).rows[0].n,2);
    await db.exec(`select set_config('request.jwt.claim.sub','${A}',false); set role authenticated;`);
    const top=(await db.query("select * from public.yar_leaderboard('overall')")).rows;
    assert.equal(top.length,3); assert.equal(top[0].username,'Alice'); assert.equal(Number(top[0].yar),1005.1); assert.equal(top[0].ranked,false);
    const rapid=(await db.query("select * from public.yar_leaderboard('rapid')")).rows;
    assert.equal(Number(rapid[0].yar),1000);
    await assert.rejects(db.query('select * from public.yar_mode_ratings'),/permission denied/);
    await assert.rejects(db.query("select * from public.yar_leaderboard('invalid')"),/invalid mode/);
    await db.exec('reset role');
    await finish(A,B,'blitz','draw'); await finish(B,A,'rapid','black_win'); await finish(A,B,'daily','white_win');
    assert.equal((await db.query('select count(*)::int as n from public.yar_history')).rows[0].n,6);
    await finish(A,B,'rapid','draw','2026-01-02T12:00:00Z');
    assert.equal((await db.query('select count(*)::int as n from public.yar_history')).rows[0].n,8);
  } finally { await db.close(); }
});

test('calibration, top-100 cap and daily limit are enforced', async () => {
  const db=await PGlite.create();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create table public.profiles(id uuid primary key references auth.users(id), username text not null);");
    for (const name of ['20261116121744_online_matchplay.sql','20261116121912_online_match_clock_after_lock.sql','20261117085337_yar_ratings.sql','20261117085657_yar_order_precision.sql']) await db.exec(await readFile(`supabase/migrations/${name}`,'utf8'));
    await db.exec(`insert into auth.users select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid from generate_series(1,105) i;
      insert into public.profiles select id, 'user' || right(id::text, 12) from auth.users;`);
    for(let i=2;i<=27;i++) {
      const id=`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
      const result=await db.query("insert into public.online_games(white_id,black_id,mode,white_ms,black_ms) values($1,$2,'rapid',1000,1000) returning id",[A,id]);
      await db.query("update public.online_games set status='finished',result='draw',finished_at='2026-01-01T12:00:00Z' where id=$1",[result.rows[0].id]);
    }
    assert.equal((await db.query('select games from public.yar_mode_ratings where user_id=$1',[A])).rows[0].games,25);
    assert.equal((await db.query('select count(*)::int as n from public.yar_history where user_id=$1',[A])).rows[0].n,25);
    await db.exec(`select set_config('request.jwt.claim.sub','${A}',false); set role authenticated;`);
    const list=(await db.query("select * from public.yar_leaderboard('rapid')")).rows;
    assert.equal(list.length,100); assert.equal(list[0].ranked,true); assert.equal(list[0].username,'user000000000001');
    assert.equal(list[1].ranked,false);
  } finally { await db.close(); }
});

test('leaderboard orders by full precision when displayed scores round equally', async () => {
  const db=await PGlite.create();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create table public.profiles(id uuid primary key references auth.users(id), username text not null);");
    for (const name of ['20261116121744_online_matchplay.sql','20261116121912_online_match_clock_after_lock.sql','20261117085337_yar_ratings.sql','20261117085657_yar_order_precision.sql']) await db.exec(await readFile(`supabase/migrations/${name}`,'utf8'));
    await db.query('insert into auth.users values ($1),($2)',[A,B]);
    await db.query("insert into public.profiles values ($1,'Zed'),($2,'Alpha')",[A,B]);
    await db.query("insert into public.yar_mode_ratings(user_id,mode,yar,games) values ($1,'blitz',1000.04,10),($2,'blitz',1000.03,10)",[A,B]);
    await db.exec(`select set_config('request.jwt.claim.sub','${A}',false); set role authenticated;`);
    const list=(await db.query("select * from public.yar_leaderboard('blitz')")).rows;
    assert.deepEqual(list.map(row=>row.username),['Zed','Alpha']);
    assert.equal(Number(list[0].yar),Number(list[1].yar));
  } finally { await db.close(); }
});
