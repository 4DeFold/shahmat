// Native lifecycle adaptation of React Bits Particles (see licenses/react-bits.txt).
// Original: David Haz, Particles.jsx at cdb3385cc53fc8f48b6e8633378e728cf0fbd978.
import {Renderer, Camera, Geometry, Program, Mesh} from 'ogl';

const vertex = /* glsl */ `
  attribute vec3 position;
  attribute vec4 random;
  attribute vec3 color;
  
  uniform mat4 modelMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform float uSpread;
  uniform float uBaseSize;
  uniform float uSizeRandomness;
  
  varying vec4 vRandom;
  varying vec3 vColor;
  
  void main() {
    vRandom = random;
    vColor = color;
    
    vec3 pos = position * uSpread;
    pos.z *= 10.0;
    
    vec4 mPos = modelMatrix * vec4(pos, 1.0);
    float t = uTime;
    mPos.x += sin(t * random.z + 6.28 * random.w) * mix(0.1, 1.5, random.x);
    mPos.y += sin(t * random.y + 6.28 * random.x) * mix(0.1, 1.5, random.w);
    mPos.z += sin(t * random.w + 6.28 * random.y) * mix(0.1, 1.5, random.z);
    
    vec4 mvPos = viewMatrix * mPos;

    if (uSizeRandomness == 0.0) {
      gl_PointSize = uBaseSize;
    } else {
      gl_PointSize = (uBaseSize * (1.0 + uSizeRandomness * (random.x - 0.5))) / length(mvPos.xyz);
    }

    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  
  uniform float uTime;
  uniform float uAlphaParticles;
  varying vec4 vRandom;
  varying vec3 vColor;
  
  void main() {
    vec2 uv = gl_PointCoord.xy;
    float d = length(uv - vec2(0.5));
    
    if(uAlphaParticles < 0.5) {
      if(d > 0.5) {
        discard;
      }
      gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), 1.0);
    } else {
      float circle = (1.0 - smoothstep(0.4, 0.5, d)) * 0.8;
      gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), circle);
    }
  }
`;


// WebGL can be unavailable or reclaimed on mobile. Keep a lightweight,
// theme-aware animation rather than leaving a blank canvas or throwing.
function createCanvasParticles(container) {
 const doc=container.ownerDocument, win=doc.defaultView, canvas=doc.createElement('canvas');
 canvas.className='home-particles-canvas';canvas.setAttribute('aria-hidden','true');
 let ctx;try{ctx=canvas.getContext('2d');}catch{/* Canvas may also be blocked. */}
 if(!ctx)return {destroy(){}};
 container.prepend(canvas);
 const points=Array.from({length:70},()=>({x:Math.random(),y:Math.random(),radius:.7+Math.random()*1.8,phase:Math.random()*Math.PI*2,speed:.5+Math.random()}));
 const motion=win.matchMedia('(prefers-reduced-motion: reduce)');
 let frame=null,destroyed=false,elapsed=0,last=null,width=0,height=0,scale=1,colors=[];
 function sync(){
  if(destroyed)return;
  if(doc.hidden||container.closest('[hidden]')){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;last=null;return;}
  const css=win.getComputedStyle(container);colors=['--foreground','--accent','--board-dark'].map(name=>css.getPropertyValue(name).trim()||'#888');
  const w=container.clientWidth,h=container.clientHeight,dpr=Math.min(win.devicePixelRatio||1,2);
  if(w&&h&&(w!==width||h!==height||dpr!==scale)){width=w;height=h;scale=dpr;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  if(frame===null)frame=win.requestAnimationFrame(draw);
 }
 function draw(t){
  frame=null;if(destroyed||doc.hidden||container.closest('[hidden]'))return;
  if(last!==null)elapsed+=Math.min(t-last,100);last=t;
  ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,width,height);
  points.forEach((p,i)=>{const time=elapsed*.0002*p.speed;ctx.globalAlpha=.18+.2*(.5+.5*Math.sin(time*2+p.phase));ctx.fillStyle=colors[i%colors.length];ctx.beginPath();ctx.arc(((p.x+time*.03)%1)*width,(p.y+.02*Math.sin(time+p.phase))*height,p.radius,0,Math.PI*2);ctx.fill();});
  ctx.globalAlpha=1;if(!motion.matches)frame=win.requestAnimationFrame(draw);
 }
 const observer=new win.MutationObserver(sync);observer.observe(doc.documentElement,{subtree:true,attributes:true,attributeFilter:['hidden','data-palette','data-palette-theme','data-theme']});
 const ro=win.ResizeObserver?new win.ResizeObserver(sync):null;ro?.observe(container);win.addEventListener('resize',sync);doc.addEventListener('visibilitychange',sync);motion.addEventListener?.('change',sync);sync();
 return {destroy(){destroyed=true;observer.disconnect();ro?.disconnect();win.removeEventListener('resize',sync);doc.removeEventListener('visibilitychange',sync);motion.removeEventListener?.('change',sync);if(frame!==null)win.cancelAnimationFrame(frame);canvas.remove();}};
}

