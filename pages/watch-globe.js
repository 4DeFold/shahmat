import createGlobe from 'cobe';
// Create WebGL only for the empty state; destroy it as soon as the user leaves.
export function createEmptyGlobe(canvas) {
 let globe=null,frame=0,observer=null,phi=0,drag=null,visible=false;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 function tick(){if(!visible||!globe)return;if(!drag)phi+=.003;globe.update({phi});if(!motion.matches)frame=requestAnimationFrame(tick);}
 function resize(){if(!globe)return;const size=Math.max(1,Math.round(canvas.clientWidth)),dpr=Math.min(2,window.devicePixelRatio||1);globe.update({width:size,height:size});}
 function start(){if(visible)return;visible=true;try{const size=Math.max(1,Math.round(canvas.clientWidth)),dpr=Math.min(2,window.devicePixelRatio||1);globe=createGlobe(canvas,{devicePixelRatio:dpr,width:size,height:size,phi,theta:.2,mapSamples:16000,mapBrightness:1.8,mapBaseBrightness:.05,diffuse:3,dark:1.1,baseColor:[1,1,1],markerColor:[.98,.39,.08],glowColor:[1,1,1],scale:1,offset:[0,0],opacity:.7,markers:[{location:[37.77,-122.42],size:.05},{location:[40.71,-74.01],size:.05},{location:[35.68,139.69],size:.05},{location:[48.86,2.35],size:.05},{location:[43.24,76.89],size:.05},{location:[-33.87,151.2],size:.05}]});observer=new ResizeObserver(resize);observer.observe(canvas);tick();}catch{canvas.classList.add('globe-fallback');}}
 function stop(){visible=false;cancelAnimationFrame(frame);observer?.disconnect();observer=null;globe?.destroy();globe=null;const wrapper=canvas.parentElement;if(wrapper&&wrapper!==canvas.closest('.watch-globe-frame')&&wrapper.parentElement?.classList.contains('watch-globe-frame'))wrapper.replaceWith(canvas);}
 canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,phi};canvas.setPointerCapture?.(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(drag){phi=drag.phi+(e.clientX-drag.x)*.008;globe?.update({phi});}});for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null;});
 return {start,stop};
}
