// Board-local SVG stays aligned through resizing, flipping and redraws.
export function createBoardAnnotations({ document, board }) {
  const ns='http://www.w3.org/2000/svg', win=document.defaultView;
  const svg=document.createElementNS(ns,'svg'); svg.setAttribute('viewBox','0 0 800 800'); svg.setAttribute('aria-hidden','true'); svg.classList.add('board-annotations');
  const items=new Map(), rendered=new Map(); let gesture=null, previewNode=null;
  const colors={orange:'#e38b1f',green:'#57a34b',blue:'#398bc4',red:'#e04747'};
  const squareAt=(event) => {
    const hit=document.elementFromPoint?.(event.clientX,event.clientY)?.closest?.('[data-square]');
    if(hit && board.contains(hit)) return hit.dataset.square;
    if (!document.elementFromPoint) return event.target?.closest?.('[data-square]')?.dataset.square || null;
    return null;
  };
  function point(square) {
    const cells=[...board.querySelectorAll('[data-square]')], index=cells.findIndex(cell=>cell.dataset.square===square);
    return index<0?null:{x:(index%8)*100+50,y:Math.floor(index/8)*100+50};
  }
  function drawItem(item, preview=false) {
    const from=point(item.from),to=point(item.to); if(!from||!to) return;
    const group=document.createElementNS(ns,'g'); group.classList.add(preview?'annotation-preview':'annotation-item'); group.dataset.annotation=`${item.from}-${item.to}`;
    const color=colors[item.color];
    if(item.from===item.to){
      const rect=document.createElementNS(ns,'rect'); for(const [key,value] of Object.entries({x:from.x-45,y:from.y-45,width:90,height:90,rx:9,fill:color,'fill-opacity':'.32',stroke:color,'stroke-width':7,'stroke-opacity':'.92'})) rect.setAttribute(key,String(value)); group.append(rect);
    } else {
      const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len, endX=to.x-ux*13,endY=to.y-uy*13, baseX=endX-ux*38,baseY=endY-uy*38;
      const line=document.createElementNS(ns,'line'); for(const [key,value] of Object.entries({x1:from.x,y1:from.y,x2:baseX,y2:baseY,stroke:color,'stroke-width':18,'stroke-linecap':'round','stroke-opacity':'.85'})) line.setAttribute(key,String(value));
      const head=document.createElementNS(ns,'polygon'); head.setAttribute('points',`${endX},${endY} ${baseX-uy*24},${baseY+ux*24} ${baseX+uy*24},${baseY-ux*24}`); head.setAttribute('fill',color); head.setAttribute('fill-opacity','.85'); group.append(line,head);
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
    if(event.button!==2 || event.pointerType==='touch') return;
    const from=squareAt(event); if(!from) return; event.preventDefault();
    gesture={from,to:from,pointer:event.pointerId,color:event.shiftKey?'green':event.altKey?'blue':event.ctrlKey||event.metaKey?'red':'orange'};
    board.setPointerCapture?.(event.pointerId); refresh();
  }
  function move(event) { if(!gesture||gesture.pointer!==event.pointerId) return; const to=squareAt(event); if(to!==gesture.to){gesture.to=to;refresh();} }
  function up(event) {
    if(!gesture||gesture.pointer!==event.pointerId) return;
    const item=gesture, to=squareAt(event); gesture=null;
    if(to) { item.to=to; const key=`${item.from}:${to}:${item.color}`; if(items.has(key)) items.delete(key); else items.set(key,item); }
    refresh();
  }
  function cancel(event) { if(gesture && (event.pointerId===undefined || event.pointerId===gesture.pointer)){gesture=null;refresh();} }
  function menu(event){event.preventDefault();}
  function key(event){if(event.key==='Escape') clear();}
  board.addEventListener('pointerdown',down); board.addEventListener('pointermove',move); board.addEventListener('pointerup',up); board.addEventListener('pointercancel',cancel); board.addEventListener('lostpointercapture',cancel); board.addEventListener('contextmenu',menu); document.addEventListener('keydown',key); win.addEventListener('blur',cancel);
  refresh();
  return {refresh,clear,destroy(){ clear(); svg.remove(); board.removeEventListener('pointerdown',down); board.removeEventListener('pointermove',move); board.removeEventListener('pointerup',up); board.removeEventListener('pointercancel',cancel); board.removeEventListener('lostpointercapture',cancel); board.removeEventListener('contextmenu',menu); document.removeEventListener('keydown',key); win.removeEventListener('blur',cancel); }};
}