export function createHomeParticles(container) {
 const doc=container.ownerDocument,win=doc.defaultView,canvas=doc.createElement('canvas');
 canvas.className='home-particles-canvas';canvas.setAttribute('aria-hidden','true');container.prepend(canvas);
 let renderer;
 try {renderer=new Renderer({canvas,dpr:Math.min(win.devicePixelRatio||1,2),depth:false,alpha:true});} catch {canvas.remove();return createCanvasParticles(container);}
 const gl=renderer.gl;gl.clearColor(0,0,0,0);
 const camera=new Camera(gl,{fov:15});camera.position.set(0,0,20);
 const count=200,positions=new Float32Array(count*3),randoms=new Float32Array(count*4),colors=new Float32Array(count*3),indices=[];
 for(let i=0;i<count;i++){
  let x,y,z,len,tries=0;do{x=Math.random()*2-1;y=Math.random()*2-1;z=Math.random()*2-1;len=x*x+y*y+z*z;}while((len>1||len===0)&&++tries<50);if(len>1||len===0){x=.1;y=.1;z=.1;}
  const r=Math.cbrt(Math.random());positions.set([x*r,y*r,z*r],i*3);randoms.set([Math.random(),Math.random(),Math.random(),Math.random()],i*4);indices.push(i%3);
 }
 let geometry,program,particles;
 try {
  geometry=new Geometry(gl,{position:{size:3,data:positions},random:{size:4,data:randoms},color:{size:3,data:colors}});
  program=new Program(gl,{vertex,fragment,uniforms:{uTime:{value:0},uSpread:{value:10},uBaseSize:{value:100*Math.min(win.devicePixelRatio||1,2)},uSizeRandomness:{value:1},uAlphaParticles:{value:1}},transparent:true,depthTest:false});
  if(!gl.getProgramParameter(program.program,gl.LINK_STATUS))throw new Error('Shader unavailable');
  particles=new Mesh(gl,{mode:gl.POINTS,geometry,program});
 } catch {try{geometry?.remove();program?.remove();}catch{/* Context is unavailable. */}canvas.remove();return createCanvasParticles(container);}
 let frame=null,last=null,elapsed=0,destroyed=false,width=0,height=0;
 const motion=win.matchMedia('(prefers-reduced-motion: reduce)');
 function resize(){const w=container.clientWidth,h=container.clientHeight;if(w&&h&&(w!==width||h!==height)){width=w;height=h;renderer.setSize(w,h);camera.perspective({aspect:w/h});}}
 function rgb(value){const match=value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);if(!match)return [0.5,0.5,0.5];let hex=match[1];if(hex.length===3)hex=[...hex].map(c=>c+c).join('');return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
 function theme(){const css=win.getComputedStyle(container),palette=['--foreground','--accent','--board-dark'].map(k=>rgb(css.getPropertyValue(k)));for(let i=0;i<count;i++)colors.set(palette[indices[i]],i*3);geometry.attributes.color.needsUpdate=true;}
 function render(t){frame=null;if(destroyed||container.closest('[hidden]')||doc.hidden)return;resize();if(last!==null)elapsed+=Math.min(t-last,100)*.1;last=t;program.uniforms.uTime.value=elapsed*.001;particles.rotation.x=Math.sin(elapsed*.0002)*.1;particles.rotation.y=Math.cos(elapsed*.0005)*.15;particles.rotation.z=elapsed*.00001;try{renderer.render({scene:particles,camera});}catch{contextLost({preventDefault(){}});return;}if(!motion.matches)frame=win.requestAnimationFrame(render);}
 function sync(){if(destroyed)return;const visible=!doc.hidden&&!container.closest('[hidden]');if(!visible){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;last=null;return;}theme();if(frame===null)frame=win.requestAnimationFrame(render);}
 const observer=new win.MutationObserver(sync);observer.observe(doc.documentElement,{subtree:true,attributes:true,attributeFilter:['hidden','data-palette','data-palette-theme','data-theme']});
 const ro=win.ResizeObserver?new win.ResizeObserver(sync):null;ro?.observe(container);win.addEventListener('resize',sync);doc.addEventListener('visibilitychange',sync);motion.addEventListener?.('change',sync);sync();
 let fallback=null;
 function disposeWebGL(){observer.disconnect();ro?.disconnect();win.removeEventListener('resize',sync);doc.removeEventListener('visibilitychange',sync);motion.removeEventListener?.('change',sync);canvas.removeEventListener('webglcontextlost',contextLost);if(frame!==null)win.cancelAnimationFrame(frame);frame=null;try{geometry.remove();program.remove();}catch{/* Lost contexts may reject cleanup. */}canvas.remove();}
 function contextLost(event){event.preventDefault();if(destroyed)return;disposeWebGL();fallback=createCanvasParticles(container);}
 canvas.addEventListener('webglcontextlost',contextLost);
 return {destroy(){if(destroyed)return;destroyed=true;if(fallback)fallback.destroy();else disposeWebGL();}};
}
