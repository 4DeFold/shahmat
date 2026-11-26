// Lanyard — a vanilla three.js port of the idea behind React Bits' <Lanyard />
// (reactbits.dev/components/lanyard): a strap hanging from the top edge holds
// a badge that can be grabbed, thrown and left to swing. React Bits builds it on
// rapier joints; here a small verlet rope + a two-point rigid card does the
// same job without a physics engine.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Vector3, Vector2, Quaternion, Matrix4,
  Shape, ShapeGeometry, ExtrudeGeometry, BufferGeometry, BufferAttribute, Mesh, Group,
  MeshBasicMaterial, MeshStandardMaterial, ShaderMaterial, CanvasTexture, CatmullRomCurve3,
  RepeatWrapping, DoubleSide, Raycaster, Plane, TorusGeometry, BoxGeometry, PMREMGenerator,
  SRGBColorSpace, NoColorSpace, LinearMipmapLinearFilter,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const CARD_W = 2.3, CARD_H = 3.25, CARD_D = 0.026, RADIUS = 0.14;
const SEGMENTS = 14;

function roundedRect(w, h, r) {
  const s = new Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  // the punched slot the clip goes through
  const hole = new Shape(), hw = 0.34, hh = 0.075, hy = h / 2 - 0.2;
  hole.moveTo(-hw + hh, hy - hh); hole.lineTo(hw - hh, hy - hh); hole.quadraticCurveTo(hw, hy - hh, hw, hy);
  hole.quadraticCurveTo(hw, hy + hh, hw - hh, hy + hh); hole.lineTo(-hw + hh, hy + hh);
  hole.quadraticCurveTo(-hw, hy + hh, -hw, hy); hole.quadraticCurveTo(-hw, hy - hh, -hw + hh, hy - hh);
  s.holes.push(hole);
  return s;
}

