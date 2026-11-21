// A single canvas follows the pointer across selection buttons. Pixel clouds
// brighten near the cursor and leave a short trail, like Pixel Blast's reveal
// mode; no WebGL context is needed for each card.
export function pixelIntensity(x, y, points, now, radius = 92) {
 let amount=0;
 for (const p of points) {
  const age=Math.max(0,now-p.time), decay=Math.max(0,1-age/850);
  if (!decay) continue;
  const dx=x-p.x,dy=y-p.y;
  amount=Math.max(amount, Math.exp(-(dx*dx+dy*dy)/(radius*radius)) * decay);
 }
 return amount;
}

export function createPixelBlast(win) {
 let card=null,canvas=null,ctx=null,frame=0,lastDraw=0,points=[],inside=false,color='',ratio=1,width=0,height=0;
 const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 function clear(){
  if(frame)win.cancelAnimationFrame(frame);frame=0;lastDraw=0;points=[];inside=false;
  canvas?.remove();canvas=null;ctx=null;card=null;
 }
 function resize(){
  if(!card||!canvas||!ctx)return;
  const w=card.clientWidth,h=card.clientHeight,dpr=Math.min(2,win.devicePixelRatio||1);
  if(w===width&&h===height&&dpr===ratio)return;
  width=w;height=h;ratio=dpr;canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);
 }
 function start(target) {
  if(reduced()||!target||target.disabled)return false;
  if(card===target&&ctx){resize();return true;}
  clear();card=target;width=0;height=0;
  canvas=win.document.createElement('canvas');canvas.className='lobby-pixels';canvas.setAttribute('aria-hidden','true');
  target.prepend(canvas);
  try{ctx=canvas.getContext('2d');}catch{ctx=null;}
  if(!ctx){clear();return false;}
  color=win.getComputedStyle(target).getPropertyValue('--accent').trim()||'#bf9765';
  resize();return true;
 }
 function draw(now){
  frame=0;if(!ctx||!card||!card.isConnected||win.document.hidden){clear();return;}
  if(lastDraw&&now-lastDraw<28){frame=win.requestAnimationFrame(draw);return;}lastDraw=now;resize();
  points=points.filter(p=>inside&&p===points[points.length-1]||now-p.time<850);
  if(!points.length){clear();return;}
  const live=points.map((p,i)=>i===points.length-1&&inside?{...p,time:now}:p);
  ctx.clearRect(0,0,width,height);ctx.fillStyle=color;const spacing=7, radius=92;
  for(let y=spacing/2;y<height;y+=spacing)for(let x=spacing/2;x<width;x+=spacing){
   const strength=pixelIntensity(x,y,live,now,radius);if(strength<.035)continue;
   // Stable spatial noise and slow shimmer create the cloudy pixel pattern.
   const grain=(Math.sin(x*12.9898+y*78.233)*43758.5453)%1;
   const seed=Math.abs(grain), shimmer=.75+.25*Math.sin(now*.003+seed*6.28);
   const opacity=Math.max(0,Math.min(.72,(strength-.11+seed*.32)*.8*shimmer));
   if(opacity<.04)continue;
   const size=1.4+2.4*Math.min(1,strength)*(.45+seed*.55);
   ctx.globalAlpha=opacity;ctx.fillRect(x-size/2,y-size/2,size,size);
  }
  ctx.globalAlpha=1;frame=win.requestAnimationFrame(draw);
 }
 function add(target,x,y){
  if(!start(target))return;
  const now=win.performance.now();inside=true;
  const previous=points[points.length-1];
  if(!previous||Math.hypot(x-previous.x,y-previous.y)>3||now-previous.time>100)points.push({x,y,time:now});
  if(points.length>12)points.shift();
  if(!frame)frame=win.requestAnimationFrame(draw);
 }
 return {
  move(target,event){const rect=target.getBoundingClientRect();if(!rect.width||!rect.height)return;add(target,(event.clientX-rect.left)*target.clientWidth/rect.width,(event.clientY-rect.top)*target.clientHeight/rect.height);},
  focus(target){add(target,target.clientWidth/2,target.clientHeight/2);},
  leave(target){if(card===target){inside=false;if(!frame&&ctx)frame=win.requestAnimationFrame(draw);}},
  clear,destroy:clear,
 };
}
