import {moveAccuracy} from './review-engine.js';
// Both views are based on the already-computed local review; no new engine work.
export function createReviewGraph({document,onSelect}) {
 const ns='http://www.w3.org/2000/svg',element=document.createElement('section');element.className='review-graph';element.hidden=true; element.setAttribute('aria-label','График анализа');
 const header=document.createElement('div');header.className='review-graph-header';const heading=document.createElement('strong');heading.textContent='График';
 const tabs=document.createElement('div');tabs.className='review-graph-tabs';const accuracy=document.createElement('button'),evaluation=document.createElement('button');
 accuracy.type=evaluation.type='button';accuracy.textContent='Точность';evaluation.textContent='Оценка';tabs.append(accuracy,evaluation);header.append(heading,tabs);element.append(header);
 const legend=document.createElement('div');legend.className='review-graph-legend';element.append(legend);
 const area=document.createElement('div');area.className='review-graph-area';area.setAttribute('role','slider');area.tabIndex=0;area.setAttribute('aria-label','Ход на графике');area.setAttribute('aria-valuemin','0');
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 1000 200');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');area.append(svg);element.append(area);
 const caption=document.createElement('div');caption.className='review-graph-caption';element.append(caption);
 let moves=[],positions=[],mode='evaluation',index=0,ready=false;
 const node=(name,attrs={})=>{const el=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));return el;};
 const xOf=i=>moves.length?i/moves.length*1000:0, yOf=value=>192-Math.max(0,Math.min(100,value))*1.84;
 function getAccuracy(i){if(i<1||i>moves.length)return null;const before=positions[i-1],after=positions[i];if(!before||!after)return null;const move=moves[i-1],loss=move.color==='w'?before.win-after.win:after.win-before.win;return moveAccuracy(loss);}
 function selection(){if(!ready)return;const marker=svg.querySelector('.review-graph-current');if(marker)marker.setAttribute('x1',xOf(index)),marker.setAttribute('x2',xOf(index));area.setAttribute('aria-valuemax',String(moves.length));area.setAttribute('aria-valuenow',String(index));const move=moves[index-1],label=move?`${Math.floor((index-1)/2)+1}${move.color==='w'?'.':'...'} ${move.san}`:'Начало';const value=mode==='accuracy'?getAccuracy(index):positions[index]?.win;const text=value==null?label:`${label} · ${mode==='accuracy'?'точность':'оценка белых'} ${Math.round(value)}%`;area.setAttribute('aria-valuetext',text);caption.textContent=text;}
 function draw(){if(!ready)return;accuracy.setAttribute('aria-pressed',String(mode==='accuracy'));evaluation.setAttribute('aria-pressed',String(mode==='evaluation'));legend.replaceChildren();
  const labels=mode==='accuracy'?[['w','Белые'],['b','Чёрные']]:[['eval','Оценка белых']];for(const [key,text] of labels){const span=document.createElement('span');span.className=`review-graph-key ${key}`;span.textContent=text;legend.append(span)}
  svg.replaceChildren();svg.append(node('line',{x1:0,y1:100,x2:1000,y2:100,class:'review-graph-grid'}));
  if(mode==='accuracy')for(const color of ['w','b']){const points=[];for(let i=1;i<=moves.length;i++){const val=getAccuracy(i);if(moves[i-1].color===color&&val!==null)points.push(`${xOf(i)},${yOf(val)}`)}if(points.length>1)svg.append(node('polyline',{points:points.join(' '),class:`review-graph-line ${color}`}));else if(points.length===1){const [x,y]=points[0].split(',');svg.append(node('line',{x1:Number(x)-2,x2:Number(x)+2,y1:y,y2:y,class:`review-graph-line ${color}`}))}}
  else {const points=positions.map((p,i)=>`${xOf(i)},${yOf(p.win)}`).join(' ');svg.append(node('polygon',{points:`0,100 ${points} 1000,100`,class:'review-graph-fill'}));svg.append(node('polyline',{points,class:'review-graph-line eval'}))}
  svg.append(node('line',{x1:0,x2:0,y1:0,y2:200,class:'review-graph-current'}));selection();
 }
 function choose(target){if(!ready||!moves.length||typeof onSelect!=='function')return;onSelect(Math.max(0,Math.min(moves.length,target)))}
 area.addEventListener('click',event=>{const box=area.getBoundingClientRect();if(box.width)choose(Math.round((event.clientX-box.left)/box.width*moves.length))});
 area.addEventListener('keydown',event=>{let target;if(event.key==='ArrowLeft')target=index-1;else if(event.key==='ArrowRight')target=index+1;else if(event.key==='ArrowUp'||event.key==='Home')target=0;else if(event.key==='ArrowDown'||event.key==='End')target=moves.length;else return;event.preventDefault();event.stopPropagation();choose(target)});
 accuracy.addEventListener('click',()=>{mode='accuracy';draw()});evaluation.addEventListener('click',()=>{mode='evaluation';draw()});
 return {element,setData(nextMoves,nextPositions){moves=nextMoves;positions=nextPositions;ready=moves.length>0&&positions.length===moves.length+1&&positions.every(Boolean);element.hidden=!ready;if(ready)draw()},setIndex(value){index=Math.max(0,Math.min(moves.length,value));selection()},clear(){ready=false;element.hidden=true;moves=[];positions=[];index=0;svg.replaceChildren()},destroy(){element.remove()}};
}
