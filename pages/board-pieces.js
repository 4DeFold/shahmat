// Boards always have a complete embedded standard set. A selected alternative
// arrives as a single versioned pack and is applied only after it is complete.
import standard from './piece-bundles/cburnett.js';
import packs from './piece-packs-manifest.js';
import {selectedPieceSet} from './piece-theme.js';
const names=['wK','wQ','wR','wB','wN','wP','bK','bQ','bR','bB','bN','bP'];
const encode=items=>Object.fromEntries(names.map(name=>[name,`data:image/svg+xml;charset=utf-8,${encodeURIComponent(items[name])}`]));
const sets=new Map([['cburnett',encode(standard)]]),inflight=new Map(),retryAt=new Map(),failures=new Map(),retryTimers=new Map();
function request(set,win){
 if(!packs[set]||sets.has(set)||inflight.has(set)||Date.now()<(retryAt.get(set)||0))return;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 const pending=win.fetch(packs[set],{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('pack unavailable');return r.json()}).then(data=>{
  if(!data||!names.every(n=>typeof data[n]==='string'&&data[n].includes('<svg')))throw Error('invalid pack');
  sets.set(set,encode(data));retryAt.delete(set);failures.delete(set);
  win.dispatchEvent(new win.Event('shahmat-board-pieces-ready'));
 }).catch(()=>{const delay=Math.min(60000,5000*2**Math.min(4,failures.get(set)||0));failures.set(set,(failures.get(set)||0)+1);retryAt.set(set,Date.now()+delay);if(!retryTimers.has(set)){retryTimers.set(set,setTimeout(()=>{retryTimers.delete(set);if(selectedPieceSet()===set)win.dispatchEvent(new win.Event('shahmat-board-pieces-ready'))},delay+10))}}).finally(()=>{clearTimeout(timer);inflight.delete(set)});
 inflight.set(set,pending);
}
export function boardPieceSrc(color,type,win=globalThis.window){
 const set=selectedPieceSet(),name=color+type.toUpperCase();
 if(!sets.has(set)&&win?.fetch)request(set,win);
 return (sets.get(set)||sets.get('cburnett'))[name];
}
export function setBoardPiece(img,color,type){
 img.dataset.boardColor=color;img.dataset.boardType=type.toUpperCase();
 const src=boardPieceSrc(color,type,img.ownerDocument.defaultView);
 if(img.getAttribute('src')!==src)img.setAttribute('src',src);
 img.dataset.piecePack=sets.has(selectedPieceSet())?selectedPieceSet():'cburnett';
}
export function installBoardPieces(doc=globalThis.document){
 const win=doc?.defaultView;if(!win)return;
 const update=()=>doc.querySelectorAll('img[data-board-color][data-board-type]').forEach(img=>setBoardPiece(img,img.dataset.boardColor,img.dataset.boardType));
 win.addEventListener('shahmat-piece-set',update);win.addEventListener('shahmat-board-pieces-ready',update);
 win.addEventListener('storage',e=>{if(e.key==='shahmat.piece-set')update()});
 win.addEventListener('online',()=>{retryAt.clear();failures.clear();update()});
}