const faceShader = {
  vertexShader: /* glsl */`
    varying vec2 vUv; varying vec3 vN; varying vec3 vP;
    void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
      vec4 w = modelMatrix * vec4(position,1.); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`
    uniform sampler2D map; uniform vec3 camPos; uniform float time;
    varying vec2 vUv; varying vec3 vN; varying vec3 vP;
    void main(){
      vec3 base = texture2D(map, vUv).rgb;
      vec3 N = normalize(vN); vec3 V = normalize(camPos - vP);
      if (!gl_FrontFacing) N = -N;
      vec3 L = normalize(vec3(-.4,.8,.9));
      float diff = max(dot(N,L),0.);
      vec3 R = reflect(-V,N);
      float spec = pow(max(dot(R, normalize(vec3(.5,.6,1.))),0.), 60.) * .55;
      // a soft lacquer band that slides across as the card turns
      float band = smoothstep(.0,.35,1.-abs(dot(R, normalize(vec3(-.8,.2,.6)))*1.6 - .8)) * .07;
      float fres = pow(1.-max(dot(N,V),0.), 4.) * .25;
      vec3 col = base * (.86 + .14*diff) + spec + band + fres;
      gl_FragColor = vec4(col, 1.);
    }`,
};

async function fonts() {
  try {
    await Promise.all([
      document.fonts.load('400 100px "Playfair Display"', 'DeFold Разработчик'),
      document.fonts.load('400 40px "Charis SIL"', 'Разработчик'),
      document.fonts.load('500 30px "Geist"', '0123 ABC'),
    ]);
  } catch {}
}

function loadImage(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.decoding = 'async'; i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
}

function drawFront(img) {
  const W = 1024, H = Math.round(W * CARD_H / CARD_W), c = document.createElement('canvas');
  c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const m = 64;
  // header: logo + id
  g.textBaseline = 'alphabetic';
  g.font = '400 54px "Playfair Display"';
  const shahW = g.measureText('shah').width;
  g.fillStyle = '#000'; g.fillRect(m, 128, shahW + 12, 68);
  g.fillStyle = '#fff'; g.fillText('shah', m + 6, 178);
  g.fillStyle = '#000'; g.fillText('mat.xyz', m + shahW + 14, 178);
  g.font = '500 26px "Geist"'; g.textAlign = 'right';
  g.fillText('№ 001', W - m, 152); g.fillStyle = '#777'; g.fillText('DEVELOPER', W - m, 186);
  g.textAlign = 'left';
  // avatar
  const ay = 236, as = W - m * 2;
  g.drawImage(img, m, ay, as, as);
  // name
  g.fillStyle = '#000'; g.font = '400 118px "Playfair Display"';
  g.fillText('DeFold', m - 4, ay + as + 136);
  g.font = '400 38px "Charis SIL"'; g.fillStyle = '#555';
  g.fillText('Дизайн и разработка', m, ay + as + 196);
  // footer rule + meta
  const fy = H - 120;
  g.fillStyle = '#000'; g.fillRect(m, fy, W - m * 2, 2);
  g.font = '500 26px "Geist"'; g.fillText('@4DeFold', m, fy + 58);
  g.textAlign = 'right'; g.fillText('2026', W - m, fy + 58); g.textAlign = 'left';
  // barcode
  let x = m + 230; const seed = [3,1,2,1,4,1,1,2,3,1,2,2,1,3,1,1,2,4,1,2,1,1,3,2,1,2,1,3,1,1,2,1];
  for (let i = 0; x < W - m - 120; i++) { const w = seed[i % seed.length] * 3.2; if (i % 2 === 0) g.fillRect(x, fy + 30, w, 36); x += w + 3; }
  const t = new CanvasTexture(c); t.colorSpace = NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = LinearMipmapLinearFilter;
  return t;
}

function drawBack() {
  const W = 1024, H = Math.round(W * CARD_H / CARD_W), c = document.createElement('canvas');
  c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  // fine chess grid
  const cell = 64;
  for (let y = 0; y < H; y += cell) for (let x = 0; x < W; x += cell) if (((x + y) / cell) % 2 === 0) { g.fillStyle = '#0d0d0d'; g.fillRect(x, y, cell, cell); }
  g.font = '400 132px "Playfair Display"'; g.textBaseline = 'alphabetic';
  const s = g.measureText('shah').width, t = g.measureText('mat').width, total = s + t + 16, x0 = (W - total) / 2, y0 = H / 2 + 40;
  g.fillStyle = '#fff'; g.fillRect(x0, y0 - 112, s + 16, 150);
  g.fillStyle = '#000'; g.fillText('shah', x0 + 8, y0);
  g.fillStyle = '#fff'; g.fillText('mat', x0 + s + 16, y0);
  g.font = '500 26px "Geist"'; g.textAlign = 'center'; g.fillStyle = '#888';
  g.fillText('SHAHMATT.VERCEL.APP', W / 2, H - 96);
  const tex = new CanvasTexture(c); tex.colorSpace = NoColorSpace; tex.anisotropy = 8;
  return tex;
}

function drawStrap() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, 128, 1024);
  g.fillStyle = '#2a2a2a'; g.fillRect(6, 0, 2, 1024); g.fillRect(120, 0, 2, 1024);
  g.save(); g.translate(64, 0); g.rotate(Math.PI / 2);
  g.font = '400 64px "Playfair Display"'; g.textBaseline = 'middle';
  for (let y = 40; y < 1024; y += 512) {
    const sw = g.measureText('shah').width;
    g.fillStyle = '#fff'; g.fillRect(y - 6, -34, sw + 12, 66);
    g.fillStyle = '#000'; g.fillText('shah', y, 2);
    g.fillStyle = '#fff'; g.fillText('mat.xyz', y + sw + 10, 2);
    g.font = '500 30px "Geist"'; g.fillStyle = '#777'; g.fillText('DEFOLD', y + sw + 230, 2); g.font = '400 64px "Playfair Display"';
  }
  g.restore();
  const t = new CanvasTexture(c); t.colorSpace = NoColorSpace; t.wrapT = RepeatWrapping; t.wrapS = RepeatWrapping; t.anisotropy = 8; t.flipY = false;
  return t;
}

export async function createLanyard(canvas, { avatar, reduced = false, onGrab } = {}) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  const camera = new PerspectiveCamera(20, 1, 0.1, 100); camera.position.set(0, 0, 30);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  await fonts();
  const img = await loadImage(avatar);
  const front = drawFront(img), back = drawBack(), strapTex = drawStrap();

  // ---------- card ----------
  const shape = roundedRect(CARD_W, CARD_H, RADIUS);
  const mk = (map) => new ShaderMaterial({ uniforms: { map: { value: map }, camPos: { value: camera.position }, time: { value: 0 } }, ...faceShader });
  const frontGeo = new ShapeGeometry(shape, 12);
  const remap = (geo, mirror) => { const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); uv.setXY(i, mirror ? (CARD_W / 2 - x) / CARD_W : (x + CARD_W / 2) / CARD_W, (y + CARD_H / 2) / CARD_H); } uv.needsUpdate = true; };
  remap(frontGeo, false); frontGeo.translate(0, 0, CARD_D / 2 + 0.0015);
  const backGeo = new ShapeGeometry(shape, 12); backGeo.rotateY(Math.PI); remap(backGeo, true); backGeo.translate(0, 0, -CARD_D / 2 - 0.0015);
  const sideGeo = new ExtrudeGeometry(shape, { depth: CARD_D, bevelEnabled: false, curveSegments: 12 }); sideGeo.translate(0, 0, -CARD_D / 2);
  const card = new Group();
  const frontMesh = new Mesh(frontGeo, mk(front)), backMesh = new Mesh(backGeo, mk(back));
  const sideMesh = new Mesh(sideGeo, [new MeshBasicMaterial({ visible: false }), new MeshBasicMaterial({ color: 0xc8c8c8 })]);
  card.add(frontMesh, backMesh, sideMesh);
  // clip: ring through the slot + a clamp
  const metal = new MeshStandardMaterial({ color: 0x9a9a9a, metalness: 1, roughness: 0.28 });
  const ring = new Mesh(new TorusGeometry(0.17, 0.028, 16, 48), metal);
  ring.position.set(0, CARD_H / 2 - 0.2 + 0.17, 0); ring.rotation.y = Math.PI / 2;
  card.add(ring);
  const clamp = new Mesh(new BoxGeometry(0.34, 0.26, 0.09), new MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.35 }));
  scene.add(card, clamp);

  // ---------- strap ribbon ----------
  const N = 72, ribbonGeo = new BufferGeometry();
  const rPos = new Float32Array(N * 2 * 3), rUv = new Float32Array(N * 2 * 2), idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  ribbonGeo.setIndex(idx);
  ribbonGeo.setAttribute('position', new BufferAttribute(rPos, 3));
  ribbonGeo.setAttribute('uv', new BufferAttribute(rUv, 2));
  const ribbon = new Mesh(ribbonGeo, new MeshBasicMaterial({ map: strapTex, side: DoubleSide }));
  ribbon.frustumCulled = false;
  scene.add(ribbon);

  // ---------- physics ----------
  const anchor = new Vector3();
  let segLen = 0.34;
  const P = [], Q = []; // positions, previous positions (rope + card top + card bottom)
  for (let i = 0; i < SEGMENTS + 2; i++) { P.push(new Vector3()); Q.push(new Vector3()); }
  const TOP = SEGMENTS, BOT = SEGMENTS + 1;
  const clipLen = 0.6; // rope end -> card slot (ring 0.34 + clamp 0.26)
  let twist = 0, twistV = 0;
  let visH = 1, visW = 1, layout = 'wide';
  const grab = { on: false, t: 0.5, target: new Vector3(), off: new Vector3(), plane: new Plane(new Vector3(0, 0, 1), 0) };

  function placeAt(startOffsetX = 0, lift = 0) {
    for (let i = 0; i <= SEGMENTS; i++) {
      P[i].set(anchor.x + startOffsetX * (i / SEGMENTS) ** 1.2, anchor.y - i * segLen + lift * (i / SEGMENTS), 0);
      Q[i].copy(P[i]);
    }
    P[TOP].copy(P[SEGMENTS - 1]).add(new Vector3(startOffsetX * 0.05, -clipLen, 0)); Q[TOP].copy(P[TOP]);
    P[BOT].copy(P[TOP]).add(new Vector3(0, -CARD_H + 0.2, 0)); Q[BOT].copy(P[BOT]);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360); visW = visH * camera.aspect;
    layout = w < 820 ? 'narrow' : 'wide';
    const scale = layout === 'narrow' ? Math.min(1, visW / 4.2) : Math.min(1.3, visH / 8.4);
    card.scale.setScalar(scale); clamp.scale.setScalar(scale);
    const prev = anchor.clone();
    anchor.set(layout === 'narrow' ? 0 : visW * 0.24, visH / 2 + 0.3, 0);
    // rope length: card top lands around 38% from the top (narrow: 30%)
    const cardTopY = layout === 'narrow' ? visH / 2 - visH * 0.17 : visH / 2 - visH * 0.33;
    segLen = Math.max(0.12, (anchor.y - cardTopY - clipLen * scale) / SEGMENTS);
    if (prev.lengthSq() === 0) placeAt(reduced ? 0 : 3.2, reduced ? 0 : 1.6);
    else { const d = anchor.clone().sub(prev); for (let i = 0; i < P.length; i++) { P[i].add(d); Q[i].add(d); } }
  }

  const tmp = new Vector3(), tmp2 = new Vector3();
  function satisfy(a, b, len, wa, wb) {
    tmp.subVectors(P[b], P[a]); const d = tmp.length() || 1e-6; const diff = (d - len) / d;
    const s = wa + wb; if (!s) return;
    P[a].addScaledVector(tmp, (wa / s) * diff); P[b].addScaledVector(tmp, (-wb / s) * diff);
  }
  let t0 = performance.now() / 1000, acc = 0, time = 0, lastX = 0;
  function step(dt) {
    time += dt;
    const s = card.scale.x, cardLen = (CARD_H - 0.2) * s;
    const wind = reduced ? 0 : Math.sin(time * 0.7) * 0.6 + Math.sin(time * 1.9) * 0.25;
    for (let i = 1; i < P.length; i++) {
      tmp.subVectors(P[i], Q[i]).multiplyScalar(0.985);
      Q[i].copy(P[i]);
      P[i].add(tmp);
      P[i].y -= 9.8 * dt * dt * (i >= TOP ? 1.4 : 1);
      P[i].x += wind * 0.02 * dt * dt * (i / P.length);
      P[i].z *= 0.995; // keep the strap near its plane
    }
    for (let k = 0; k < 24; k++) {
      P[0].copy(anchor);
      for (let i = 0; i < SEGMENTS; i++) satisfy(i, i + 1, segLen, i === 0 ? 0 : 1, 1);
      satisfy(SEGMENTS, TOP, clipLen * s, 1, 1.5);
      satisfy(TOP, BOT, cardLen, 1, 1);
      if (grab.on) {
        tmp2.lerpVectors(P[TOP], P[BOT], grab.t);
        tmp.subVectors(grab.target, tmp2);
        P[TOP].add(tmp); P[BOT].add(tmp);
      }
      // the rope cannot pass above its anchor
      for (let i = 1; i < P.length; i++) if (P[i].y > anchor.y) P[i].y = anchor.y;
    }
    // twist around the card's long axis: driven by sideways motion
    const cx = (P[TOP].x + P[BOT].x) / 2, vx = (cx - lastX) / dt; lastX = cx;
    twistV += (-twist * 9 - twistV * 1.6 + vx * 1.5 + wind * 0.15) * dt;
    twist += twistV * dt;
  }

  const up = new Vector3(), fwd = new Vector3(), right = new Vector3(), m4 = new Matrix4(), q = new Quaternion(), qt = new Quaternion();
  const curve = new CatmullRomCurve3([], false, 'centripetal');
  const pts = []; const cp = new Vector3(), tg = new Vector3(), side = new Vector3(), view = new Vector3();
  function sync() {
    const s = card.scale.x;
    up.subVectors(P[TOP], P[BOT]).normalize();
    fwd.set(0, 0, 1).addScaledVector(up, -up.z).normalize();
    right.crossVectors(up, fwd).normalize(); fwd.crossVectors(right, up);
    m4.makeBasis(right, up, fwd); q.setFromRotationMatrix(m4);
    qt.setFromAxisAngle(up, twist); q.premultiply(qt);
    card.quaternion.copy(q);
    // card origin = centre; P[TOP] is the slot (0.2 below the top edge)
    card.position.copy(P[TOP]).addScaledVector(up, -(CARD_H / 2 - 0.2) * s);
    // ring position in world (the strap ends at its top)
    const ringTop = new Vector3(0, CARD_H / 2 - 0.2 + 0.34, 0).multiplyScalar(s).applyQuaternion(q).add(card.position);
    const dir = tmp.subVectors(P[SEGMENTS - 1], ringTop).normalize();
    clamp.position.copy(ringTop).addScaledVector(dir, 0.13 * s);
    clamp.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    const clampTop = tmp2.copy(ringTop).addScaledVector(dir, 0.24 * s);
    // strap
    pts.length = 0;
    for (let i = 0; i < SEGMENTS; i++) pts.push(P[i]);
    pts.push(clampTop.clone());
    curve.points = pts;
    const halfW = 0.15 * s; let vacc = 0, prev = null;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      curve.getPoint(t, cp); curve.getTangent(t, tg);
      view.subVectors(camera.position, cp).normalize();
      side.crossVectors(tg, view).normalize();
      // the strap narrows into the clamp
      const w = halfW;
      rPos.set([cp.x + side.x * w, cp.y + side.y * w, cp.z + side.z * w, cp.x - side.x * w, cp.y - side.y * w, cp.z - side.z * w], i * 6);
      if (prev) vacc += cp.distanceTo(prev); prev = (prev || new Vector3()).copy(cp);
      const v = vacc / (halfW * 2 * 8);
      rUv.set([0, v, 1, v], i * 4);
    }
    ribbonGeo.attributes.position.needsUpdate = true; ribbonGeo.attributes.uv.needsUpdate = true;
    ribbonGeo.computeBoundingSphere();
  }

  // ---------- pointer ----------
  const ray = new Raycaster(), ndc = new Vector2(), hit = new Vector3();
  const pickables = [frontMesh, backMesh, sideMesh];
  function toNdc(e) { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); return r; }
  function pick(e) {
    const r = toNdc(e);
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
    ray.setFromCamera(ndc, camera); return ray.intersectObjects(pickables, false)[0] || null;
  }
  function onDown(e) {
    if (e.button > 0) return;
    const h = pick(e); if (!h) return;
    e.preventDefault();
    grab.on = true;
    const a = P[TOP], b = P[BOT], ab = tmp.subVectors(b, a); const t = Math.min(1, Math.max(0, tmp2.subVectors(h.point, a).dot(ab) / ab.lengthSq()));
    grab.t = t; grab.plane.set(new Vector3(0, 0, 1), -h.point.z);
    grab.target.lerpVectors(a, b, t);
    canvas.ownerDocument.documentElement.classList.add('is-grabbing');
    onGrab?.(true);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  }
  function onMove(e) {
    if (!grab.on) return;
    e.preventDefault();
    toNdc(e); ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(grab.plane, hit)) {
      // keep the card reachable: clamp to strap length
      const max = SEGMENTS * segLen + clipLen * card.scale.x + 0.3;
      tmp.subVectors(hit, anchor); if (tmp.length() > max + grab.t * CARD_H * card.scale.x) tmp.setLength(max + grab.t * CARD_H * card.scale.x);
      grab.target.copy(anchor).add(tmp);
    }
  }
  function onUp() {
    grab.on = false;
    canvas.ownerDocument.documentElement.classList.remove('is-grabbing');
    onGrab?.(false);
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
  }
  function onHover(e) {
    if (grab.on || e.pointerType !== 'mouse') return;
    canvas.ownerDocument.documentElement.classList.toggle('can-grab', !!pick(e));
  }
  // touch: keep the page from scrolling while the badge is held
  function onTouch(e) { const t = e.touches[0]; if (t && pick(t)) e.preventDefault(); }
  window.addEventListener('touchstart', onTouch, { passive: false });
  window.addEventListener('pointerdown', onDown, { passive: false });
  window.addEventListener('pointermove', onHover, { passive: true });

  // ---------- loop ----------
  let running = false, raf = 0;
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now() / 1000; let dt = Math.min(0.05, now - t0); t0 = now;
    acc += dt; const h = 1 / 120;
    while (acc >= h) { step(h); acc -= h; }
    sync();
    renderer.render(scene, camera);
  }
  function start() { if (running) return; running = true; t0 = performance.now() / 1000; acc = 0; frame(); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  // settle a little before the first paint
  for (let i = 0; i < (reduced ? 900 : 10); i++) step(1 / 120);
  sync(); renderer.render(scene, camera);

  return {
    start, stop,
    kick(x = 3) { for (let i = 1; i < P.length; i++) Q[i].x -= x * 0.01 * (i / P.length); },
    dispose() { stop(); ro.disconnect(); window.removeEventListener('pointerdown', onDown); window.removeEventListener('touchstart', onTouch); window.removeEventListener('pointermove', onHover); renderer.dispose(); },
  };
}
