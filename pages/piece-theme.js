// Piece choice is local to the browser and shared with all same-origin boards.
const key='shahmat.piece-set';
const allowed=new Set(['cburnett','classic','angular','rounded']);
export function selectedPieceSet(){try{const value=localStorage.getItem(key);return allowed.has(value)?value:'cburnett';}catch{return 'cburnett';}}
export function pieceSrc(color,type){return `/pieces/${selectedPieceSet()}/${color}${type.toUpperCase()}.svg`;}
export function setPieceSet(value){if(!allowed.has(value))return;try{localStorage.setItem(key,value);}catch{}window.dispatchEvent(new Event('shahmat-piece-set'));}
function updateImage(img){if(img.closest?.('[data-piece-preview]'))return;const src=img.getAttribute('src');const match=src?.match(/^\/pieces\/(?:cburnett|classic|angular|rounded)\/([wb])([KQRBNP])\.svg$/);if(match){const next=pieceSrc(match[1],match[2]);if(src!==next)img.setAttribute('src',next);}}
function updateTree(node){if(node.nodeType!==1)return;if(node.tagName==='IMG')updateImage(node);node.querySelectorAll?.('img').forEach(updateImage);}
export function installPieceTheme(){
 if(typeof document==='undefined')return;
 const update=()=>{document.querySelectorAll('img').forEach(updateImage);document.querySelectorAll('input[name="piece-set"]').forEach(input=>{input.checked=input.value===selectedPieceSet();});};
 new MutationObserver(records=>{for(const record of records)if(record.type==='attributes')updateImage(record.target);else record.addedNodes.forEach(updateTree);}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
 window.addEventListener('storage',event=>{if(event.key===key)update();});window.addEventListener('shahmat-piece-set',update);update();
}
