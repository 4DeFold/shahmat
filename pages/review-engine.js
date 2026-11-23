// Fast, approximate post-game review. Win expectation curve from Lichess:
// https://lichess.org/page/accuracy (not a calibrated personal win probability).
export const winExpectation = cp => 100 / (1 + Math.exp(-0.00368208 * Math.max(-4000,Math.min(4000,cp))));
export const moveAccuracy = loss => Math.max(0,Math.min(100,103.1668 * Math.exp(-0.04354 * Math.max(0,loss)) - 3.1669));
// Approximate categories from the bounded local search, not Chess.com classifications.
export function classifyMove(before,after,move) {
 const delta=move.color==='w' ? before.win-after.win : after.win-before.win;
 if(delta<2 && before.best===move.from+move.to+(move.promotion||''))return 'best';
 if(delta<2)return 'excellent'; if(delta<5)return 'good';
 if(delta<10)return 'inaccuracy'; if(delta<20)return 'mistake'; return 'blunder';
}
export function summarizeReview(moves,positions) {
 const summary={w:{accuracy:null,counts:{}},b:{accuracy:null,counts:{}}}, accuracy={w:[],b:[]};
 moves.forEach((move,i)=>{const before=positions[i],after=positions[i+1];if(!before||!after)return;
  const loss=move.color==='w'?before.win-after.win:after.win-before.win;
  const type=classifyMove(before,after,move);if(type)summary[move.color].counts[type]=(summary[move.color].counts[type]||0)+1;accuracy[move.color].push(moveAccuracy(loss));
 });
 for(const color of ['w','b']) if(accuracy[color].length)summary[color].accuracy=accuracy[color].reduce((a,b)=>a+b,0)/accuracy[color].length;
 return summary;
}
// One lightweight single-threaded worker per visible review; bounded time and
// nodes per position, never runs on a server or during an unfinished game.
export function createReviewEngine({WorkerClass=globalThis.Worker,timeout=30000}={}) {
 if(!WorkerClass)throw Error('Движок недоступен');
 const worker=new WorkerClass('/stockfish/stockfish-17.1-lite-single-03e3232.js');
 let stopped=false,ready=false,pending=null,resolveReady,rejectReady;
 const initialized=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject});initialized.catch(()=>{});
 const timer=setTimeout(()=>fail(Error('Движок не ответил')),timeout);
 function fail(error){if(stopped)return;stopped=true;clearTimeout(timer);worker.terminate();rejectReady(error);if(pending){clearTimeout(pending.timer);pending.reject(error);pending=null}}
 worker.onerror=()=>fail(Error('Движок недоступен'));
 worker.onmessage=event=>{for(const line of String(event.data).split('\n')){
  if(line.trim()==='uciok'){worker.postMessage('setoption name Threads value 1');worker.postMessage('setoption name Hash value 8');worker.postMessage('isready')}
  else if(line.trim()==='readyok'&&!ready){ready=true;clearTimeout(timer);resolveReady()}
  else if(pending&&/^info\s/.test(line)){
   if(/\bmultipv\s+(?!1\b)\d+/.test(line)||/\b(?:upperbound|lowerbound)\b/.test(line))continue;
   const m=line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/),depth=line.match(/\bdepth\s+(\d+)/);if(!m)continue;
   const d=Number(depth?.[1]||0);if(d<pending.depth)continue;pending.depth=d;const score=Number(m[2]);
   pending.cp=(m[1]==='cp'?score:score>=0?4000:-4000)*pending.sign;
  }else if(pending&&line.startsWith('bestmove ')){
   const job=pending;pending=null;clearTimeout(job.timer);const best=line.trim().split(/\s+/)[1];
   if(job.cp===null)job.reject(Error('Нет оценки позиции'));else job.resolve({win:winExpectation(job.cp),cp:job.cp,best:/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(best)?best:null});
  }
 }};
 worker.postMessage('uci');
 return {async evaluate(fen){await initialized;if(stopped)throw Error('Движок остановлен');if(pending)throw Error('Движок занят');if(typeof fen!=='string'||/[\r\n]/.test(fen))throw Error('Некорректная позиция');
  return new Promise((resolve,reject)=>{pending={resolve,reject,cp:null,depth:-1,sign:fen.split(' ')[1]==='b'?-1:1,timer:setTimeout(()=>fail(Error('Движок не ответил')),timeout)};worker.postMessage(`position fen ${fen}`);worker.postMessage('go depth 9 nodes 6000 movetime 100')});},destroy(){fail(Error('Движок остановлен'))}};
}
