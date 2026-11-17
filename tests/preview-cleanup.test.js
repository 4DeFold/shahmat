import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('cleanup refuses to delete preview games and leaves production data intact', async () => {
  const db=await PGlite.create();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key)');
    for (const file of ['20261116121744_online_matchplay.sql','20261116121912_online_match_clock_after_lock.sql','20261117031548_isolated_preview_matchplay_actions.sql','20261117042549_preview_game_age.sql','20261117050126_online_match_presence_actions.sql']) await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
    const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
    await db.query('insert into auth.users values ($1),($2)',[A,B]);
    for (const prefix of ['online','preview_online']) { await db.query(`select public.${prefix}_find($1,$2)`,[A,'daily']); await db.query(`select public.${prefix}_find($1,$2)`,[B,'daily']); }
    const before=(await db.query('select * from public.online_games')).rows;
    const cleanup=await readFile('supabase/migrations/20261117050253_remove_preview_matchplay.sql','utf8');
    await assert.rejects(db.exec(`begin; ${cleanup} commit;`),/cleanup aborted/); await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from public.preview_online_games')).rows[0].n,1);
    await db.exec('delete from public.preview_online_games');
    await db.exec(`begin; ${cleanup} commit;`);
    assert.deepEqual((await db.query('select * from public.online_games')).rows,before);
    assert.equal((await db.query("select to_regclass('public.preview_online_games') as t")).rows[0].t,null);
  } finally { await db.close(); }
});
