// Closed knight's tour traced from the reference drawing (each edge is one knight move).
export const knightTour = [0,10,16,1,18,8,2,12,27,33,43,26,11,28,38,23,6,21,15,5,22,7,13,3,9,24,34,19,4,14,31,46,63,53,47,62,45,55,61,51,36,30,20,37,52,35,25,40,57,42,48,58,41,56,50,60,54,39,29,44,59,49,32,17,0];
export function tourPoint(position) {
  const count=knightTour.length-1, wrapped=((position%count)+count)%count;
  const index=Math.floor(wrapped), fraction=wrapped-index, a=knightTour[index], b=knightTour[index+1];
  return {x:(a%8+.5)+(b%8-a%8)*fraction, y:(Math.floor(a/8)+.5)+(Math.floor(b/8)-Math.floor(a/8))*fraction};
}

export function createSearchLoader(element, win) {
  const canvas=element.querySelector('canvas');
  let ctx=null, frame=null, timeout=null, active=false, destroyed=false, started=null;
  const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function draw(time) {
    if (!ctx) return;
    const size=canvas.clientWidth, scale=Math.min(win.devicePixelRatio||1,2);
    if (!size) return;
    const pixels=Math.max(1,Math.round(size*scale));
    if(canvas.width!==pixels||canvas.height!==pixels){canvas.width=pixels;canvas.height=pixels;}
    ctx.setTransform(pixels/8,0,0,pixels/8,0,0);ctx.clearRect(0,0,8,8);
    const styles=win.getComputedStyle(element), color=styles.getPropertyValue('--accent').trim()||'#333', contrast=styles.getPropertyValue('--surface').trim()||'#fff';
    const progress=reduced()?0:(time-started)/1000*3.5;
    ctx.lineCap='round';ctx.lineJoin='round';
    for(let dot=0;dot<3;dot++){
      const head=progress+dot*(64/3), steps=36, trail=3.5;
      ctx.shadowColor=contrast;ctx.shadowBlur=Math.min(5,pixels*.012);
      for(let i=steps;i>0;i--){
        const a=tourPoint(head-trail*i/steps),b=tourPoint(head-trail*(i-1)/steps), alpha=Math.pow(1-i/(steps+1),1.6);
        ctx.globalAlpha=alpha*.8;ctx.lineWidth=.085;ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      }
      const p=tourPoint(head);ctx.globalAlpha=.38;ctx.shadowColor=contrast;ctx.shadowBlur=Math.min(6,pixels*.015);ctx.fillStyle=contrast;ctx.beginPath();ctx.arc(p.x,p.y,.13,0,Math.PI*2);ctx.fill();
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
