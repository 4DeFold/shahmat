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
test('combined archives are private and live listings sort before pagination',async()=>{
 const db=await PGlite.create();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await db.query('insert into auth.users(id) values($1),($2),($3)',[a,b,c]);await db.query("insert into profiles(id,username) values($1,'Alice'),($2,'Bob'),($3,'Charlie')",[a,b,c]);
 await db.query("insert into yar_mode_ratings(user_id,mode,yar) values($1,'blitz',1500),($2,'rapid',1200),($3,'blitz',1800) on conflict(user_id,mode) do update set yar=excluded.yar",[a,b,c]);
 await db.query("insert into online_games(white_id,black_id,mode,white_ms,black_ms) values($1,$2,'blitz',180000,180000),($1,$2,'rapid',600000,600000),($1,$3,'blitz',180000,180000)",[a,b,c]);
 await db.query("insert into online_games(white_id,black_id,mode,white_ms,black_ms,status,result,finished_at) values($1,$2,'blitz',0,0,'finished','draw',clock_timestamp())",[a,b]);
 await db.query("insert into bot_games(id,user_id,level,moves,status,started_at,player_color) values(gen_random_uuid(),$1,1,array['e4','e5'],'draw',clock_timestamp(),'b')",[a]);
 await db.exec(`select set_config('request.jwt.claim.sub','${a}',false);set role authenticated`);
 await db.exec('reset role');await db.query("update auth.users set raw_user_meta_data=$1::jsonb where id=$2",[JSON.stringify({piece_set:'chessnut',private_secret:'hidden'}),b]);await db.exec('set role authenticated');const profile=(await db.query("select profile_public('Bob') as data")).rows[0].data;assert.equal(profile.piece_set,'chessnut');assert.equal(profile.private_secret,undefined);const pieceSets=(await db.query("select * from profile_piece_sets(array['Bob','Alice']) order by username")).rows;assert.deepEqual(pieceSets.map(x=>x.piece_set),['cburnett','chessnut']);await assert.rejects(db.query("select * from profile_piece_sets(array_fill('x'::text,array[101]))"),/too many names/);
 for(const name of ['fantasy','spatial','celtic','merida','firi','rhosgfx','kiwen-suwi','mono']) {await db.exec('reset role');await db.query("update auth.users set raw_user_meta_data=$1::jsonb where id=$2",[JSON.stringify({piece_set:name}),b]);await db.exec('set role authenticated');assert.equal((await db.query("select profile_public('Bob') as data")).rows[0].data.piece_set,name);assert.equal((await db.query("select * from profile_piece_sets(array['Bob'])")).rows[0].piece_set,name);}

 const modes=(await db.query('select * from spectator_modes() order by mode')).rows;assert.deepEqual(modes.map(x=>x.mode),['blitz','rapid']);
 const games=(await db.query("select * from spectator_games_sorted('all',0)")).rows;assert.equal(games.length,3);assert.equal(Number(games[0].black_yar),1800);assert.equal(games[0].black_name,'Charlie');assert.equal((await db.query("select * from spectator_games_sorted('rapid',0)")).rows.length,1);
 const archive=(await db.query('select * from my_archive_all(0)')).rows;assert.equal(archive.length,2);assert.equal(archive.find(row=>row.mode==='bot').my_color,'b');assert.deepEqual(new Set(archive.map(x=>x.mode)),new Set(['blitz','bot']));
 await db.exec(`reset role;select set_config('request.jwt.claim.sub','${c}',false);set role authenticated`);assert.equal((await db.query('select * from my_archive_all(0)')).rows.length,0);await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from spectator_modes()'),/permission denied/);
 }finally{await db.close()}
});
