import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {Chess} from 'chess.js';
import {THEMES,parsePuzzles,blankProgress,loadProgress,recordResult,puzzleStats,choosePuzzle,createPuzzleAttempt,extractGamePrefix} from '../pages/puzzle-model.js';
const data=JSON.parse(readFileSync('public/puzzles/tactics.json')),puzzles=parsePuzzles(data);
test('1000 distinct licensed puzzles, eight well-stocked themes and legal full lines',()=>{
 assert.equal(data.license.includes('CC0'),true);assert.equal(puzzles.length,1000);assert.equal(new Set(puzzles.map(x=>x.id)).size,1000);assert.equal(THEMES.length,8);
 for(const [theme] of THEMES)assert.ok(puzzles.filter(p=>p.themes.includes(theme)).length>=125,theme);
 for(const p of puzzles){const chess=new Chess(p.fen);for(const uci of p.moves)assert.ok(chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]}),p.id);}
});
test('correct solver moves alternate with opponent replies and illegal moves do not damage position',()=>{
 const p=puzzles.find(x=>x.moves.length>=4),a=createPuzzleAttempt(p),initial=a.chess.fen();assert.equal(a.play('a1a8').status,'illegal');assert.equal(a.chess.fen(),initial);
 while(!a.finished){const result=a.play(a.expected);assert.ok(['solved','correct'].includes(result.status));if(result.status==='correct')assert.ok(a.reply());}assert.equal(a.failed,false);
});
test('wrong legal move rolls back and remains a failed attempt',()=>{
 const p=puzzles.find(x=>{const a=createPuzzleAttempt(x);return a.chess.moves({verbose:true}).length>1}),a=createPuzzleAttempt(p);const legal=a.chess.moves({verbose:true}).find(m=>m.from+m.to+(m.promotion||'')!==a.expected),fen=a.chess.fen();
 assert.equal(a.play(legal.from+legal.to+(legal.promotion||'')).status,'wrong');assert.equal(a.failed,true);assert.equal(a.chess.fen(),fen);
});
test('rating records once, stays isolated, filters and chooses unseen themed puzzles',()=>{
 const p=puzzles[0],progress=blankProgress();assert.equal(recordResult(progress,p,false,1000).success,false);const rating=progress.rating;assert.equal(recordResult(progress,p,true,1001),null);assert.equal(progress.rating,rating);assert.equal(puzzleStats(progress,0).total,1);assert.equal(puzzleStats(progress,30,1000+31*86400000).total,0);
 const store={getItem:k=>k==='alice'?JSON.stringify(progress):null};assert.equal(loadProgress(store,'alice').rating,rating);assert.equal(loadProgress(store,'bob').rating,1000);
 const theme=THEMES[0][0],choice=choosePuzzle(puzzles,theme,progress,()=>0);assert.ok(choice.themes.includes(theme));assert.notEqual(choice.id,p.id);
});

test('progress restores the active puzzle state without changing earlier saved records',()=>{
 const p=puzzles[0],progress=blankProgress();progress.current={id:p.id,theme:'mix',cursor:2,failed:true};const loaded=loadProgress({getItem:()=>JSON.stringify(progress)},'alice');assert.deepEqual(loaded.current,progress.current);assert.equal(loadProgress({getItem:()=>'{broken'},'alice').current,undefined);
 const a=createPuzzleAttempt(p);const before=a.chess.fen();const wrong=a.chess.moves({verbose:true}).find(m=>m.from+m.to+(m.promotion||'')!==a.expected);const result=a.play(wrong.from+wrong.to+(wrong.promotion||''));assert.equal(result.status,'wrong');assert.ok(result.move.after);assert.equal(a.chess.fen(),before);
});

test('source game history is verified and excludes the puzzle move',()=>{
 const pgn='e4 Nc6 d4 e5 d5 Nce7 Bg5 Nf6 Bxf6 gxf6 Nc3 Ng6 g3 Bc5 Qe2 O-O O-O-O a5 f4 exf4 gxf4 Nxf4 Qg4+ Ng6 Bd3 d6 Qg3 Kh8 e5 fxe5 Ne4 Bb6 h4 f5 h5 fxe4 hxg6 exd3 g7+ Kg8 gxf8=Q+ Kxf8 Rxh7 Qf6 Rxd3 Bf5 Rf3 Be3+ Kd1 Bf4 Rxf4';
 const p=puzzles.find(p=>p.id==='ISYhO'),prefix=extractGamePrefix(pgn,p.fen,50);assert.equal(prefix.length,50);assert.equal(prefix.at(-1).after.split(' ').slice(0,4).join(' '),p.fen.split(' ').slice(0,4).join(' '));assert.notEqual(prefix.at(-1).san,'Rxf4');assert.equal(extractGamePrefix(pgn,p.fen,51),null);assert.equal(extractGamePrefix('e4 e5',p.fen,2),null);
});


test('legacy progress replays from 1000 without losing attempts or current puzzle',()=>{
 const old={version:1,rating:1510,history:[{id:'b',success:false,rating:1600,delta:-10,at:2,themes:['fork']},{id:'a',success:true,rating:1200,delta:10,at:1,themes:['pin']}],current:{id:'c',theme:'mix',cursor:1,failed:false}};
 const p=loadProgress({getItem:()=>JSON.stringify(old)},'p'),expected=blankProgress();
 recordResult(expected,{id:'a',rating:1200,themes:['pin']},true,1);recordResult(expected,{id:'b',rating:1600,themes:['fork']},false,2);
 assert.equal(p.rating,expected.rating);assert.deepEqual(p.history,expected.history);assert.deepEqual(p.current,old.current);assert.deepEqual(loadProgress({getItem:()=>JSON.stringify(p)},'p'),p);
});
