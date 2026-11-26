import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('social RPC enforces friendship, clan permissions, membership and ratings',async()=>{
 const db=new PGlite();const A='11111111-1111-1111-1111-111111111111',B='22222222-2222-2222-2222-222222222222',C='33333333-3333-3333-3333-333333333333';
 try{
 await db.exec(`create role anon; create role authenticated; create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create table profiles(id uuid primary key,username text); insert into profiles values ('${A}','Alice'),('${B}','Bob'),('${C}','Carol'); create function rating_overall(u uuid,elo boolean) returns numeric language sql as $$select case u when '${A}'::uuid then 1200 when '${B}'::uuid then 1600 else null end$$;`);
 await db.exec(readFileSync('supabase/migrations/20261130120000_social.sql','utf8'));await db.exec(readFileSync('supabase/migrations/20261201120000_social_fast_queries.sql','utf8'));await db.exec(readFileSync('supabase/migrations/20261203120000_social_limits.sql','utf8'));
 const as=async id=>db.exec(`set role authenticated; set request.jwt.claim.sub='${id}'`),act=async(action,name=null,clan=null,description=null,open=null)=>db.query('select social_action($1,$2,$3,$4,$5)',[action,name,clan,description,open]),snap=async search=>(await db.query('select social_snapshot($1) s',[search||''])).rows[0].s,detail=async id=>(await db.query('select social_clan_detail($1) s',[id])).rows[0].s;
 await as(A); await assert.rejects(db.query('select * from social_friendships'));await act('friend_request','Bob');assert.equal((await snap()).friends[0].state,'outgoing');await assert.rejects(act('friend_accept','Bob'));
 await as(B);assert.equal((await snap()).friends[0].state,'incoming');await act('friend_accept','Alice');assert.equal((await snap()).friends[0].state,'friend');await assert.rejects(act('friend_request','Alice'));
 await as(A);await act('clan_create','Knights',null,'Привет',false);let data=await snap();const clan=data.my_clan;assert.ok(clan);assert.equal(data.clans[0].rating,1200);await assert.rejects(act('clan_create','Again',null,'',true));
 await as(B);await act('clan_join',null,clan);assert.equal((await detail(clan)).requested,true);assert.deepEqual((await detail(clan)).requests,[]);await assert.rejects(act('clan_accept','Bob',clan));
 await as(C);await assert.rejects(act('clan_create','No rating',null,'',true),/creation_rating_low/);await act('clan_join',null,clan);await as(A);assert.equal((await detail(clan)).requests.length,2);await act('clan_accept','Bob',clan);await act('clan_accept','Carol',clan);assert.equal((await snap()).clans[0].rating,1400);assert.equal((await snap()).clans[0].rated,2);const fast=(await db.query("select social_clans_snapshot('nig') s")).rows[0].s;assert.equal(fast.clans[0].rating,1400);assert.equal(fast.clans[0].rated,2);assert.equal((await db.query("select social_friends_snapshot('bo') s")).rows[0].s.players[0].state,'friend');await assert.rejects(act('clan_leave',null,clan));await act('clan_transfer','Bob',clan);
 await as(B);await act('clan_kick','Alice',clan);await act('clan_edit','Knights',clan,'Edited',true);await act('clan_delete',null,clan);assert.equal((await snap()).my_clan,null);
 await as(A);await act('friend_remove','Bob');assert.deepEqual((await snap()).friends,[]);await db.exec('reset role; set role anon');await assert.rejects(db.query('select social_snapshot()'));await assert.rejects(db.query('select social_friends_snapshot()'));await assert.rejects(db.query('select social_clans_snapshot()'));
 }finally{await db.close()}
});

test('limits and minimum overall rating are enforced on both social APIs',async()=>{
 const db=new PGlite(),A='11111111-1111-1111-1111-111111111111',B='22222222-2222-2222-2222-222222222222',C='33333333-3333-3333-3333-333333333333';try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table profiles(id uuid primary key,username text);create table scores(id uuid primary key,score numeric);create function rating_overall(u uuid,elo boolean) returns numeric language sql as $$select score from scores where id=u$$;insert into profiles values('${A}','Alice'),('${B}','Bob'),('${C}','Carol');insert into scores values('${A}',1200),('${B}',1100),('${C}',1000);`);
 for(const f of ['20261130120000_social.sql','20261203120000_social_limits.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const as=id=>db.exec(`set role authenticated;set request.jwt.claim.sub='${id}'`),act=(name,args)=>db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
 await as(C);await assert.rejects(act('social_action',['clan_create','Weak',null,'',true]),/creation_rating_low/);
 await as(A);await act('social_action_v2',['clan_create','High',null,'',false,1050]);const clan=(await db.query('select social_snapshot() data')).rows[0].data.my_clan;
 await as(C);await assert.rejects(act('social_action',['clan_join',null,clan]),/join_rating_low/);
 await as(B);await act('social_action',['clan_join',null,clan]);
 await db.exec(`reset role;update scores set score=1000 where id='${B}'`);await as(A);await assert.rejects(act('social_action',['clan_accept','Bob',clan]),/join_rating_low/);
 // Fill the clan to capacity, keeping existing members intact.
 await db.exec(`reset role;insert into profiles select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'member'||i from generate_series(1,49) i;insert into social_clan_members(clan_id,user_id) select '${clan}',id from profiles where username like 'member%';update scores set score=1100 where id='${B}'`);await as(A);await assert.rejects(act('social_action',['clan_accept','Bob',clan]),/clan_full/);
 // A full recipient cannot accept or receive more friendships.
 await db.exec(`reset role;insert into profiles select ('00000000-0000-0000-0001-'||lpad(i::text,12,'0'))::uuid,'friend'||i from generate_series(1,100) i;insert into social_friendships(requester,recipient,accepted) select '${A}',id,true from profiles where username like 'friend%';`);await as(B);await assert.rejects(act('social_action',['friend_request','Alice']),/friend_limit/);
 }finally{await db.close()}
});
