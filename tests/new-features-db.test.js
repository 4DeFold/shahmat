import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',c='00000000-0000-4000-8000-000000000003';
test('start ratings are immutable snapshots, archives remain private and bot progress is account scoped',async()=>{
 const db=await PGlite.create();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await db.query('insert into auth.users(id) values($1),($2),($3)',[a,b,c]);await db.query("insert into profiles(id,username) values($1,'Alice'),($2,'Bob'),($3,'Charlie')",[a,b,c]);await db.query("insert into yar_mode_ratings(user_id,mode,yar) values($1,'blitz',1200),($2,'blitz',900) on conflict (user_id,mode) do update set yar=excluded.yar",[a,b]);
 const id=(await db.query("insert into online_games(white_id,black_id,mode,white_ms,black_ms) values($1,$2,'blitz',180000,180000) returning id",[a,b])).rows[0].id;
 await db.query("update yar_mode_ratings set yar=1300 where user_id=$1 and mode='blitz'",[a]);await db.query("update online_games set status='finished',result='draw',reason='agreement',finished_at=clock_timestamp() where id=$1",[id]);
 await db.exec(`select set_config('request.jwt.claim.sub','${a}',false);set role authenticated`);let r=(await db.query('select * from my_archive_ratings(array[$1::uuid])',[id])).rows;assert.equal(Number(r[0].white_yar),1200);assert.equal(Number(r[0].black_yar),900);
 await db.query('insert into bot_progress(user_id,level) values($1,3)',[a]);await assert.rejects(db.query('insert into bot_progress(user_id,level) values($1,4)',[b]),/row-level security/);
 await db.exec(`reset role;select set_config('request.jwt.claim.sub','${c}',false);set role authenticated`);assert.equal((await db.query('select * from my_archive_ratings(array[$1::uuid])',[id])).rows.length,0);assert.equal((await db.query('select * from bot_progress')).rows.length,0);
 }finally{await db.close()}
});
