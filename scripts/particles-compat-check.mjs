// Simulate WebGL being unavailable or reclaimed, as on constrained mobile devices.
// Run against Vite dev (dynamic module import) with a Playwright browser installed.
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
const name=process.env.BROWSER||'chromium', engines={chromium,firefox,webkit};
const executablePath=process.env[`${name.toUpperCase()}_EXECUTABLE_PATH`];
const browser=await engines[name].launch({headless:true,...(executablePath?{executablePath}:{}),args:name==='chromium'?(process.env.CHROMIUM_EXTRA_ARGS||'').split(' ').filter(Boolean):[]});
try {
 const page=await browser.newPage({viewport:{width:800,height:600},reducedMotion:'reduce'}), errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.RESPONSIVE_BASE_URL||'http://127.0.0.1:4270');
 const result=await page.evaluate(async()=>{
  const {createHomeParticles}=await import('/pages/home-particles.js');
  const host=document.createElement('div');Object.assign(host.style,{width:'500px',height:'300px',position:'fixed',top:'0',left:'0',zIndex:'9999'});host.style.setProperty('--foreground','#111');host.style.setProperty('--accent','#f00');host.style.setProperty('--board-dark','#777');document.body.append(host);
  const original=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl'||type==='webgl2')return null;return original.call(this,type,...args);};
  const fallback=createHomeParticles(host);
  const canvas=host.querySelector('canvas'), ctx=canvas?.getContext('2d');
  let alpha=false;
  for(let attempt=0;attempt<40&&!alpha;attempt++){
   await new Promise(r=>setTimeout(r,100));
   alpha=!!ctx&&[...ctx.getImageData(0,0,canvas.width,canvas.height).data].some((value,index)=>index%4===3&&value>0);
  }
  const dimensions=[canvas?.width,canvas?.height];fallback.destroy();const removed=!host.querySelector('canvas');
  HTMLCanvasElement.prototype.getContext=original;
  const normal=createHomeParticles(host), old=host.querySelector('canvas');let contextLoss=null;
  if(old && (old.getContext('webgl2')||old.getContext('webgl'))){old.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));await new Promise(r=>setTimeout(r,100));const replacement=host.querySelector('canvas');contextLoss={replaced:!!replacement&&replacement!==old,is2d:!!replacement?.getContext('2d')};}
  normal.destroy();const clean=!host.querySelector('canvas');host.remove();
  return {alpha,dimensions,removed,contextLoss,clean};
 });
 assert.equal(result.alpha,true,'2D fallback draws visible particles');assert.ok(result.dimensions[0]>0&&result.dimensions[1]>0);assert.equal(result.removed,true);assert.equal(result.clean,true);
 if(result.contextLoss)assert.deepEqual(result.contextLoss,{replaced:true,is2d:true},'lost WebGL context is replaced by animated 2D fallback');
 assert.deepEqual(errors,[]);console.log(`✓ ${name}: no-WebGL fallback${result.contextLoss?', context loss recovery':''}, cleanup and reduced motion`);
} finally {await browser.close();}
