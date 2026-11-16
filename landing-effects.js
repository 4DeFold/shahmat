// Lightweight, framework-free interpretations of React Bits' Magnet,
// Spotlight Card and Click Spark interactions. Only active on entry screens.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const play = document.getElementById('play');
const landing = document.querySelector('.landing');

function resetMagnet() {
  play.style.removeProperty('--magnet-x');
  play.style.removeProperty('--magnet-y');
}
play.addEventListener('pointermove', event => {
  if (reducedMotion.matches || !finePointer.matches || event.pointerType === 'touch') return;
  const box = play.getBoundingClientRect();
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
  play.style.setProperty('--magnet-x', `${clamp((event.clientX - box.left - box.width / 2) * .13, 12)}px`);
  play.style.setProperty('--magnet-y', `${clamp((event.clientY - box.top - box.height / 2) * .13, 8)}px`);
});
play.addEventListener('pointerleave', resetMagnet);
play.addEventListener('blur', resetMagnet);
reducedMotion.addEventListener('change', resetMagnet);

// The shell is lazy-loaded, so delegate events rather than delaying first paint.
landing.addEventListener('pointermove', event => {
  if (reducedMotion.matches || !finePointer.matches || event.pointerType === 'touch') return;
  const panel = event.target.closest?.('#auth-screen:not([hidden])');
  if (!panel) return;
  const box = panel.getBoundingClientRect();
  panel.style.setProperty('--spot-x', `${event.clientX - box.left}px`);
  panel.style.setProperty('--spot-y', `${event.clientY - box.top}px`);
});

landing.addEventListener('click', event => {
  if (reducedMotion.matches || !event.detail || !event.target.closest?.('#play, #login, #auth-screen button')) return;
  if (!document.body.animate) return;
  // A small, finite burst with no canvas, timers, or blocked pointer events.
  for (let i = 0; i < 8; i++) {
    const spark = document.createElement('span');
    spark.className = 'entrance-spark'; spark.setAttribute('aria-hidden', 'true');
    spark.style.left = `${event.clientX}px`; spark.style.top = `${event.clientY}px`;
    document.body.append(spark);
    const angle = i * Math.PI / 4, x = Math.cos(angle) * 24, y = Math.sin(angle) * 24;
    const animation = spark.animate([
      { transform: `translate(-50%, -50%) rotate(${angle}rad) translateX(4px) scaleX(.4)`, opacity: .9 },
      { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${angle}rad) scaleX(1)`, opacity: 0 }
    ], { duration:480, easing:'cubic-bezier(.16,1,.3,1)' });
    animation.onfinish = () => spark.remove();
    animation.oncancel = () => spark.remove();
  }
});
