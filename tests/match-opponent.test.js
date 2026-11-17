import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const code = stripTypeScriptTypes((await readFile('supabase/functions/match-opponent/index.ts','utf8')).replace(/^import .*;\n/gm, ''));
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002', GAME='00000000-0000-4000-8000-000000000003', OUT='00000000-0000-4000-8000-000000000004';
function setup(user = A) {
  let handler, lookedUp = null;
  const db = { auth:{ getUser:async token => token === 'ok' ? { data:{user:{id:user}} } : { data:{user:null},error:true } },
    rpc:async (name, args) => ({ data: args.p_user === A || args.p_user === B ? { white_id:A, black_id:B } : null }),
    from:table => ({ select:fields => ({ eq:(key, id) => ({ maybeSingle:async () => { lookedUp = {table,fields,key,id}; return {data:{username:'Friend',bio:'Hello'}}; } }) }) }) };
  vm.runInNewContext(code, { createClient:() => db, Response, Deno:{env:{get:()=> 'configured'},serve:fn=>{handler=fn;}} });
  return { request:(gameId = GAME, token='ok') => handler(new Request('https://example.com', { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:JSON.stringify({gameId}) })), lookup:()=>lookedUp };
}
test('nickname endpoint exposes only opponent username to a participant', async () => {
  const app = setup(); const res = await app.request(); assert.equal(res.status, 200); assert.deepEqual(await res.json(), { username:'Friend' });
  assert.deepEqual(app.lookup(), { table:'profiles', fields:'username', key:'id', id:B });
  const black = setup(B); await black.request(); assert.equal(black.lookup().id, A);
  const outsider = setup(OUT); assert.equal((await outsider.request()).status, 404); assert.equal(outsider.lookup(), null);
  const bad = setup(); assert.equal((await bad.request(GAME, 'bad')).status, 401); assert.equal((await bad.request('not-id')).status, 400); assert.equal(bad.lookup(), null);
});
