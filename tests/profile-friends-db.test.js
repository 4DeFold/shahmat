import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('friend state resolves exact names and only exposes the caller relationship',async()=>{
 const db=new PGlite(),A='11111111-1111-1111-1111-111111111111',B='22222222-2222-2222-2222-222222222222';try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table profiles(id uuid primary key,username text);insert into profiles values('${A}','Alice'),('${B}','Bob');create function rating_overall(uuid,boolean) returns numeric language sql as $$select 1200::numeric$$`);
 for(const f of ['20261130120000_social.sql','20261203120000_social_limits.sql','20261205120000_profile_friend_state.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const as=id=>db.exec(`set role authenticated;set request.jwt.claim.sub='${id}'`),state=async name=>(await db.query('select social_friend_state($1) s',[name])).rows[0].s;
 await as(A);assert.equal(await state('alice'),'self');assert.equal(await state('bob'),'none');await assert.rejects(state('Nobody'),/player_not_found/);await db.query("select social_action('friend_request','Bob')");assert.equal(await state('Bob'),'outgoing');await as(B);assert.equal(await state('Alice'),'incoming');await db.query("select social_action('friend_accept','Alice')");assert.equal(await state('Alice'),'friend');await db.exec('reset role;set role anon');await assert.rejects(state('Alice'));
 }finally{await db.close()}
});
