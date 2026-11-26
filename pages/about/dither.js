// Dither — ordered (Bayer 8×8) dithering over flowing noise, after React Bits'
// <Dither /> background and the dithering shaders on shaders.com. Strictly two
// tones: ink on paper. The pointer bends the waves around it.
import { Renderer, Program, Mesh, Triangle } from 'ogl';

const fragment = /* glsl */`
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uPixel; uniform float uIntro; uniform float uFade;
uniform vec3 uInk; uniform vec3 uPaper; uniform float uNarrow;
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(.5, a.y*.75))); }
float bayer4(vec2 a){ return bayer2(.5*a)*.25 + bayer2(a); }
float bayer(vec2 a){ return bayer4(.5*a)*.25 + bayer2(a); }
vec2 hash(vec2 p){ p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))); return -1. + 2.*fract(sin(p)*43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f*f*(3.-2.*f);
  return mix(mix(dot(hash(i), f), dot(hash(i+vec2(1,0)), f-vec2(1,0)), u.x),
             mix(dot(hash(i+vec2(0,1)), f-vec2(0,1)), dot(hash(i+vec2(1,1)), f-vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a*noise(p); p = p*2.03 + 7.1; a *= .5; } return s; }
void main(){
  vec2 px = floor(gl_FragCoord.xy / uPixel) * uPixel;
  vec2 uv = px / uRes;
  vec2 p = (px - .5*uRes) / uRes.y;
  vec2 m = (uMouse - .5*uRes) / uRes.y;
  float t = uTime * .06;
  // domain-warped flow
  vec2 q = vec2(fbm(p*1.6 + t), fbm(p*1.6 - t + 3.7));
  float d = length(p - m);
  p += (p - m) * .35 * exp(-d*d*9.);
  float n = fbm(p*1.9 + q*1.4 + vec2(t*2., -t));
  float v = .5 + .9*n;
  // waves gather towards the lower right, leaving the copy area clean
  float wide = smoothstep(.42, 1.05, uv.x + (1.-uv.y)*.25);
  float narrow = smoothstep(.5, .78, uv.y) * (1. - smoothstep(.86, .93, uv.y));
  float mask = mix(wide, narrow, uNarrow);
  v = v * mask * uIntro * uFade;
  v -= .3;
  float ink = step(bayer(gl_FragCoord.xy / uPixel), v);
  gl_FragColor = vec4(mix(uPaper, uInk, ink), 1.);
}`;
const vertex = /* glsl */`attribute vec2 position; void main(){ gl_Position = vec4(position, 0., 1.); }`;

export function createDither(canvas, { reduced = false } = {}) {
  const renderer = new Renderer({ canvas, dpr: 1, alpha: false, antialias: false });
  const gl = renderer.gl;
  const uniforms = {
    uRes: { value: [1, 1] }, uTime: { value: 0 }, uMouse: { value: [-9999, -9999] }, uPixel: { value: 3 },
    uIntro: { value: reduced ? 1 : 0 }, uFade: { value: 1 },
    uInk: { value: [0, 0, 0] }, uNarrow: { value: 0 }, uPaper: { value: [1, 1, 1] },
  };
  const program = new Program(gl, { vertex, fragment, uniforms });
  const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
  const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
  let px = 3;
  function resize() {
    const host = canvas.parentElement; const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    // one fragment per dither dot: render small, upscale with crisp pixels
    px = w < 700 ? 2 : 3;
    renderer.setSize(Math.ceil(w / px), Math.ceil(h / px));
    canvas.style.width = '100%'; canvas.style.height = '100%';
    uniforms.uRes.value = [gl.canvas.width, gl.canvas.height];
    uniforms.uPixel.value = 1; uniforms.uNarrow.value = w < 820 ? 1 : 0;
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement); resize();
  function onMove(e) { const r = canvas.getBoundingClientRect(); mouse.tx = (e.clientX - r.left) / px; mouse.ty = (r.height - (e.clientY - r.top)) / px; if (mouse.x < -999) { mouse.x = mouse.tx; mouse.y = mouse.ty; } }
  window.addEventListener('pointermove', onMove, { passive: true });
  let raf = 0, running = false, t0 = performance.now();
  function render(now) {
    mouse.x += (mouse.tx - mouse.x) * 0.08; mouse.y += (mouse.ty - mouse.y) * 0.08;
    uniforms.uMouse.value = [mouse.x, mouse.y];
    uniforms.uTime.value = reduced ? 12 : (now - t0) / 1000 + 12;
    renderer.render({ scene: mesh });
  }
  function frame(now) { raf = requestAnimationFrame(frame); render(now); }
  render(performance.now());
  return {
    uniforms,
    start() { if (running || reduced) return; running = true; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    render() { render(performance.now()); },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('pointermove', onMove); },
  };
}
