import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
test('spectator functions expose only non-expired live games and cannot mutate them',async()=>{
 const db=await PGlite.create();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await db.query('insert into auth.users(id) values($1),($2)',[a,b]); await db.query("insert into profiles(id,username) values($1,'Alice'),($2,'Bob')",[a,b]);
 const id=(await db.query("insert into online_games(white_id,black_id,mode,white_ms,black_ms) values($1,$2,'blitz',180000,180000) returning id",[a,b])).rows[0].id;
 await db.exec(`select set_config('request.jwt.claim.sub','${a}',false);set role authenticated`);
 const rows=(await db.query('select * from spectator_games(0)')).rows;assert.equal(rows.length,1);assert.equal(rows[0].white_name,'Alice');
 const game=(await db.query('select spectator_game($1) g',[id])).rows[0].g;assert.equal(game.white_name,'Alice');assert.equal(game.white_id,undefined);assert.deepEqual(game.moves,[]);
 await assert.rejects(db.query('update online_games set version=4'),/permission denied/);
 await db.exec('reset role');await db.query("update online_games set turn_started_at=clock_timestamp()-interval '4 minutes' where id=$1",[id]);
 await db.exec('set role authenticated'); assert.equal((await db.query('select * from spectator_games(0)')).rows.length,0);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from spectator_games(0)'),/permission denied/);
 }finally{await db.close()}
});
