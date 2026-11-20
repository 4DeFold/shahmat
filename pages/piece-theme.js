const key='shahmat.piece-set';
export const pieceNames={cburnett:'Стандарт',chessnut:'Chessnut',fantasy:'Fantasy',spatial:'Spatial',celtic:'Celtic'};
export function validPieceSet(value){return Object.hasOwn(pieceNames,value)?value:'cburnett';}
export function selectedPieceSet(){try{return validPieceSet(localStorage.getItem(key));}catch{return 'cburnett';}}
export function pieceSrcFor(set,color,type){return `/pieces/${validPieceSet(set)}/${color}${type.toUpperCase()}.svg`;}
export function pieceSrc(color,type){return pieceSrcFor(selectedPieceSet(),color,type);}
export function setPieceSet(value){const next=validPieceSet(value);try{localStorage.setItem(key,next);}catch{}window.dispatchEvent(new Event('shahmat-piece-set'));}
export function setPublicPiece(img,set,color='w',type='n'){img.dataset.pieceFixed='';img.src=pieceSrcFor(set,color,type);}
export function renderPiecePreview(node,set){
 set=validPieceSet(set);if(node.dataset.renderedSet===set)return;node.dataset.renderedSet=set;node.dataset.piecePreview='';node.classList.add('piece-preview-board');
 const order=['r','n','b','q','k','b','n','r'];const doc=node.ownerDocument,fragment=doc.createDocumentFragment();
 for(let rank=0;rank<4;rank++)for(let file=0;file<8;file++){const cell=doc.createElement('span');cell.className='piece-preview-cell '+((rank+file)%2?'dark':'light');const img=doc.createElement('img');img.alt='';img.src=pieceSrcFor(set,rank<2?'b':'w',rank===0||rank===3?order[file]:'p');cell.append(img);fragment.append(cell);}node.replaceChildren(fragment);
}
function swapImage(img,next,animate){
 const old=img.getAttribute('src');if(old===next)return;const win=img.ownerDocument.defaultView,rect=img.getBoundingClientRect();
 const visible=animate&&img.isConnected&&rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<win.innerHeight&&rect.right>0&&rect.left<win.innerWidth&&!win.matchMedia('(prefers-reduced-motion: reduce)').matches&&img.animate;
 // Never duplicate the old image in the document: hidden entrance pieces and
 // clipped avatars must not be projected over the interface during a change.
 img.getAnimations?.().filter(animation=>animation.id==='piece-set-fade').forEach(animation=>animation.cancel());
 img.setAttribute('src',next);
 if(visible){const animation=img.animate([{opacity:0},{opacity:1}],{duration:220,easing:'ease-out'});animation.id='piece-set-fade';}
}
function updateImage(img,animate=false){if(img.matches('[data-piece-fixed]')||img.closest?.('[data-piece-preview]'))return;const src=img.getAttribute('src');const match=src?.match(/^\/pieces\/(?:cburnett|classic|angular|rounded|regent|turnier|courtyard|manor|chessnut|fantasy|spatial|celtic)\/([wb])([KQRBNP])\.svg$/);if(match)swapImage(img,pieceSrc(match[1],match[2]),animate);}
function updateTree(node){if(node.nodeType!==1)return;if(node.matches?.('[data-board-set]'))renderPiecePreview(node,node.dataset.boardSet);node.querySelectorAll?.('[data-board-set]').forEach(el=>renderPiecePreview(el,el.dataset.boardSet));if(node.tagName==='IMG')updateImage(node);node.querySelectorAll?.('img').forEach(img=>updateImage(img));}
export function installPieceTheme(){
 if(typeof document==='undefined')return;
 const update=()=>{document.querySelectorAll('img').forEach(img=>updateImage(img,true));document.querySelectorAll('input[name="piece-set"]').forEach(input=>{input.checked=input.value===selectedPieceSet();});};
 new MutationObserver(records=>{for(const record of records)if(record.type==='attributes')updateImage(record.target);else record.addedNodes.forEach(updateTree);}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
 window.addEventListener('storage',event=>{if(event.key===key)update();});window.addEventListener('shahmat-piece-set',update);document.querySelectorAll('[data-board-set]').forEach(el=>renderPiecePreview(el,el.dataset.boardSet));update();
}
