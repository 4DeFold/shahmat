import {Chess} from 'chess.js';
import {pieceSrc} from './piece-theme.js';

export const controls = {
  bullet:['1+0','1+1','2+0','2+1'], blitz:['3+0','3+2','5+0','5+3'],
  rapid:['10+0','10+5','15+0','15+10'], classical:['30+0','30+20','60+0','60+40'],
};
const info = {
 bullet:{name:'Пуля',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 19 5 17l9-9c2-2 4-3 6-3 0 2-1 4-3 6l-9 9Z"/><path d="m8 14 3 3M5 19l-2 2"/></svg>',desc:'Молниеносные партии'},
 blitz:{name:'Блиц',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22c-4 0-7-3-7-7 0-3 2-6 4-8 0 3 2 3 2 3 1-3 2-5 4-7 0 4 4 6 4 12 0 4-3 7-7 7Z"/><path d="M9 18c0-2 1-3 3-5 0 3 3 3 3 5a3 3 0 0 1-6 0Z"/></svg>',desc:'Быстро и динамично'},
 rapid:{name:'Рапид',icon:'🐇',desc:'Время на размышления'},
 classical:{name:'Классика',icon:'🐢',desc:'Неспешная стратегия'},
};
// Prepare the last three legal plies; never invent a checkmate from damaged data.
export function lastThree(moves) {
  if (!Array.isArray(moves) || moves.length < 3) return null;
  try {
    const chess=new Chess(); for(const move of moves)chess.move(move);
    if(!chess.isCheckmate())return null;
    const before=new Chess(); for(const move of moves.slice(0,-3))before.move(move);
    return {fen:before.fen(), moves:moves.slice(-3)};
  } catch {return null;}
}

export function createPlayLobby({document,client,onChoose,onOpenBoard}) {
 const win=document.defaultView, root=document.getElementById('play-lobby'), shell=document.getElementById('member-game');
 const stage=document.getElementById('lobby-stage'), title=document.getElementById('lobby-title'), subtitle=document.getElementById('lobby-subtitle'), back=document.getElementById('lobby-back'), foot=document.getElementById('lobby-footnote');
 let screen='kinds',kind='rated',mode=null, timers=[], demoGames=[], fetching=null, visible=true, disposed=false, active=false;
 const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const clear=()=>{timers.forEach(id=>win.clearTimeout(id));timers=[];};
 const later=(fn,ms)=>{const id=win.setTimeout(()=>{timers=timers.filter(t=>t!==id);fn();},ms);timers.push(id);};
 const randomDelay=()=>1000+Math.floor(Math.random()*4001);
 function renderBoard(element,chess,move) {
  const frag=document.createDocumentFragment();
  for(let r=8;r>=1;r--)for(let f=0;f<8;f++){
   const square='abcdefgh'[f]+r,p=chess.get(square),cell=document.createElement('span');cell.className=`demo-square ${(r+f)%2?'dark':'light'}`;
   if(move&&(square===move.from||square===move.to))cell.classList.add('last');
   if(p){const image=document.createElement('img');image.src=pieceSrc(p.color,p.type);image.alt='';cell.append(image);
    if(move&&square===move.to&&!reduced()&&image.animate){const dx=('abcdefgh'.indexOf(move.from[0])-f)*100,dy=(Number(square[1])-Number(move.from[1]))*100;image.animate([{transform:`translate(${dx}%,${dy}%)`},{transform:'translate(0,0)'}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'});}}
   frag.append(cell);
  }
  element.replaceChildren(frag);
 }
 function runDemo(card) {
  if(!visible||screen!=='kinds'||disposed||!demoGames.length)return;
  const board=card.querySelector('.demo-board'),white=card.querySelector('.demo-white'),black=card.querySelector('.demo-black');
  const game=demoGames[Math.floor(Math.random()*demoGames.length)],chess=new Chess(game.fen);let index=0;
  white.textContent='';black.textContent='';white.className='demo-delta demo-white';black.className='demo-delta demo-black';
  renderBoard(board,chess,null);
  const next=()=>{
   if(!visible||screen!=='kinds'||disposed)return;
   let move;try{move=chess.move(game.moves[index++]);}catch{return;}
   renderBoard(board,chess,move);
   if(index<game.moves.length){later(next,randomDelay());return;}
   if(chess.isCheckmate()) {
    const winner=chess.turn()==='w'?'black':'white',n=2+Math.floor(Math.random()*49),rated=card.dataset.kind==='rated';
    for(const [el,color] of [[white,'white'],[black,'black']]){const won=color===winner;el.textContent=rated?`${won?'+':'−'}${n} ЯР`:'0 ЯР';el.className=`demo-delta demo-${color} is-visible ${rated?(won?'positive':'negative'):'neutral'}`;}
   }
   later(()=>runDemo(card),3000+Math.random()*2000);
  };
  later(next,randomDelay());
 }
 function startDemos(){clear();if(!visible||screen!=='kinds')return;for(const card of stage.querySelectorAll('.kind-card'))runDemo(card);}
 async function load(){
  if(!active || fetching || demoGames.length || disposed)return fetching;
  fetching=(async()=>{try{const {data,error}=await client.rpc('play_demo_games');if(error || !Array.isArray(data))throw error||Error('invalid demos');demoGames=data.map(x=>lastThree(x.moves)).filter(Boolean);if(screen==='kinds'&&visible){foot.textContent=demoGames.length?'Демонстрационные партии · случайные последние ходы до мата':'Пока нет партий с матом для демонстрации.';startDemos();}}catch{if(screen==='kinds')foot.textContent='Не удалось загрузить демонстрационные партии.';}finally{fetching=null;}})();return fetching;
 }
 function show(next) {
  clear();screen=next;shell.classList.add('lobby-open');root.hidden=false;back.hidden=screen==='kinds';
  title.textContent=screen==='kinds'?'Выберите игру.':screen==='modes'?'Выберите режим.':'Выберите время.';
  subtitle.textContent=screen==='kinds'?'Какую партию сыграем сегодня?':screen==='modes'?(kind==='rated'?'Ранговые партии':'Товарищеские партии'):`${info[mode].name} · ${kind==='rated'?'Ранговая':'Товарищеская'}`;
  foot.hidden=screen!=='kinds';stage.className=`lobby-stage stage-${screen}`;stage.replaceChildren();
  if(screen==='kinds'){
   for(const [key,label,desc] of [['friendly','Товарищеские','Играйте без изменения рейтинга'],['rated','Ранговые','Играйте на рейтинг']]){
    const button=document.createElement('button');button.type='button';button.className='kind-card lobby-card';button.dataset.kind=key;
    button.innerHTML=`<span class="demo-frame"><span class="demo-delta demo-black"></span><span class="demo-board" aria-hidden="true"></span><span class="demo-delta demo-white"></span></span><span class="kind-copy"><strong>${label}</strong><small>${desc}</small></span><span class="lobby-arrow" aria-hidden="true">↗</span>`;
    button.addEventListener('click',()=>{kind=key;show('modes');});stage.append(button);
   }
   if(demoGames.length){foot.textContent='Демонстрационные партии · случайные последние ходы до мата';startDemos();}else{foot.textContent='Загружаем демонстрационные партии…';void load();}
  } else if(screen==='modes'){
   for(const [key,data] of Object.entries(info)){
    const button=document.createElement('button');button.type='button';button.className='choice-card lobby-card';button.innerHTML=`<span class="choice-icon" aria-hidden="true">${data.icon}</span><strong>${data.name}</strong><small>${data.desc}</small><span class="choice-arrow" aria-hidden="true">↗</span>`;
    button.addEventListener('click',()=>{mode=key;show('controls');});stage.append(button);
   }
   const custom=document.createElement('button');custom.type='button';custom.disabled=true;custom.className='choice-card lobby-card';custom.innerHTML='<span class="choice-icon" aria-hidden="true">✳</span><strong>Кастом</strong><small>Скоро</small>';stage.append(custom);
  } else {
   for(const control of controls[mode]){
    const button=document.createElement('button');button.type='button';button.className='choice-card time-card lobby-card';button.innerHTML=`<span class="choice-icon time-icon" aria-hidden="true">◷</span><strong>${control}</strong><small>минуты + секунды</small><span class="choice-arrow" aria-hidden="true">↗</span>`;
    button.addEventListener('click',()=>{if(onChoose({mode,kind,timeControl:control}))openBoard();});stage.append(button);
   }
  }
 }
 function openBoard(){clear();root.hidden=true;shell.classList.remove('lobby-open');onOpenBoard?.();}
 back.addEventListener('click',()=>show(screen==='controls'?'modes':'kinds'));
 show('kinds');
 return {activate(){active=true;return load();},show,openBoard,setVisible(value){visible=value;if(visible&&screen==='kinds'&&!root.hidden){void load();startDemos();}else clear();},destroy(){disposed=true;clear();}};
}
