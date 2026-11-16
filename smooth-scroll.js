// Animata's website uses Lenis (MIT): components/smooth-scroll.tsx at
// codse/animata@25c27e5a874c60a56dcc1609df3b2c4f5f8456f8. Its wheel
// settings are retained here; touch, keyboard and reduced-motion stay native.
import Lenis from 'lenis';

const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const nested = new Map();
let root = null;
const options = {
  lerp: 0.14, wheelMultiplier: 1.1, allowNestedScroll: true,
  anchors: true, stopInertiaOnNavigate: true, autoRaf: true,
  prevent: node => !!node.closest?.('[data-lenis-prevent], [role="dialog"], #palette-scroll'),
};
function dispose() {
  root?.destroy(); root = null;
  for (const instance of nested.values()) instance.destroy();
  nested.clear();
}
function configure() {
  dispose();
  if (!preference.matches) root = new Lenis(options);
}
configure();
preference.addEventListener('change', configure);
// Give nested vertical scroll areas their own Lenis, including areas loaded
// lazily after the initial page. Native horizontal palette scrolling is kept.
document.addEventListener('wheel', event => {
  if (!root || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  for (let node = event.target instanceof Element ? event.target : event.target?.parentElement; node && node !== document.body; node = node.parentElement) {
    if (node.closest('[data-lenis-prevent], [role="dialog"], #palette-scroll')) return;
    if (node.scrollHeight > node.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) {
      if (!nested.has(node)) nested.set(node, new Lenis({ ...options, anchors:false, wrapper:node, content:node }));
    }
  }
}, { capture:true, passive:true });
new MutationObserver(() => {
  for (const [node, instance] of nested) if (!node.isConnected) { instance.destroy(); nested.delete(node); }
}).observe(document.documentElement, { childList:true, subtree:true });
