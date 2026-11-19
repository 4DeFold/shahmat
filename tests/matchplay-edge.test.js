import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const source = (await readFile('supabase/functions/matchplay/index.ts','utf8')).replace(/^import .*;\n/gm, '');
const code = stripTypeScriptTypes(source);
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002', GAME='00000000-0000-4000-8000-000000000003';
function fixture({ user = A, moves = [], turn = 'w' } = {}) {
  const calls = []; let handler;
  const snapshot = { id:GAME, white_id:A, black_id:B, moves, turn, version:moves.length, status:'active', mode:'blitz', white_ms:180000, black_ms:180000 };
  const db = { auth: { getUser: async token => token === 'valid' ? { data:{ user:{ id:user } } } : { data:{ user:null }, error:'unauthorized' } },
    rpc: async (name,args) => {
      calls.push({ name,args });
      if (name === 'online_match_snapshot') return { data: (args.p_user === A || args.p_user === B) ? snapshot : null };
      if (name === 'online_commit') { Object.assign(snapshot, { moves:[...moves,args.p_san], turn:args.p_next_turn, result:args.p_result, reason:args.p_reason }); return { data:snapshot }; }
      if (name === 'online_find') return { data:{state:'searching'} };
      return { data:null };
    } };
  vm.runInNewContext(code, { Chess, createClient:() => db, Response, Deno:{ env:{ get:() => 'configured' }, serve:fn => { handler = fn; } }, console });
  const request = (body, token = 'valid') => handler(new Request('https://example.com/matchplay', { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body:JSON.stringify(body) }));
  return { request, calls };
}
const move = (from,to,version=0) => ({ action:'move', gameId:GAME, from,to,version });

test('edge checks identity, opponent access, legal moves and turn before writing', async () => {
  const app = fixture();
  assert.equal((await app.request({ action:'current' }, 'bad')).status, 401);
  assert.equal((await app.request(move('e2','e5'))).status, 400);
  assert.equal(app.calls.some(call => call.name === 'online_commit'), false);
  const wrong = fixture({ user:B });
  assert.equal((await wrong.request(move('e7','e5'))).status, 409);
  const outsider = fixture({ user:'00000000-0000-4000-8000-000000000004' });
  assert.equal((await outsider.request(move('e2','e4'))).status, 404);
  const response = await app.request(move('e2','e4'));
  assert.equal(response.status, 200);
  const commit = app.calls.find(call => call.name === 'online_commit');
  assert.equal(commit.args.p_san, 'e4'); assert.equal(commit.args.p_user, A); assert.equal(commit.args.p_version, 0);
});

test('edge recognizes checkmate and rejects stale versions without submitting a move', async () => {
  const app = fixture({ user:B, moves:['f3','e5','g4'], turn:'b' });
  const stale = await app.request(move('d8','h4',1));
  assert.equal(stale.status, 200); assert.equal(app.calls.some(call => call.name === 'online_commit'), false);
  const response = await app.request(move('d8','h4',3));
  const data = await response.json();
  assert.equal(data.game.result, 'black_win'); assert.equal(data.game.reason, 'checkmate');
  assert.equal(app.calls.find(call => call.name === 'online_commit').args.p_san, 'Qh4#');
});

test('retired daily matchmaking is rejected before database search', async () => {const app=fixture();assert.equal((await app.request({action:'search',mode:'daily'})).status,400);assert.equal(app.calls.some(c=>c.name==='online_find'),false);});
