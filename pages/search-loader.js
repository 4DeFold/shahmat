// Closed knight's tour traced from the reference drawing (each edge is one knight move).
export const knightTour = [0,10,16,1,18,8,2,12,27,33,43,26,11,28,38,23,6,21,15,5,22,7,13,3,9,24,34,19,4,14,31,46,63,53,47,62,45,55,61,51,36,30,20,37,52,35,25,40,57,42,48,58,41,56,50,60,54,39,29,44,59,49,32,17,0];
export function tourPoint(position) {
  const count=knightTour.length-1, wrapped=((position%count)+count)%count;
  const index=Math.floor(wrapped), fraction=wrapped-index, a=knightTour[index], b=knightTour[index+1];
  return {x:(a%8+.5)+(b%8-a%8)*fraction, y:(Math.floor(a/8)+.5)+(Math.floor(b/8)-Math.floor(a/8))*fraction};
}

export function createSearchLoader(element, win) {
  const canvas=element.querySelector('canvas');
  let ctx=null, trailCanvas=null, trailCtx=null, frame=null, timeout=null, active=false, destroyed=false, started=null;
  const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function draw(time) {
    if (!ctx) return;
    const size=canvas.clientWidth, scale=Math.min(win.devicePixelRatio||1,2);
    if (!size) return;
    const pixels=Math.max(1,Math.round(size*scale));
    if(canvas.width!==pixels||canvas.height!==pixels){canvas.width=pixels;canvas.height=pixels;}
    if (!trailCanvas) { trailCanvas=element.ownerDocument.createElement('canvas'); trailCtx=trailCanvas.getContext('2d'); }
    if (!trailCtx) return;
    if (trailCanvas.width!==pixels||trailCanvas.height!==pixels) {trailCanvas.width=pixels;trailCanvas.height=pixels;}
    ctx.setTransform(pixels/8,0,0,pixels/8,0,0);ctx.clearRect(0,0,8,8);
    const styles=win.getComputedStyle(element), color=styles.getPropertyValue('--accent').trim()||'#333', contrast=styles.getPropertyValue('--surface').trim()||'#fff';
    const progress=reduced()?0:(time-started)/1000*7.5, trail=3.5;
    trailCtx.setTransform(pixels/8,0,0,pixels/8,0,0);trailCtx.clearRect(0,0,8,8);
    trailCtx.lineWidth=.085;trailCtx.lineCap='butt';
    const opacity=distance=>.8*Math.pow(Math.max(0,1-distance/trail),1.6);
    for(let dot=0;dot<3;dot++) {
      const head=progress+dot*(64/3), tail=head-trail;
      // Each straight knight-tour edge has its own continuous alpha gradient.
      // Circular joins at the corners keep the path seamless without bead-like overlaps.
      let start=tail;
      while(start<head-1e-9) {
        const end=Math.min(head,Math.floor(start+1e-9)+1), a=tourPoint(start), b=tourPoint(end);
        const gradient=trailCtx.createLinearGradient(a.x,a.y,b.x,b.y);
        for(let stop=0;stop<=8;stop++) {
          const t=stop/8, alpha=opacity(head-(start+(end-start)*t));
          gradient.addColorStop(t,`rgba(255,255,255,${alpha})`);
        }
        trailCtx.strokeStyle=gradient;trailCtx.beginPath();trailCtx.moveTo(a.x,a.y);trailCtx.lineTo(b.x,b.y);trailCtx.stroke();
        if(end<head-1e-9) {
          trailCtx.fillStyle=`rgba(255,255,255,${opacity(head-end)})`;
          trailCtx.beginPath();trailCtx.arc(b.x,b.y,.0425,0,Math.PI*2);trailCtx.fill();
        }
        start=end;
      }
    }
    // Tint the alpha mask once, so the gradient follows the path around corners.
    trailCtx.globalCompositeOperation='source-in';trailCtx.fillStyle=color;trailCtx.fillRect(0,0,8,8);trailCtx.globalCompositeOperation='source-over';
    ctx.shadowColor=contrast;ctx.shadowBlur=Math.min(5,pixels*.012);ctx.drawImage(trailCanvas,0,0,8,8);ctx.shadowBlur=0;
    for(let dot=0;dot<3;dot++) {
      const p=tourPoint(progress+dot*(64/3));ctx.globalAlpha=.38;ctx.shadowColor=contrast;ctx.shadowBlur=Math.min(6,pixels*.015);ctx.fillStyle=contrast;ctx.beginPath();ctx.arc(p.x,p.y,.13,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;ctx.globalAlpha=1;ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,.095,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  function tick(time){frame=null;if(!active||destroyed)return;if(started===null)started=time;draw(time);if(!reduced())frame=win.requestAnimationFrame(tick);}
  function setVisible(show) {
    if(destroyed||show===active)return;
    active=show;if(timeout!==null){win.clearTimeout(timeout);timeout=null;}
    if(show){
      element.hidden=false;started=null;
      if(win.requestAnimationFrame&&!ctx){try{ctx=canvas.getContext('2d');}catch{/* Canvas is optional. */}}
      if(win.requestAnimationFrame&&ctx){frame=win.requestAnimationFrame(time=>{tick(time);if(active)element.classList.add('is-visible');});}
      else element.classList.add('is-visible');
    } else {
      element.classList.remove('is-visible');
      if(frame!==null){win.cancelAnimationFrame(frame);frame=null;}
      if(reduced()){element.hidden=true;return;}
      timeout=win.setTimeout(()=>{if(!active)element.hidden=true;timeout=null;},320);
    }
  }
  return {setVisible,destroy(){destroyed=true;active=false;if(frame!==null)win.cancelAnimationFrame(frame);if(timeout!==null)win.clearTimeout(timeout);element.hidden=true;}};
}
