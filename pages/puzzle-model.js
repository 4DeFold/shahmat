import {Chess} from 'chess.js';
export const THEMES=[['mateIn1','Мат в 1'],['mateIn2','Мат в 2'],['mateIn3','Мат в 3'],['fork','Вилка'],['pin','Связка'],['discoveredAttack','Вскрытое нападение'],['sacrifice','Жертва'],['endgame','Эндшпиль']];
export function parsePuzzles(data){
 if(!Array.isArray(data?.puzzles))return [];
 return data.puzzles.map(row=>{const [id,fen,moves,rating,themes]=row.split('|');return {id,fen,moves:moves.split(' '),rating:Number(rating),themes:themes.split(' ').filter(Boolean)}}).filter(p=>p.id&&p.moves.length>=2&&Number.isFinite(p.rating));
}
export function choosePuzzle(puzzles,theme,progress,random=Math.random){
 const pool=puzzles.filter(p=>theme==='mix'||p.themes.includes(theme));if(!pool.length)return null;
 const played=new Set(progress.history.map(x=>x.id)),unseen=pool.filter(p=>!played.has(p.id)),candidates=unseen.length?unseen:pool;
 const rating=Number.isFinite(progress.rating)?progress.rating:1500;
 const ordered=[...candidates].sort((a,b)=>Math.abs(a.rating-rating)-Math.abs(b.rating-rating));const near=ordered.slice(0,Math.min(30,ordered.length));return near[Math.min(near.length-1,Math.floor(random()*near.length))];
}
export function blankProgress(){return {version:1,rating:1500,history:[]};}
export function loadProgress(storage,key){try{const p=JSON.parse(storage.getItem(key));if(p?.version===1&&Number.isFinite(p.rating)&&Array.isArray(p.history))return {version:1,rating:p.rating,history:p.history.filter(x=>x&&typeof x.id==='string'&&typeof x.success==='boolean'&&Number.isFinite(x.at)&&Array.isArray(x.themes)),current:p.current&&typeof p.current.id==='string'&&typeof p.current.theme==='string'&&Number.isInteger(p.current.cursor)&&typeof p.current.failed==='boolean'?p.current:null};}catch{}return blankProgress();}
export function recordResult(progress,puzzle,success,now=Date.now()){
 // A replay never changes rating or adds another attempt.
 if(progress.history.some(row=>row.id===puzzle.id))return null;
 const before=progress.rating,expected=1/(1+10**((puzzle.rating-before)/400)),delta=Math.round(32*((success?1:0)-expected));
 progress.rating=Math.max(100,Math.min(3000,before+delta));const entry={id:puzzle.id,success,rating:puzzle.rating,delta:progress.rating-before,at:now,themes:puzzle.themes};progress.history.unshift(entry);return entry;
}
export function puzzleStats(progress,days,now=Date.now()){
 const entries=progress.history.filter(x=>!days||x.at>=now-days*86400000),solved=entries.filter(x=>x.success).length;
 const byTheme=THEMES.map(([id,label])=>{const relevant=entries.filter(x=>x.themes.includes(id));return {id,label,total:relevant.length,solved:relevant.filter(x=>x.success).length};});
 return {entries,solved,total:entries.length,accuracy:entries.length?Math.round(solved/entries.length*100):null,byTheme};
}
export function createPuzzleAttempt(puzzle){
 const chess=new Chess(puzzle.fen);const apply=uci=>chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});
 const previous=apply(puzzle.moves[0]);let cursor=1,failed=false,finished=false;
 return {chess,previous,get cursor(){return cursor},get failed(){return failed},get finished(){return finished},get expected(){return puzzle.moves[cursor]},
  play(uci){if(finished)return {status:'finished'};let move;try{move=chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]})}catch{return {status:'illegal'}}
   if(uci!==puzzle.moves[cursor]){chess.undo();failed=true;return {status:'wrong',move}}cursor++;if(cursor>=puzzle.moves.length){finished=true;return {status:'solved',move,success:!failed}}return {status:'correct',move};},
  reply(){if(finished||cursor>=puzzle.moves.length)return null;const move=apply(puzzle.moves[cursor++]);if(cursor>=puzzle.moves.length)finished=true;return move;},
  fail(){failed=true},
 };
}
// Only trust a source game's score when it actually reaches this puzzle's FEN.
// Never include moves after the starting position (which would spoil the puzzle).
export function extractGamePrefix(pgn, fen, initialPly){
 const game=new Chess();game.loadPgn(pgn);const moves=game.history({verbose:true});
 const key=s=>s.split(' ').slice(0,4).join(' '),target=key(fen);
 if(!Number.isInteger(initialPly)||initialPly<0||initialPly>moves.length)return null;
 const position=initialPly?moves[initialPly-1].after:new Chess().fen();
 return key(position)===target?moves.slice(0,initialPly):null;
}
