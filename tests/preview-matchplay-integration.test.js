import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { Chess } from 'chess.js';
import { PGlite } from '@electric-sql/pglite';

const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002', C='00000000-0000-4000-8000-000000000003';
const source = stripTypeScriptTypes((await readFile('supabase/functions/matchplay-preview/index.ts','utf8')).replace(/^import .*;\n/gm, ''));

test('two preview players match, exchange moves, and resignation is authoritative', async () => {
  const db = await PGlite.create();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
    for (const file of ['20261117031548_isolated_preview_matchplay_actions.sql']) await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
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
    const lost = await request(A,{action:'resign',gameId:gid}); assert.equal(lost.game.reason,'resignation'); assert.equal(lost.game.result,'black_win');
    const other = await request(B,{action:'snapshot',gameId:gid}); assert.equal(other.game.status,'finished'); assert.equal(other.game.result,'black_win');
  } finally { await db.close(); }
});
