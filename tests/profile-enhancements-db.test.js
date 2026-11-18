import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002';
const jpeg=(w,h)=>'data:image/jpeg;base64,'+Buffer.from('ffd8ffc0000b08'+h.toString(16).padStart(4,'0')+w.toString(16).padStart(4,'0')+'01011100ffd9','hex').toString('base64');
test('overall milestones are historical, permanent and enforced on direct writes',async()=>{
 const db=await PGlite.create();try{
 await db.exec("create role anon; create role authenticated; create schema auth; grant usage on schema auth to authenticated; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 await db.exec(await readFile('supabase/migrations/20261113140000_create_profiles.sql','utf8'));
 await db.exec('create table public.online_games(id uuid,white_id uuid,black_id uuid,status text,mode text); create table public.bot_games(user_id uuid,status text); create table public.yar_mode_ratings(user_id uuid,mode text,yar numeric); create table public.yar_history(user_id uuid,game_id uuid,finished_at timestamptz,before_yar numeric,after_yar numeric);');
 await db.exec(await readFile('supabase/migrations/20261118072419_profile_media.sql','utf8'));
 await db.query('insert into auth.users(id) values($1),($2)',[A,B]); await db.query("insert into profiles(id,username) values($1,'Alice'),($2,'Bobby')",[A,B]);
 await db.query("insert into yar_mode_ratings values ($1,'blitz',1000)",[A]);
 await db.query("insert into yar_history values ($1,'00000000-0000-4000-8000-000000000010',now()-interval '1 day',1000,1800),($1,'00000000-0000-4000-8000-000000000011',now(),1800,1000)",[A]);
 // Existing customization is retained but hidden until the milestone is earned.
 await db.query("insert into profile_media(user_id,avatar) values($1,$2)",[B,'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAAAAAA']);
 await db.query('update auth.users set raw_user_meta_data=$1::jsonb where id=$2',[JSON.stringify({palette:'forest',palette_effective_theme:'dark'}),A]);
 await db.exec(await readFile('supabase/migrations/20261118084530_profile_enhancements.sql','utf8'));
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${A}',false)`);
 const rewards=(await db.query('select * from profile_rewards')).rows[0]; assert.equal(rewards.avatar_unlocked,true); assert.equal(rewards.banner_unlocked,true);
 await db.query("select public.profile_save('Alice','bio',$1,$2)",[jpeg(384,384),jpeg(1440,480)]);
 await assert.rejects(db.query("select public.profile_save('Alice','bio',$1,null)",[jpeg(385,384)]),/check constraint/);
 await db.exec(`select set_config('request.jwt.claim.sub','${B}',false)`);
 await assert.rejects(db.query("select public.profile_save('Bobby','bio',$1,null)",[jpeg(384,384)]),/avatar_locked/);
 await assert.rejects(db.query("update profile_media set avatar=$1 where user_id=$2",[jpeg(384,384),B]),/avatar_locked/);
 assert.equal((await db.query("select profile_public('Bobby') as p")).rows[0].p.avatar,null);
 const oldMedia=(await db.query('select avatar from profile_media')).rows[0].avatar; await db.query("select public.profile_save('Bobby','new bio',$1,null)",[oldMedia]);
 const publicProfile=(await db.query("select profile_public('Alice') as p")).rows[0].p; assert.equal(publicProfile.avatar,jpeg(384,384)); assert.equal(publicProfile.palette,'forest'); assert.equal(publicProfile.theme,'dark');
 await db.exec('reset role'); await db.query("insert into yar_mode_ratings values ($1,'blitz',1400)",[B]); await db.query("update yar_mode_ratings set yar=800 where user_id=$1",[B]);
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${B}',false)`);
 assert.equal((await db.query('select * from profile_rewards')).rows[0].avatar_unlocked,true);
 await db.query("select public.profile_save('Bobby','bio',$1,null)",[jpeg(384,384)]);
 await db.query('select public.profile_ack_rewards(true,false)'); assert.equal((await db.query('select * from profile_rewards')).rows[0].avatar_seen,true);
 await db.exec('reset role; set role anon'); await assert.rejects(db.query("select profile_public('Alice')"),/permission denied/);
 }finally{await db.close();}
});
