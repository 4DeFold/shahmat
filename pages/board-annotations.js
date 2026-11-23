// Board-local SVG stays aligned through resizing, flipping and redraws.
export function createBoardAnnotations({ document, board, enabled = () => true }) {
  const ns='http://www.w3.org/2000/svg', win=document.defaultView;
  const svg=document.createElementNS(ns,'svg'); svg.setAttribute('viewBox','0 0 800 800'); svg.setAttribute('aria-hidden','true'); svg.classList.add('board-annotations');
  const items=new Map(), rendered=new Map(); let gesture=null, previewNode=null;
  const colors={green:'#15781B',red:'#882020',blue:'#003088',yellow:'#e68f00'};
  const squareAt=(event) => {
    const hit=document.elementFromPoint?.(event.clientX,event.clientY)?.closest?.('[data-square]');
    if(hit && board.contains(hit)) return hit.dataset.square;
    if (!document.elementFromPoint) return event.target?.closest?.('[data-square]')?.dataset.square || null;
    return null;
  };
  function destination(event) {
    const hit=squareAt(event); if (!hit) { if(gesture) gesture.snap=false; return null; }
    if (!gesture?.snap || !document.elementFromPoint) return hit;
    const origin=gesture.from, ox=origin.charCodeAt(0), oy=Number(origin[1]);
    let best=hit, distance=Infinity;
    for (const cell of board.querySelectorAll('[data-square]')) {
      const sq=cell.dataset.square, dx=Math.abs(sq.charCodeAt(0)-ox), dy=Math.abs(Number(sq[1])-oy);
      if (!(dx===0 || dy===0 || dx===dy || dx*dy===2)) continue;
      const r=cell.getBoundingClientRect(), d=(event.clientX-r.left-r.width/2)**2+(event.clientY-r.top-r.height/2)**2;
      if (d<distance) { distance=d; best=sq; }
    }
    return best;
  }
  function point(square) {
    const cells=[...board.querySelectorAll('[data-square]')], index=cells.findIndex(cell=>cell.dataset.square===square);
    return index<0?null:{x:(index%8)*100+50,y:Math.floor(index/8)*100+50};
  }
  function drawItem(item, preview=false) {
    const from=point(item.from),to=point(item.to); if(!from||!to) return;
    const group=document.createElementNS(ns,'g'); group.classList.add(preview?'annotation-preview':'annotation-item'); group.dataset.annotation=`${item.from}-${item.to}`;
    const color=colors[item.color];
    if(item.from===item.to){
      const circle=document.createElementNS(ns,'circle'); for(const [key,value] of Object.entries({cx:from.x,cy:from.y,r:47,fill:'none',stroke:color,'stroke-width':preview?6:8})) circle.setAttribute(key,String(value)); group.append(circle);
    } else {
      const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len, endX=to.x-ux*13,endY=to.y-uy*13, baseX=endX-ux*38,baseY=endY-uy*38;
      const line=document.createElementNS(ns,'line'); for(const [key,value] of Object.entries({x1:from.x,y1:from.y,x2:baseX,y2:baseY,stroke:color,'stroke-width':preview?8:10,'stroke-linecap':'round','stroke-opacity':'.55'})) line.setAttribute(key,String(value));
      const head=document.createElementNS(ns,'polygon'); head.setAttribute('points',`${endX},${endY} ${baseX-uy*24},${baseY+ux*24} ${baseX+uy*24},${baseY-ux*24}`); head.setAttribute('fill',color); head.setAttribute('fill-opacity','.55'); group.append(line,head);
    }
    svg.append(group); return group;
  }
  function refresh() {
    if(!board.contains(svg)) board.append(svg);
    for(const [key,node] of rendered) if(!items.has(key)) { node.remove(); rendered.delete(key); }
    for(const [key,item] of items) if(!rendered.has(key)) { const node=drawItem(item); if(node) rendered.set(key,node); }
    previewNode?.remove(); previewNode=null;
    if(gesture?.to && gesture.to!==gesture.from) previewNode=drawItem(gesture,true);
  }
  function clear() { gesture=null; items.clear(); refresh(); }
  function down(event) {
    if(event.button===0) { if(items.size||gesture) clear(); return; }
    if(event.button!==2 || event.pointerType==='touch' || !enabled()) return;
    const from=squareAt(event); if(!from) return; event.preventDefault();
    gesture={from,to:from,snap:true,pointer:event.pointerId,color:(event.shiftKey||event.ctrlKey)?(event.altKey||event.metaKey?'yellow':'red'):(event.altKey||event.metaKey?'blue':'green')};
    board.setPointerCapture?.(event.pointerId); refresh();
  }
  function move(event) { if(!gesture||gesture.pointer!==event.pointerId) return; const to=destination(event); if(to!==gesture.to){gesture.to=to;refresh();} }
  function up(event) {
    if(!gesture||gesture.pointer!==event.pointerId) return;
    const item=gesture, to=destination(event); gesture=null;
    if(to) { item.to=to; const key=`${item.from}:${to}`; if(items.get(key)?.color===item.color) items.delete(key); else { items.set(key,item); rendered.get(key)?.remove(); rendered.delete(key); } }
    refresh();
  }
  function cancel(event) { if(gesture && (event.pointerId===undefined || event.pointerId===gesture.pointer)){gesture=null;refresh();} }
  function menu(event){event.preventDefault();}
  function key(event){if(event.key==='Escape') clear();}
  board.addEventListener('pointerdown',down); board.addEventListener('pointermove',move); board.addEventListener('pointerup',up); board.addEventListener('pointercancel',cancel); board.addEventListener('lostpointercapture',cancel); board.addEventListener('contextmenu',menu); document.addEventListener('keydown',key); win.addEventListener('blur',cancel);
  refresh();
  return {refresh,clear,destroy(){ clear(); svg.remove(); board.removeEventListener('pointerdown',down); board.removeEventListener('pointermove',move); board.removeEventListener('pointerup',up); board.removeEventListener('pointercancel',cancel); board.removeEventListener('lostpointercapture',cancel); board.removeEventListener('contextmenu',menu); document.removeEventListener('keydown',key); win.removeEventListener('blur',cancel); }};
}
