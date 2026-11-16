// Smooth wheel input on scrollable vertical containers; touch, zoom, horizontal
// gestures and reduced-motion preferences stay native.
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let current = null, target = 0, frame = 0, lastTime = 0, velocity = 0;
function scroller(node, delta) {
  for (let el = node instanceof Element ? node : node?.parentElement; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el), max = el.scrollHeight - el.clientHeight;
    if (max > 1 && /(auto|scroll)/.test(style.overflowY) && ((delta < 0 && el.scrollTop > 0) || (delta > 0 && el.scrollTop < max - 1))) return el;
  }
  const el = document.scrollingElement, max = el.scrollHeight - el.clientHeight;
  return max > 1 && ((delta < 0 && el.scrollTop > 0) || (delta > 0 && el.scrollTop < max - 1)) ? el : null;
}
function tick(time) {
  if (!current) { frame = 0; return; }
  const dt = Math.min(32, lastTime ? time - lastTime : 16); lastTime = time;
  const distance = target - current.scrollTop;
  // Smoothly accelerate toward the remaining distance, then decelerate.
  const desired = distance * .014;
  velocity += (desired - velocity) * (1 - Math.exp(-dt / 80));
  const step = velocity * dt;
  if (Math.abs(distance) < .5 && Math.abs(velocity) < .02) { current.scrollTop = target; frame = 0; current = null; velocity = 0; lastTime = 0; return; }
  current.scrollTop += Math.abs(step) > Math.abs(distance) && Math.sign(step) === Math.sign(distance) ? distance : step;
  frame = requestAnimationFrame(tick);
}
document.addEventListener('wheel', event => {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || reduced.matches || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY || event.target.closest?.('#palette-scroll')) return;
  const el = scroller(event.target, event.deltaY); if (!el) return;
  event.preventDefault();
  if (current !== el) { if (frame) cancelAnimationFrame(frame); current = el; target = el.scrollTop; velocity = 0; lastTime = 0; frame = 0; }
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
  target = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, target + event.deltaY * unit));
  if (!frame) frame = requestAnimationFrame(tick);
}, { passive:false });
