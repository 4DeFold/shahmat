import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { Chess } from 'chess.js';
import { PGlite } from '@electric-sql/pglite';

const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002', C='00000000-0000-4000-8000-000000000003';
const source = stripTypeScriptTypes((await readFile('supabase/functions/matchplay/index.ts','utf8')).replace(/^import .*;\n/gm, ''));

test('two signed-in players match by mode and exchange server-validated moves', async () => {
  const db = await PGlite.create();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
    for (const file of ['20261116121744_online_matchplay.sql','20261116121912_online_match_clock_after_lock.sql','20261117050126_online_match_presence_actions.sql']) await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    await db.query('insert into auth.users values ($1),($2),($3)', [A,B,C]);
    const client = {
      auth:{ getUser: async token => [A,B,C].includes(token) ? { data:{ user:{id:token} } } : { data:{user:null}, error:'invalid' } },
      rpc: async (name, args) => {
        try {
          const keys = Object.keys(args), placeholders = keys.map((_, i) => `$${i + 1}`);
          return { data:(await db.query(`select public.${name}(${placeholders.join(',')}) as result`, Object.values(args))).rows[0].result };
        } catch (error) { return { error }; }
      },
    };
    let handler;
    vm.runInNewContext(source, { Chess, createClient:() => client, Response, Deno:{ env:{get:()=>'configured'}, serve:fn => { handler = fn; } } });
    const request = async (user, body) => {
      const response = await handler(new Request('https://example.com/matchplay', { method:'POST', headers:{Authorization:`Bearer ${user}`, 'Content-Type':'application/json'}, body:JSON.stringify(body) }));
      return { status:response.status, ...await response.json() };
    };
    assert.equal((await request(A,{action:'search', mode:'blitz'})).state,'searching');
    assert.equal((await request(C,{action:'search', mode:'rapid'})).state,'searching');
    const b = await request(B,{action:'search',mode:'blitz'});
    assert.equal(b.state,'matched'); assert.equal(b.game.white_id,A); assert.equal(b.game.black_id,B);
    const a = await request(A,{action:'search',mode:'blitz'}); assert.equal(a.game.id,b.game.id);
    const gid = a.game.id;
    assert.equal((await request(C,{action:'snapshot',gameId:gid})).status,404);
    assert.equal((await request(B,{action:'move',gameId:gid,version:0,from:'e7',to:'e5'})).status,409);
    const white = await request(A,{action:'move',gameId:gid,version:0,from:'e2',to:'e4'});
    assert.deepEqual(white.game.moves,['e4']); assert.equal(white.game.turn,'b');
    const black = await request(B,{action:'move',gameId:gid,version:1,from:'e7',to:'e5'});
    assert.deepEqual(black.game.moves,['e4','e5']); assert.equal(black.game.turn,'w');
    const restored = await request(A,{action:'current'}); assert.equal(restored.game.id,gid); assert.deepEqual(restored.game.moves,['e4','e5']);
    assert.ok(restored.game.game_age_ms >= 0); assert.equal(restored.game.opponent_offline,false);
    const lost = await request(A,{action:'resign',gameId:gid}); assert.equal(lost.game.reason,'resignation'); assert.equal(lost.game.result,'black_win');
    const other = await request(B,{action:'snapshot',gameId:gid}); assert.equal(other.game.status,'finished');
  } finally { await db.close(); }
});

test('upgrade preserves existing games and old RPC compatibility without changing core table schemas', async () => {
  const db = await PGlite.create();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
    for (const file of ['20261116121744_online_matchplay.sql','20261116121912_online_match_clock_after_lock.sql']) await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    await db.query('insert into auth.users values ($1),($2)', [A,B]);
    await db.query('select public.online_find($1,$2)', [A,'daily']);
    const id = (await db.query('select public.online_find($1,$2) as result', [B,'daily'])).rows[0].result.game_id;
    const chess = new Chess(); chess.move('e4');
    await db.query('select public.online_commit($1,$2,$3,$4,$5,$6,$7,$8)', [A,id,0,'e4',chess.fen(),'b',null,null]);
    const rowBefore = (await db.query('select * from public.online_games where id=$1',[id])).rows[0];
    const colsBefore = (await db.query("select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in ('online_games','online_queue') order by table_name,ordinal_position")).rows;
    await db.exec(await readFile('supabase/migrations/20261117050126_online_match_presence_actions.sql','utf8'));
    assert.deepEqual((await db.query('select * from public.online_games where id=$1',[id])).rows[0],rowBefore);
    assert.deepEqual((await db.query("select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in ('online_games','online_queue') order by table_name,ordinal_position")).rows,colsBefore);
    const old = (await db.query('select public.online_snapshot($1,$2) as result',[B,id])).rows[0].result;
    const upgraded = (await db.query('select public.online_match_snapshot($1,$2) as result',[B,id])).rows[0].result;
    assert.deepEqual(old.moves,['e4']); assert.equal(old.id,id); assert.equal(upgraded.id,id); assert.equal(upgraded.game_age_ms >= 0,true); assert.equal(upgraded.opponent_offline,false);
    chess.move('e5');
    const continued = (await db.query('select public.online_commit($1,$2,$3,$4,$5,$6,$7,$8) as result',[B,id,1,'e5',chess.fen(),'w',null,null])).rows[0].result;
    assert.deepEqual(continued.moves,['e4','e5']);
    assert.equal((await db.query("select has_table_privilege('authenticated', 'public.online_presence', 'SELECT') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('authenticated', 'public.online_finish(uuid,uuid,text)', 'EXECUTE') as allowed")).rows[0].allowed, false);
  } finally { await db.close(); }
});
