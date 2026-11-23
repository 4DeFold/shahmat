import {Chess} from 'chess.js';
import {createReviewEngine,summarizeReview,classifyMove} from './review-engine.js';
const categories=[['brilliant','◆','Блестящий'],['best','★','Лучший'],['excellent','●','Отличный'],['good','✓','Хороший'],['inaccuracy','△','Неточность'],['mistake','✕','Ошибка'],['blunder','▼','Зевок']];
const categoryByKey=new Map(categories.map(([key,icon,label])=>[key,{icon,label}]));
// A review is deliberately created only for a finished game, and is stopped
// whenever its view is hidden. Results are kept in memory for that review only.
export function createGameReview({document,frame,host,createEngine=createReviewEngine}) {
 if(!frame||!host)return {start(){},clear(){},setIndex(){},syncHistory(){},refresh(){},setVisible(){},destroy(){}};
 const board=frame.querySelector('.board');const history=host.querySelector('#move-list');
 const bar=document.createElement('div');bar.className='review-bar';bar.hidden=true;bar.setAttribute('role','img');
 const white=document.createElement('span');white.className='review-bar-white';bar.append(white);frame.append(bar);
 const panel=document.createElement('section');panel.className='review-panel';panel.hidden=true;panel.setAttribute('aria-label','Анализ партии');const movesBlock=host.querySelector('.moves');if(movesBlock)movesBlock.insertAdjacentElement('afterend',panel);else host.append(panel);
 let engine=null,run=0,game=null,index=0,visible=true,destroyed=false,working=false,leaveTimer=null;
 function cancelLeave(){if(leaveTimer!==null){clearTimeout(leaveTimer);leaveTimer=null;}bar.classList.remove('is-leaving');panel.classList.remove('is-leaving');bar.removeAttribute('aria-hidden');panel.removeAttribute('aria-hidden');}
 function stop(){run++;working=false;engine?.destroy();engine=null;}
 function removeBoardMark(){const mark=board?.querySelector('.review-board-mark');if(!mark)return;const cell=mark.parentElement;const label=cell.dataset.reviewBaseLabel;if(label!==undefined && cell.getAttribute('aria-label')?.endsWith(`, ${mark.dataset.label}`))cell.setAttribute('aria-label',label);delete cell.dataset.reviewBaseLabel;mark.remove();}
 function clearHistoryMarks(){if(!history)return;for(const badge of history.querySelectorAll('.review-move-mark')){const button=badge.parentElement;if(button.dataset.reviewBaseLabel!==undefined){button.setAttribute('aria-label',button.dataset.reviewBaseLabel);delete button.dataset.reviewBaseLabel;}badge.remove();}}
 function markInfo(i){if(!game||i<0||i>=game.moves.length||!game.positions[i]||!game.positions[i+1])return null;const key=classifyMove(game.positions[i],game.positions[i+1],game.moves[i]);return {key,...categoryByKey.get(key)};}
 function updateHistoryMark(i){if(!history||!game)return;const button=history.querySelector(`[data-history-index="${i+1}"]`),info=markInfo(i);if(!button)return;const old=button.querySelector('.review-move-mark');if(!info){if(old){if(button.dataset.reviewBaseLabel!==undefined)button.setAttribute('aria-label',button.dataset.reviewBaseLabel);delete button.dataset.reviewBaseLabel;old.remove();}return;}
  if(old?.dataset.type===info.key)return;old?.remove();if(button.dataset.reviewBaseLabel===undefined)button.dataset.reviewBaseLabel=button.getAttribute('aria-label')||'';button.setAttribute('aria-label',`${button.dataset.reviewBaseLabel}, ${info.label}`);const badge=document.createElement('span');badge.className='review-move-mark';badge.dataset.type=info.key;badge.setAttribute('aria-hidden','true');badge.title=info.label;badge.textContent=info.icon;button.append(badge);
 }
 function syncHistory(){if(!game||!history||game.historyBound)return;const buttons=history.querySelectorAll('[data-history-index]');if(buttons.length!==game.moves.length)return;game.historyBound=true;game.moves.forEach((_,i)=>updateHistoryMark(i));}
 function updateBoardMark(){if(!board||!game)return;const info=markInfo(index-1),move=game.moves[index-1],cell=move&&board.querySelector(`[data-square="${move.to}"]`);const existing=board.querySelector('.review-board-mark');if(existing&&existing.parentElement===cell&&existing.dataset.type===info?.key){const label=cell.getAttribute('aria-label')||'';if(!label.endsWith(`, ${info.label}`)){cell.dataset.reviewBaseLabel=label;cell.setAttribute('aria-label',`${label}, ${info.label}`);}return;}removeBoardMark();if(!info||!cell)return;const badge=document.createElement('span');badge.className='review-board-mark';badge.dataset.type=info.key;badge.dataset.label=info.label;badge.title=info.label;badge.textContent=info.icon;badge.setAttribute('aria-hidden','true');cell.dataset.reviewBaseLabel=cell.getAttribute('aria-label')||'';cell.setAttribute('aria-label',`${cell.dataset.reviewBaseLabel}, ${info.label}`);cell.append(badge);}

 function paint(){
  if(!game)return;updateBoardMark(); const value=game.positions[index];bar.classList.toggle('is-pending',!value);
  bar.setAttribute('aria-label',value?`Оценка позиции: белые ${Math.round(value.win)}%, чёрные ${Math.round(100-value.win)}%`:'Оценка позиции ожидается');
  const pct=value?.win??50;white.style.height=`${pct}%`;bar.classList.toggle('is-flipped',game.flip);
  const completed=game.positions.filter(Boolean).length,done=completed===game.positions.length;
  const summary=done?summarizeReview(game.moves,game.positions):null;panel.replaceChildren();
  const title=document.createElement('div');title.className='review-title';title.textContent=game.error?'Анализ недоступен':done?'Анализ партии':`Анализ ${completed}/${game.positions.length}`;panel.append(title);
  const note=document.createElement('div');note.className='review-note';note.textContent=done?'Быстрая оценка Stockfish':'Локальный анализ';note.title='Приблизительная оценка: ограниченное время анализа. Блестящие ходы пока не определяются.';panel.append(note);
  const accuracyLabel=document.createElement('div');accuracyLabel.className='review-accuracy-label';accuracyLabel.textContent='Точность';panel.append(accuracyLabel);
  const table=document.createElement('div');table.className='review-table';
  const names=typeof game.names==='function'?game.names():game.names;
  for(const color of ['w','b']) {const col=document.createElement('div');col.className='review-person';const data=names?.[color],name=document.createElement('strong');name.textContent=(typeof data==='string'?data:data?.name)|| (color==='w'?'Белые':'Чёрные');name.title=name.textContent;const rating=document.createElement('small');rating.className='review-rating';rating.textContent=typeof data==='object'?data?.rating||'':'';rating.hidden=!rating.textContent;const side=document.createElement('small');side.textContent=color==='w'?'Белые':'Чёрные';const accuracy=document.createElement('b');accuracy.className='review-accuracy';accuracy.setAttribute('aria-label','Точность');accuracy.textContent=summary?.[color].accuracy==null?'—':`${Math.round(summary[color].accuracy)}%`;col.append(name,rating,side,accuracy);table.append(col)}
  panel.append(table);
  const rows=document.createElement('div');rows.className='review-rows';for(const [key,icon,label] of categories){const row=document.createElement('div');row.className=`review-row review-${key}`;const a=document.createElement('span');a.textContent=icon;a.setAttribute('aria-hidden','true');const labelEl=document.createElement('span');labelEl.textContent=label;if(key==='brilliant')row.title='Определение блестящих ходов пока недоступно';const left=document.createElement('b'),right=document.createElement('b');left.textContent=key==='brilliant'||!summary?'—':String(summary.w.counts[key]||0);right.textContent=key==='brilliant'||!summary?'—':String(summary.b.counts[key]||0);row.append(a,labelEl,left,right);rows.append(row)}panel.append(rows);
  if(game.error){const retry=document.createElement('button');retry.type='button';retry.textContent='Повторить';retry.addEventListener('click',()=>{game.error=false;paint();void work()});panel.append(retry)}
 }
 async function work(){if(!game||!visible||destroyed||working||game.error)return;const pending=game.positions.some(x=>!x);if(!pending)return;
  let token=++run;working=true;try{engine=createEngine();while(game&&visible&&token===run){let i=game.positions[index]?game.positions.findIndex(x=>!x):index;if(i<0)break;
   const position=await engine.evaluate(game.fens[i]);if(token!==run||!game)break;game.positions[i]=position;updateHistoryMark(i-1);updateHistoryMark(i);paint();
   await new Promise(resolve=>setTimeout(resolve,15));
  }}catch(e){if(token===run&&game){game.error=true;paint()}}finally{if(token===run){engine?.destroy();engine=null;working=false}}
 }
 function start({moves,flip=false,names={}}){stop();cancelLeave();removeBoardMark();clearHistoryMarks();let replay=new Chess(),list=[];try{for(const san of moves||[])list.push(replay.move(typeof san==='string'?san:san.san));}catch{game=null;bar.hidden=panel.hidden=true;return;}
  const first=new Chess().fen(),positions=Array(list.length+1).fill(null),fens=[first,...list.map(m=>m.after)];
  // Checkmate is an engine result; game results by resignation/time are not a board evaluation.
  if(replay.isCheckmate())positions[list.length]={win:replay.turn()==='w'?0:100,cp:replay.turn()==='w'?-4000:4000,best:null};
  else if(replay.isDraw())positions[list.length]={win:50,cp:0,best:null};
  game={moves:list,fens,positions,flip,names,error:false,historyBound:false};index=list.length;bar.hidden=panel.hidden=false;syncHistory();paint();void work();
 }
 return {start,clear(){stop();removeBoardMark();clearHistoryMarks();game=null;cancelLeave();if(bar.hidden&&panel.hidden)return;bar.setAttribute('aria-hidden','true');panel.setAttribute('aria-hidden','true');const reduce=document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;if(reduce){bar.hidden=panel.hidden=true;cancelLeave();return;}bar.classList.add('is-leaving');panel.classList.add('is-leaving');leaveTimer=setTimeout(()=>{bar.hidden=panel.hidden=true;cancelLeave()},180)},setIndex(value){if(!game)return;index=Math.max(0,Math.min(game.moves.length,value));paint()},syncHistory,refresh(){if(game){syncHistory();paint()}},setVisible(value){visible=!!value;if(!visible)stop();else void work()},destroy(){destroyed=true;stop();removeBoardMark();clearHistoryMarks();cancelLeave();bar.remove();panel.remove()}};
}
