import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { createDither } from './dither.js';
import { buildOdometer, buildChart, createBoard, createFlicker, buildPieces, createPalettes, createPixelator } from './widgets.js';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const EASE = 'expo.out';
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

/* ---------- smooth scroll ---------- */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, anchors: { offset: 0 }, autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
$('[data-top]')?.addEventListener('click', e => { e.preventDefault(); lenis ? lenis.scrollTo(0, { duration: 1.6 }) : scrollTo({ top: 0 }); });

/* ---------- hero: dither + lanyard ---------- */
const dither = createDither($('[data-dither]'), { reduced });
let lanyard = null;
let heroActive = true;
const lanyardReady = import('./lanyard.js')
  .then(m => m.createLanyard($('[data-lanyard]'), { avatar: '/folio/defold.webp', reduced, onGrab: on => { if (on) $('[data-hint]').classList.add('is-gone'); } }))
  .then(l => { lanyard = l; if (heroActive && !root.classList.contains('is-loading')) l.start(); return l; })
  .catch(err => { console.warn('lanyard', err); });

/* ---------- loader ---------- */
async function boot() {
  const count = $('[data-loader-count]');
  const fontsReady = document.fonts.ready;
  const minTime = new Promise(r => setTimeout(r, reduced ? 0 : 1100));
  const c = { v: 0 };
  const tick = gsap.to(c, { v: 100, duration: reduced ? 0 : 1.3, ease: 'power2.inOut', onUpdate: () => { count.textContent = String(Math.round(c.v)).padStart(3, '0'); } });
  await Promise.race([Promise.all([fontsReady, minTime, lanyardReady]), new Promise(r => setTimeout(r, 4000))]);
  await tick.then?.();
  if (reduced) { root.classList.remove('is-loading'); intro(); return; }
  const tl = gsap.timeline({ onComplete: () => root.classList.remove('is-loading') });
  tl.to('.loader__mark > *', { yPercent: -110, duration: .6, ease: 'power3.in', stagger: .05 })
    .to('.loader__count', { opacity: 0, duration: .3 }, '<')
    .to('.loader', { clipPath: 'inset(0 0 100% 0)', duration: .9, ease: 'expo.inOut' }, '-=.15')
    .add(intro, '-=.55');
}

function intro() {
  lenis?.start();
  setup();
  const tl = gsap.timeline({ defaults: { ease: EASE } });
  const chars = $$('.wordmark .ch');
  if (reduced) { gsap.set([chars, '[data-hero-in]', '[data-blk]', '[data-hero-meta] > div', '.nav'], { clearProps: 'all' }); dither.uniforms.uIntro.value = 1; lanyard?.start(); return; }
  tl.fromTo('[data-blk]', { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 1.1, ease: 'expo.inOut' })
    .fromTo(chars, { yPercent: 115, rotate: 6 }, { yPercent: 0, rotate: 0, duration: 1.2, stagger: .035 }, '-=.55')
    .fromTo('[data-hero-in]', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: .08 }, '-=1')
    .fromTo('[data-hero-meta] > div', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: .9, stagger: .06 }, '-=.9')
    .fromTo('[data-hero-meta]', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1.2, ease: 'expo.inOut' }, '<')
    .fromTo('.nav', { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: .9 }, '<')
    .to(dither.uniforms.uIntro, { value: 1, duration: 2.4, ease: 'power2.out' }, 0)
    .fromTo('[data-hint]', { opacity: 0 }, { opacity: 1, duration: .8 }, 1.6);
  dither.start();
  lanyard?.start();
}

/* ---------- everything scroll-driven ---------- */
function setup() {
  heroScroll(); nav(); manifest(); headings(); numbers(); product(); bento(); velocity(); author(); footer();
  if (fine && !reduced) { cursor(); magnets(); }
  spotlights();
  ScrollTrigger.refresh();
}

function heroScroll() {
  const hero = $('.hero');
  ScrollTrigger.create({ trigger: hero, start: 'top top', end: 'bottom top', onToggle: s => { heroActive = s.isActive; if (s.isActive) { dither.start(); lanyard?.start(); } else { dither.stop(); lanyard?.stop(); } } });
  if (reduced) return;
  gsap.to('.hero__copy', { yPercent: -30, opacity: 0, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom 30%', scrub: true } });
  gsap.to(dither.uniforms.uFade, { value: 0, ease: 'none', scrollTrigger: { trigger: hero, start: '20% top', end: 'bottom top', scrub: true } });
}

function nav() {
  const navEl = $('[data-nav]');
  ScrollTrigger.create({ start: 40, end: 'max', onToggle: s => navEl.classList.toggle('is-scrolled', s.isActive) });
  gsap.to('[data-progress]', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .3 } });
  for (const a of $$('.nav__links a')) {
    const target = $(a.getAttribute('href'));
    if (target) ScrollTrigger.create({ trigger: target, start: 'top 50%', end: 'bottom 50%', onToggle: s => a.classList.toggle('is-active', s.isActive) });
  }
}

