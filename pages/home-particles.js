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
      float circle = smoothstep(0.5, 0.4, d) * 0.8;
      gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), circle);
    }
  }
`;


export function createHomeParticles(container) {
 const doc=container.ownerDocument,win=doc.defaultView,canvas=doc.createElement('canvas');
 canvas.className='home-particles-canvas';canvas.setAttribute('aria-hidden','true');container.prepend(canvas);
 let renderer;
 try {renderer=new Renderer({canvas,dpr:Math.min(win.devicePixelRatio||1,2),depth:false,alpha:true});} catch {canvas.remove();return {destroy(){}};}
 const gl=renderer.gl;gl.clearColor(0,0,0,0);
 const camera=new Camera(gl,{fov:15});camera.position.set(0,0,20);
 const count=200,positions=new Float32Array(count*3),randoms=new Float32Array(count*4),colors=new Float32Array(count*3),indices=[];
 for(let i=0;i<count;i++){
  let x,y,z,len,tries=0;do{x=Math.random()*2-1;y=Math.random()*2-1;z=Math.random()*2-1;len=x*x+y*y+z*z;}while((len>1||len===0)&&++tries<50);if(len>1||len===0){x=.1;y=.1;z=.1;}
  const r=Math.cbrt(Math.random());positions.set([x*r,y*r,z*r],i*3);randoms.set([Math.random(),Math.random(),Math.random(),Math.random()],i*4);indices.push(i%3);
 }
 const geometry=new Geometry(gl,{position:{size:3,data:positions},random:{size:4,data:randoms},color:{size:3,data:colors}});
 const program=new Program(gl,{vertex,fragment,uniforms:{uTime:{value:0},uSpread:{value:10},uBaseSize:{value:100*Math.min(win.devicePixelRatio||1,2)},uSizeRandomness:{value:1},uAlphaParticles:{value:1}},transparent:true,depthTest:false});
 const particles=new Mesh(gl,{mode:gl.POINTS,geometry,program});
 let frame=null,last=null,elapsed=0,destroyed=false,width=0,height=0;
 const motion=win.matchMedia('(prefers-reduced-motion: reduce)');
 function resize(){const w=container.clientWidth,h=container.clientHeight;if(w&&h&&(w!==width||h!==height)){width=w;height=h;renderer.setSize(w,h);camera.perspective({aspect:w/h});}}
 function rgb(value){const match=value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);if(!match)return [0.5,0.5,0.5];let hex=match[1];if(hex.length===3)hex=[...hex].map(c=>c+c).join('');return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
 function theme(){const css=win.getComputedStyle(container),palette=['--foreground','--accent','--board-dark'].map(k=>rgb(css.getPropertyValue(k)));for(let i=0;i<count;i++)colors.set(palette[indices[i]],i*3);geometry.attributes.color.needsUpdate=true;}
 function render(t){frame=null;if(destroyed||container.closest('[hidden]')||doc.hidden)return;resize();if(last!==null)elapsed+=Math.min(t-last,100)*.1;last=t;program.uniforms.uTime.value=elapsed*.001;particles.rotation.x=Math.sin(elapsed*.0002)*.1;particles.rotation.y=Math.cos(elapsed*.0005)*.15;particles.rotation.z=elapsed*.00001;renderer.render({scene:particles,camera});if(!motion.matches)frame=win.requestAnimationFrame(render);}
 function sync(){if(destroyed)return;const visible=!doc.hidden&&!container.closest('[hidden]');if(!visible){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;last=null;return;}theme();if(frame===null)frame=win.requestAnimationFrame(render);}
 const observer=new win.MutationObserver(sync);observer.observe(doc.documentElement,{subtree:true,attributes:true,attributeFilter:['hidden','data-palette','data-palette-theme','data-theme']});
 const ro=win.ResizeObserver?new win.ResizeObserver(sync):null;ro?.observe(container);win.addEventListener('resize',sync);doc.addEventListener('visibilitychange',sync);motion.addEventListener?.('change',sync);sync();
 return {destroy(){destroyed=true;observer.disconnect();ro?.disconnect();win.removeEventListener('resize',sync);doc.removeEventListener('visibilitychange',sync);motion.removeEventListener?.('change',sync);if(frame!==null)win.cancelAnimationFrame(frame);geometry.remove();program.remove();canvas.remove();}};
}
