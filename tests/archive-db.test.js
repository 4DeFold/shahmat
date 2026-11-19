import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
test('archive returns only the signed-in player’s finished games for the selected mode',async()=>{const db=await PGlite.create();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 for(const [i,id] of ids.entries()){await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into profiles(id,username) values($1,$2)',[id,['Alice','Bob','Carol'][i]]);}
 await db.query("insert into online_games(white_id,black_id,mode,status,result,moves,white_ms,black_ms,finished_at) values($1,$2,'blitz','finished','white_win','[\"e4\",\"e5\"]',1000,1000,now()),($2,$3,'blitz','finished','draw','[]',1000,1000,now()),($1,$3,'rapid','finished','draw','[]',1000,1000,now())",ids);
 await db.query("insert into online_games(white_id,black_id,mode,white_ms,black_ms) values($1,$2,'blitz',1000,1000)",ids.slice(0,2));
 await db.exec(`select set_config('request.jwt.claim.sub','${ids[0]}',false);set role authenticated`);
 const rows=(await db.query("select * from my_archive_games('blitz',0)")).rows;assert.equal(rows.length,1);assert.equal(rows[0].white_name,'Alice');assert.equal(rows[0].black_name,'Bob');assert.deepEqual(rows[0].moves,['e4','e5']);assert.equal(rows[0].my_color,'w');assert.equal(rows[0].white_id,undefined);assert.equal((await db.query("select * from my_archive_games('rapid',0)")).rows.length,1);assert.equal((await db.query("select * from my_archive_games('blitz',1)")).rows.length,0);
 await assert.rejects(db.query('update online_games set version=10'),/permission denied/);await db.exec('reset role;set role anon');await assert.rejects(db.query("select * from my_archive_games('blitz',0)"),/permission denied/);
 }finally{await db.close()}});