function manifest() {
  const el = $('[data-reveal-words]');
  const split = new SplitText(el, { type: 'words', wordsClass: 'w' });
  if (reduced) return;
  gsap.to(split.words, { opacity: 1, filter: 'blur(0px)', ease: 'none', stagger: .5, scrollTrigger: { trigger: '.manifest', start: 'top top', end: 'bottom bottom', scrub: .6 } });
  gsap.fromTo('.manifest .eyebrow', { opacity: 0, x: -20 }, { opacity: 1, x: 0, scrollTrigger: { trigger: '.manifest', start: 'top 60%', toggleActions: 'play none none reverse' } });
}

function headings() {
  for (const el of $$('[data-split]')) {
    const split = new SplitText(el, { type: 'lines,words', linesClass: 'split-line', mask: 'lines' });
    if (reduced) continue;
    gsap.from(split.words, { yPercent: 110, duration: 1.2, ease: EASE, stagger: .06, scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' } });
  }
  if (reduced) return;
  for (const el of $$('.section-head .eyebrow')) gsap.from(el, { opacity: 0, x: -16, duration: .9, ease: EASE, scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' } });
}

function numbers() {
  for (const el of $$('[data-count]')) {
    const cols = buildOdometer(el);
    if (reduced) { cols.forEach(({ col, digit }) => gsap.set(col, { yPercent: -(10 + digit) * 5 })); continue; }
    gsap.set(cols.map(c => c.col), { yPercent: 0 });
    ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => {
      cols.forEach(({ col, digit }, i) => gsap.to(col, { yPercent: -(10 + digit) * 5, duration: 2 + (cols.length - i) * 0.18, ease: 'expo.out', delay: i * .04 }));
    } });
  }
  const grid = $('[data-grid]');
  if (!reduced) {
    gsap.fromTo(grid, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1.6, ease: 'expo.inOut', scrollTrigger: { trigger: grid, start: 'top 85%' } });
    gsap.from($$('.stat p', grid), { y: 12, opacity: 0, stagger: .08, duration: .8, ease: EASE, scrollTrigger: { trigger: grid, start: 'top 80%' } });
  }
  const bars = buildChart($('[data-bars]'), $('[data-chart-value]'));
  if (reduced) gsap.set(bars, { scaleY: 1 });
  else gsap.to(bars, { scaleY: 1, ease: 'power2.out', stagger: .06, scrollTrigger: { trigger: '[data-chart]', start: 'top 85%', end: 'bottom 55%', scrub: .6 } });
}

function product() {
  const stage = $('[data-device-stage]');
  if (!reduced) {
    gsap.fromTo('[data-device]', { rotateX: 38, scale: .82, y: 40 }, { rotateX: 0, scale: 1, y: 0, ease: 'none', scrollTrigger: { trigger: stage, start: 'top 95%', end: 'top 10%', scrub: true } });
    gsap.fromTo('[data-phone=l]', { y: '40vh', rotate: -8 }, { y: '-30vh', rotate: -3, ease: 'none', scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.fromTo('[data-phone=r]', { y: '60vh', rotate: 8 }, { y: '-50vh', rotate: 3, ease: 'none', scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: true } });
  }
  const imgs = $$('[data-screens] img'), dots = $$('.screens__dots i'), feats = $$('[data-feat]');
  let active = -1;
  const show = i => {
    if (i === active) return;
    imgs.forEach((img, j) => { img.classList.toggle('was-on', j === active); img.classList.toggle('is-on', j === i); });
    dots.forEach((d, j) => d.classList.toggle('is-on', j === i));
    feats.forEach((f, j) => f.classList.toggle('is-on', j === i));
    active = i;
  };
  show(0);
  feats.forEach((f, i) => ScrollTrigger.create({ trigger: f, start: 'top 60%', end: 'bottom 60%', onToggle: s => s.isActive && show(i) }));
  if (!reduced) {
    gsap.from('.screens__frame', { clipPath: 'inset(12% 12% 12% 12% round 24px)', ease: 'none', scrollTrigger: { trigger: '[data-feats]', start: 'top 90%', end: 'top 30%', scrub: true } });
  }
}

function bento() {
  const cells = $$('[data-bento] .cell');
  if (!reduced) {
    gsap.from(cells, { y: 60, opacity: 0, scale: .96, duration: 1.2, ease: EASE, stagger: { each: .08, from: 'start' }, scrollTrigger: { trigger: '[data-bento]', start: 'top 82%' } });
  }
  const live = [];
  const board = createBoard($('[data-board]'), $('[data-board-move]'), { reduced });
  const flicker = createFlicker($('[data-flicker]'), { reduced });
  const palettes = createPalettes($('[data-palette-cell]'), $('[data-palettes]'), $('[data-palette-name]'), { reduced });
  buildPieces($('[data-pieces]'));
  $$('.orbit__ring').forEach(r => { const n = r.children.length; [...r.children].forEach((img, i) => img.style.setProperty('--a0', (360 / n) * i + 'deg')); });
  live.push([board, '.cell--board'], [flicker, '.cell--puzzles'], [palettes, '.cell--palettes']);
  for (const [w, sel] of live) ScrollTrigger.create({ trigger: sel, start: 'top bottom', end: 'bottom top', onToggle: s => s.isActive ? w.start() : w.stop() });
  const ladder = $$('[data-ladder] li');
  if (reduced) ladder.forEach(li => li.style.setProperty('--p', 1));
  else gsap.to(ladder, { '--p': 1, duration: 1.6, ease: 'expo.out', stagger: .1, scrollTrigger: { trigger: '[data-ladder]', start: 'top 88%' } });
}

function velocity() {
  const rows = $$('[data-velo]').map(el => {
    const track = $('.velo__track', el); track.innerHTML += track.innerHTML;
    return { track, dir: Number(el.dataset.velo), x: 0, w: 0 };
  });
  const measure = () => rows.forEach(r => { r.w = r.track.scrollWidth / 2; });
  measure(); addEventListener('resize', measure);
  if (reduced) return;
  let dir = 1, visible = false;
  ScrollTrigger.create({ trigger: '.stack', start: 'top bottom', end: 'bottom top', onToggle: s => { visible = s.isActive; } });
  gsap.ticker.add((_, dt) => {
    if (!visible) return;
    const v = lenis ? lenis.velocity : 0;
    if (v > 0.5) dir = 1; else if (v < -0.5) dir = -1;
    const speed = (60 + Math.min(Math.abs(v) * 90, 1400)) * dt / 1000;
    for (const r of rows) {
      r.x -= speed * r.dir * dir;
      if (r.w) r.x = ((r.x % r.w) - r.w) % r.w;
      r.track.style.transform = `translate3d(${r.x}px,0,0) skewX(${gsap.utils.clamp(-8, 8, -v * .25 * r.dir)}deg)`;
    }
  });
}

function author() {
  const sec = $('[data-author]');
  const pix = createPixelator($('[data-pixel]'), '/folio/defold.webp');
  const name = $('[data-scramble]');
  const scramble = () => gsap.to(name, { duration: 1.4, scrambleText: { text: name.dataset.scramble, chars: 'shahmatDEFOLD01♚♛♜♝♞', revealDelay: .3, speed: .6 } });
  name.addEventListener('pointerenter', () => { if (!gsap.isTweening(name)) scramble(); });
  if (reduced) { pix.draw(1); return; }
  gsap.fromTo(sec, { clipPath: 'inset(0% 6% 0% 6% round 40px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'top 20%', scrub: true } });
  const b = { v: 72 };
  pix.draw(b.v);
  gsap.to(b, { v: 1, ease: 'power2.in', onUpdate: () => pix.draw(b.v), scrollTrigger: { trigger: '.author__pic', start: 'top 80%', end: 'center 45%', scrub: .5 } });
  $('.author__pic').addEventListener('pointerenter', () => { if (b.v > 1.05) return; const t = { v: 28 }; gsap.to(t, { v: 1, duration: .8, ease: 'steps(10)', onUpdate: () => pix.draw(t.v) }); });
  ScrollTrigger.create({ trigger: name, start: 'top 85%', once: true, onEnter: scramble });
  gsap.from($$('[data-facts] > div'), { y: 24, opacity: 0, stagger: .08, duration: 1, ease: EASE, scrollTrigger: { trigger: '[data-facts]', start: 'top 88%' } });
  gsap.from('.author .pill', { y: 20, opacity: 0, duration: 1, ease: EASE, scrollTrigger: { trigger: '.author .pill', start: 'top 95%' } });
  const theme = document.querySelector('meta[name="theme-color"]');
  ScrollTrigger.create({ trigger: sec, start: 'top 64px', end: 'bottom 64px', onToggle: s => { $('[data-nav]').classList.toggle('is-dark', s.isActive); theme.content = s.isActive ? '#000000' : '#ffffff'; } });
}

function footer() {
  const mark = $('[data-foot-mark]');
  const fit = () => { mark.style.setProperty('--fit', '100px'); mark.style.display = 'inline-block'; const w = mark.getBoundingClientRect().width; mark.style.display = ''; mark.style.setProperty('--fit', (100 * (innerWidth - 8) / w).toFixed(2) + 'px'); };
  fit(); addEventListener('resize', fit);
  const split = new SplitText(mark, { type: 'chars', charsClass: 'ch' });
  if (reduced) return;
  gsap.from(split.chars, { yPercent: 100, ease: 'none', stagger: .04, scrollTrigger: { trigger: '.foot', start: 'top bottom', end: 'bottom bottom', scrub: .6 } });
  gsap.from('.cta .pill', { scale: .6, opacity: 0, duration: 1.2, ease: 'elastic.out(1, .6)', scrollTrigger: { trigger: '.cta .pill', start: 'top 92%' } });
}

/* ---------- target cursor (React Bits <TargetCursor />) ---------- */
function cursor() {
  root.classList.add('has-cursor');
  const el = $('.cursor'), corners = $$('.cursor i');
  const base = [[-18, -18], [6, -18], [6, 6], [-18, 6]];
  const xTo = gsap.quickTo(el, 'x', { duration: .18, ease: 'power3' }), yTo = gsap.quickTo(el, 'y', { duration: .18, ease: 'power3' });
  const spin = gsap.to(el, { rotation: 360, duration: 3, ease: 'none', repeat: -1 });
  let target = null, mx = 0, my = 0;
  const fit = () => {
    if (!target) return;
    const r = target.getBoundingClientRect(), pad = 6;
    const pts = [[r.left - pad, r.top - pad], [r.right + pad - 12, r.top - pad], [r.right + pad - 12, r.bottom + pad - 12], [r.left - pad, r.bottom + pad - 12]];
    corners.forEach((c, i) => gsap.to(c, { x: pts[i][0] - mx - base[i][0], y: pts[i][1] - my - base[i][1], duration: .22, ease: 'power3.out', overwrite: true }));
  };
  addEventListener('pointermove', e => { root.classList.add('cursor-on'); mx = e.clientX; my = e.clientY; xTo(mx); yTo(my); fit(); }, { passive: true });
  document.addEventListener('pointerover', e => {
    const t = e.target.closest?.('[data-cursor]');
    if (t === target) return;
    target = t;
    if (t) { spin.pause(); gsap.to(el, { rotation: 0, duration: .2 }); fit(); }
    else { corners.forEach(c => gsap.to(c, { x: 0, y: 0, duration: .3, ease: 'power3.out', overwrite: true })); spin.restart(); }
  });
  addEventListener('scroll', fit, { passive: true });
  document.addEventListener('pointerleave', () => root.classList.remove('cursor-on'));
  document.addEventListener('pointerdown', () => gsap.to(el, { scale: .8, duration: .15 }));
  document.addEventListener('pointerup', () => gsap.to(el, { scale: 1, duration: .25 }));
}

/* ---------- magnet (React Bits <Magnet />) ---------- */
function magnets() {
  for (const el of $$('[data-magnet]')) {
    const inner = el.firstElementChild;
    const xTo = gsap.quickTo(el, 'x', { duration: .6, ease: 'elastic.out(1, .5)' }), yTo = gsap.quickTo(el, 'y', { duration: .6, ease: 'elastic.out(1, .5)' });
    const ixTo = gsap.quickTo(inner, 'x', { duration: .6, ease: 'elastic.out(1, .5)' }), iyTo = gsap.quickTo(inner, 'y', { duration: .6, ease: 'elastic.out(1, .5)' });
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); xTo(dx * .3); yTo(dy * .4); ixTo(dx * .12); iyTo(dy * .15); });
    el.addEventListener('pointerleave', () => { xTo(0); yTo(0); ixTo(0); iyTo(0); });
  }
}

function spotlights() {
  for (const el of $$('[data-spot]')) el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); el.style.setProperty('--mx', e.clientX - r.left + 'px'); el.style.setProperty('--my', e.clientY - r.top + 'px'); }, { passive: true });
}

/* split the wordmark into chars before the first paint of the intro */
for (const el of $$('[data-chars]')) { const t = el.textContent; el.textContent = ''; for (const ch of t) { const s = document.createElement('span'); s.className = 'ch'; s.textContent = ch; el.append(s); } }
if (!reduced) gsap.set(['.wordmark .ch'], { yPercent: 115 });
if (!reduced) gsap.set(['[data-hero-in]', '[data-hero-meta] > div', '[data-hint]', '.nav'], { opacity: 0 });
if (!reduced) gsap.set('[data-blk]', { scaleX: 0, transformOrigin: '0% 50%' });
scrollTo(0, 0);
boot();
