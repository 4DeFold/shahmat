// Live widgets for the bento grid and the numbers section.
import { Chess } from 'chess.js';

/* ---------- odometer counter (React Bits <Counter /> · Magic UI <NumberTicker />) ---------- */
export function buildOdometer(el) {
  const value = Number(el.dataset.count);
  const text = value >= 10000 ? value.toLocaleString('ru-RU').replace(/\s/g, ' ') : String(value);
  el.textContent = ''; el.setAttribute('aria-label', text.replace(' ', ' '));
  const cols = [];
  for (const ch of text) {
    if (!/\d/.test(ch)) { const s = document.createElement('span'); s.className = 'odo odo--sep'; el.append(s); continue; }
    const wrap = document.createElement('span'); wrap.className = 'odo'; wrap.setAttribute('aria-hidden', 'true');
    const col = document.createElement('span'); col.className = 'odo__col';
    for (let r = 0; r < 2; r++) for (let d = 0; d < 10; d++) { const s = document.createElement('span'); s.textContent = d; col.append(s); }
    wrap.append(col); el.append(wrap); cols.push({ col, digit: Number(ch) });
  }
  return cols;
}

/* ---------- commit chart ---------- */
export const COMMITS = [['13.11', 23], ['14.11', 11], ['15.11', 8], ['16.11', 30], ['17.11', 23], ['18.11', 12], ['19.11', 15], ['20.11', 14], ['21.11', 24], ['22.11', 3], ['23.11', 15], ['24.11', 7], ['25.11', 3], ['26.11', 14]];
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; };
export function buildChart(root, label) {
  const max = Math.max(...COMMITS.map(c => c[1]));
  const initial = label.textContent;
  for (const [day, n] of COMMITS) {
    const b = document.createElement('div'); b.className = 'bar'; b.dataset.day = day; b.style.setProperty('--h', (n / max).toFixed(3));
    b.innerHTML = '<i></i>'; b.title = `${day}: ${n}`;
    b.addEventListener('pointerenter', () => { label.textContent = `${day} · ${n} ${plural(n, 'коммит', 'коммита', 'коммитов')}`; });
    b.addEventListener('pointerleave', () => { label.textContent = initial; });
    root.append(b);
  }
  return [...root.querySelectorAll('.bar i')];
}

/* ---------- autoplaying board: Morphy's Opera Game ---------- */
const OPERA = 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(' ');
export function createBoard(root, tag, { reduced } = {}) {
  const files = 'abcdefgh';
  const pos = sq => ({ x: files.indexOf(sq[0]) * 100, y: (8 - Number(sq[1])) * 100 });
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const s = document.createElement('div'); s.className = 'sq ' + ((r + f) % 2 ? 'd' : 'l'); s.dataset.sq = files[f] + (8 - r);
    s.style.left = f * 12.5 + '%'; s.style.top = r * 12.5 + '%'; root.append(s);
  }
  let game, pieces, timer = 0, ply = 0, running = false;
  const place = (el, sq) => { const p = pos(sq); el.style.transform = `translate(${p.x}%, ${p.y}%)`; };
  function reset() {
    root.querySelectorAll('.pc').forEach(n => n.remove());
    root.querySelectorAll('.hl').forEach(n => n.classList.remove('hl'));
    game = new Chess(); pieces = new Map(); ply = 0;
    for (const row of game.board()) for (const c of row) if (c) {
      const el = document.createElement('div'); el.className = 'pc';
      el.innerHTML = `<img src="/pieces/cburnett/${c.color}${c.type.toUpperCase()}.svg" alt="" draggable="false">`;
      place(el, c.square); root.append(el); pieces.set(c.square, el);
    }
    tag.textContent = 'Старт';
  }
  function move() {
    if (ply >= OPERA.length) { tag.textContent = '1–0 · мат'; timer = setTimeout(() => { reset(); timer = setTimeout(move, 900); }, 3200); return; }
    const m = game.move(OPERA[ply]);
    root.querySelectorAll('.hl').forEach(n => n.classList.remove('hl'));
    root.querySelector(`[data-sq=${m.from}]`).classList.add('hl'); root.querySelector(`[data-sq=${m.to}]`).classList.add('hl');
    const victim = pieces.get(m.to);
    if (victim) { victim.classList.add('gone'); setTimeout(() => victim.remove(), 400); }
    const el = pieces.get(m.from); pieces.delete(m.from); pieces.set(m.to, el); place(el, m.to); el.style.zIndex = 2 + ply;
    if (m.flags.includes('k') || m.flags.includes('q')) {
      const rank = m.color === 'w' ? '1' : '8';
      const [rf, rt] = m.flags.includes('k') ? ['h' + rank, 'f' + rank] : ['a' + rank, 'd' + rank];
      const rook = pieces.get(rf); pieces.delete(rf); pieces.set(rt, rook); place(rook, rt);
    }
    const no = Math.floor(ply / 2) + 1;
    tag.textContent = ply % 2 === 0 ? `${no}. ${m.san}` : `${no}… ${m.san}`;
    ply++;
    timer = setTimeout(move, m.san.includes('+') || m.san.includes('#') ? 1500 : 1050);
  }
  reset();
  if (reduced) { // show the final position
    for (const s of OPERA) game.move(s);
    root.querySelectorAll('.pc').forEach(n => n.remove());
    for (const row of game.board()) for (const c of row) if (c) { const el = document.createElement('div'); el.className = 'pc'; el.innerHTML = `<img src="/pieces/cburnett/${c.color}${c.type.toUpperCase()}.svg" alt="">`; place(el, c.square); root.append(el); }
    tag.textContent = '17. Rd8#';
    return { start() {}, stop() {} };
  }
  return {
    start() { if (running) return; running = true; timer = setTimeout(move, 600); },
    stop() { running = false; clearTimeout(timer); },
  };
}

