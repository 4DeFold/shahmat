import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {blankProgress,recordResult} from '../pages/puzzle-model.js';
test('database rebases old snapshots, backs up and protects stale saves',async()=>{
 const db=new PGlite(),id='11111111-1111-1111-1111-111111111111';try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${id}')`);
 await db.exec(readFileSync('supabase/migrations/20261128120000_puzzle_progress.sql','utf8'));
 const old={version:1,rating:1500,current:{id:'next',theme:'mix',cursor:1,failed:false},history:[{id:'b',rating:1300,success:false,at:2,themes:['fork'],delta:-11},{id:'a',rating:1000,success:true,at:1,themes:['pin'],delta:3}]};
 await db.query('insert into puzzle_progress(user_id,revision,progress) values($1,3,$2)',[id,old]);await db.exec(readFileSync('supabase/migrations/20261202120000_puzzle_base_1000.sql','utf8'));
 const expected=blankProgress();for(const x of [...old.history].reverse())recordResult(expected,x,x.success,x.at);
 const row=(await db.query('select * from puzzle_progress')).rows[0];assert.equal(Number(row.revision),4);assert.equal(row.progress.rating,expected.rating);assert.deepEqual(row.progress.history,expected.history);assert.deepEqual(row.progress.current,old.current);
 const backup=(await db.query('select progress from puzzle_progress_base_1500_backup')).rows[0];assert.deepEqual(backup.progress,old);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${id}'`);const stale=(await db.query('select save_puzzle_progress(3,$1) as result',[old])).rows[0].result;assert.equal(stale.accepted,false);assert.equal(stale.revision,4);
 const saved=(await db.query('select save_puzzle_progress(4,$1) as result',[old])).rows[0].result;assert.equal(saved.progress.rating,expected.rating);assert.equal(saved.progress.ratingBase,1000);await assert.rejects(db.query('select * from puzzle_progress_base_1500_backup'));
 }finally{await db.close()}
});
