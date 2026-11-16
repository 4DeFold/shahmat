import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = (await Promise.all(['20261116121744_online_matchplay.sql', '20261116121912_online_match_clock_after_lock.sql'].map(file => readFile(`supabase/migrations/${file}`, 'utf8')))).join('\n');
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002', C = '00000000-0000-4000-8000-000000000003';
const db = await PGlite.create();
await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
await db.exec(sql);
await db.query('insert into auth.users values ($1),($2),($3)', [A,B,C]);
const call = async (query, params) => (await db.query(`select ${query} as result`, params)).rows[0].result;

test('matchmaking only pairs same control and prevents duplicate simultaneous games', async () => {
  assert.deepEqual(await call('public.online_find($1,$2)', [A,'blitz']), { state: 'searching' });
  assert.deepEqual(await call('public.online_find($1,$2)', [B,'rapid']), { state: 'searching' });
  const match = await call('public.online_find($1,$2)', [C,'blitz']);
  assert.equal(match.state, 'matched');
  const game = await call('public.online_snapshot($1,$2)', [A,match.game_id]);
  assert.equal(game.mode, 'blitz'); assert.equal(game.white_id, A); assert.equal(game.black_id, C);
  assert.equal(game.turn, 'w'); assert.ok(game.white_ms <= 180000 && game.white_ms > 0); assert.equal(game.black_ms, 180000);
  assert.equal(await call('public.online_snapshot($1,$2)', [B,match.game_id]), null);
  assert.equal((await call('public.online_find($1,$2)', [A,'rapid'])).game_id, match.game_id);
  assert.equal((await call('public.online_cancel($1)', [C])).game_id, match.game_id);
});

test('moves are serialized, turn checked, clocks authoritative and stale versions cannot overwrite', async () => {
  const game = await call('public.online_current($1)', [A]);
  const args = [A, game.id, 0, 'e4', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'b', null, null];
  await assert.rejects(call('public.online_commit($1,$2,$3,$4,$5,$6,$7,$8)', [C, ...args.slice(1)]), /not your turn/);
  const move = await call('public.online_commit($1,$2,$3,$4,$5,$6,$7,$8)', args);
  assert.deepEqual(move.moves, ['e4']); assert.equal(move.turn, 'b'); assert.equal(move.version, 1);
  assert.ok(move.white_ms <= game.white_ms);
  const stale = await call('public.online_commit($1,$2,$3,$4,$5,$6,$7,$8)', args);
  assert.deepEqual(stale.moves, ['e4']); assert.equal(stale.version, 1);
  await db.query("update public.online_games set black_ms = 1, turn_started_at = clock_timestamp() - interval '1 second' where id = $1", [game.id]);
  const timedOut = await call('public.online_snapshot($1,$2)', [A,game.id]);
  assert.equal(timedOut.status, 'finished'); assert.equal(timedOut.result, 'white_win'); assert.equal(timedOut.reason, 'timeout');
  const after = await call('public.online_commit($1,$2,$3,$4,$5,$6,$7,$8)', [C, game.id, 1, 'e5', 'other-fen', 'w', null, null]);
  assert.deepEqual(after.moves, ['e4']); assert.equal(after.version, 2);
});

test('cancel and stale queues do not create phantom matches; each time control has correct clocks', async () => {
  await call('public.online_cancel($1)', [B]);
  assert.deepEqual(await call('public.online_find($1,$2)', [A,'daily']), { state: 'searching' });
  await db.query("update public.online_queue set heartbeat_at = clock_timestamp() - interval '31 seconds' where user_id = $1", [A]);
  assert.deepEqual(await call('public.online_find($1,$2)', [C,'daily']), { state: 'searching' });
  const match = await call('public.online_find($1,$2)', [B,'daily']);
  const game = await call('public.online_snapshot($1,$2)', [B,match.game_id]);
  assert.equal(game.black_ms, 86400000); assert.equal(game.mode, 'daily');
  await call('public.online_cancel($1)', [A]);
  await assert.rejects(call('public.online_find($1,$2)', [A,'bullet']), /invalid request/);
});

test('anonymous and authenticated database roles cannot access games or service RPCs', async () => {
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from public.online_games'), /permission denied/);
  await assert.rejects(call('public.online_find($1,$2)', [A,'blitz']), /permission denied/);
  await db.exec('reset role');
  await db.close();
});