/* ---------- flickering grid (Magic UI <FlickeringGrid />) ---------- */
export function createFlicker(canvas, { reduced } = {}) {
  const g = canvas.getContext('2d');
  let w = 0, h = 0, cols = 0, rows = 0, cells = new Float32Array(0), raf = 0, running = false, last = 0;
  const size = 6, gap = 3, dpr = Math.min(devicePixelRatio, 2);
  function resize() {
    w = canvas.clientWidth; h = canvas.clientHeight; if (!w || !h) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    cols = Math.ceil(w / (size + gap)); rows = Math.ceil(h / (size + gap));
    cells = new Float32Array(cols * rows).map(() => Math.random() * 0.35);
    draw();
  }
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const v = cells[y * cols + x]; const fade = Math.min(1, (1 - y / rows) * 1.6);
      g.fillStyle = `rgba(0,0,0,${(v * fade).toFixed(3)})`; g.fillRect(x * (size + gap), y * (size + gap), size, size);
    }
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (t - last < 60) return; last = t;
    for (let i = 0; i < cells.length; i++) if (Math.random() < 0.06) cells[i] = Math.random() < 0.08 ? 0.9 : Math.random() * 0.35;
    draw();
  }
  new ResizeObserver(resize).observe(canvas); resize();
  return { start() { if (running || reduced) return; running = true; raf = requestAnimationFrame(frame); }, stop() { running = false; cancelAnimationFrame(raf); } };
}

/* ---------- piece-set marquee (Magic UI <Marquee />) ---------- */
const SETS = ['cburnett', 'celtic', 'chessnut', 'fantasy', 'firi', 'kiwen-suwi', 'merida', 'mono', 'rhosgfx', 'spatial'];
export function buildPieces(root) {
  const row = (piece, rev) => {
    const r = document.createElement('div'); r.className = 'marquee__row' + (rev ? ' marquee__row--rev' : '');
    const items = SETS.map(s => `<figure><img src="/pieces/${s}/${piece}.svg" alt="" loading="lazy"><figcaption>${s}</figcaption></figure>`).join('');
    r.innerHTML = items + items; return r;
  };
  root.append(row('wN', false), row('bK', true));
}

/* ---------- palettes ---------- */
export const PALETTES = [
  ['Монохром', '#ffffff', '#000000', '#ffffff', '#999999'], ['Графит', '#f8f9fa', '#212529', '#e9ecef', '#6c757d'],
  ['Лес', '#f8f6f0', '#26362e', '#eeeed2', '#769656'], ['Шахматный кабинет', '#f6f1e7', '#26343b', '#e9dcc7', '#6f858a'],
  ['Тёплое дерево', '#ede0d4', '#7f5539', '#e6ccb2', '#b08968'], ['Сосновый бор', '#dad7cd', '#344e41', '#a3b18a', '#588157'],
  ['Морская глубина', '#eff6e0', '#01161e', '#aec3b0', '#598392'], ['Янтарь', '#ffe6a7', '#432818', '#bb9457', '#99582a'],
  ['Лаванда', '#f2e9e4', '#22223b', '#c9ada7', '#9a8c98'], ['Песчаный', '#c2c5aa', '#333d29', '#a68a64', '#936639'],
];
export function createPalettes(cell, root, nameEl, { reduced } = {}) {
  const buttons = PALETTES.map(([name, bg, fg, light, dark], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pal'; b.setAttribute('aria-label', name); b.dataset.cursor = '';
    b.innerHTML = `<span><i style="background:${light}"></i><i style="background:${dark}"></i></span><span><i style="background:${dark}"></i><i style="background:${light}"></i></span>`;
    b.addEventListener('click', () => { pick(i); hold = true; });
    b.addEventListener('pointerenter', () => { pick(i); hold = true; });
    root.append(b); return b;
  });
  let current = 0, timer = 0, hold = false, running = false;
  function pick(i) {
    current = i; const [name, bg, fg] = PALETTES[i];
    buttons.forEach((b, j) => b.classList.toggle('is-on', j === i));
    cell.style.background = bg; cell.style.color = fg; cell.style.borderColor = fg; nameEl.textContent = name; nameEl.style.borderColor = fg;
  }
  cell.addEventListener('pointerleave', () => { hold = false; });
  function tick() { if (!hold) pick((current + 1) % PALETTES.length); timer = setTimeout(tick, 1500); }
  pick(0);
  return { start() { if (running || reduced) return; running = true; timer = setTimeout(tick, 900); }, stop() { running = false; clearTimeout(timer); } };
}

/* ---------- pixelated reveal (React Bits <PixelTransition /> idea) ---------- */
export function createPixelator(canvas, src) {
  const g = canvas.getContext('2d'); const img = new Image(); img.src = src;
  const small = document.createElement('canvas'), sg = small.getContext('2d');
  let ready = false, block = 64;
  img.decode().then(() => { ready = true; draw(block); }).catch(() => {});
  function draw(b) {
    block = b; if (!ready) return;
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w) return;
    canvas.width = w; canvas.height = h;
    if (b <= 1.05) { canvas.style.opacity = '0'; return; }
    canvas.style.opacity = '1';
    const sw = Math.max(1, Math.round(w / b)), sh = Math.max(1, Math.round(h / b));
    small.width = sw; small.height = sh; sg.imageSmoothingEnabled = true; sg.drawImage(img, 0, 0, sw, sh);
    g.imageSmoothingEnabled = false; g.drawImage(small, 0, 0, sw, sh, 0, 0, w, h);
  }
  return { draw };
}
