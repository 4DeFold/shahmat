// Count Up's ease-out count, adapted to native DOM and interrupted transitions.
// First render is immediate; later transitions start at the last visible value.
export function createRatingCount(element, win) {
  const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  let frame = null, current = null, targetKey = null, lastUnit = null;
  const cancel = () => { if (frame !== null) win.cancelAnimationFrame(frame); frame = null; };
  function set(value, unit, calibration = false) {
    const valid = value != null && Number.isFinite(Number(value));
    const target = valid ? Number(value) : null;
    const key = `${target}:${unit}:${calibration}`;
    if (targetKey === key) return;
    targetKey = key; cancel();
    if (lastUnit !== null && lastUnit !== unit) current = null;
    lastUnit = unit;
    const format = n => `(${number.format(n)} ${unit === 'elo' ? 'Эло' : 'ЯР'})`;
    if (target === null) { current = null; element.textContent = calibration ? '(калибровка)' : ''; element.removeAttribute('aria-label'); return; }
    element.setAttribute('aria-label',format(target));
    if (current === null || current === target || !win.requestAnimationFrame || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      current = target; element.textContent = format(target); return;
    }
    const from = current; let start = null;
    const tick = timestamp => {
      if (start === null) start = timestamp;
      const t = Math.min(1, Math.max(0, (timestamp - start) / 900));
      const ease = 1 - Math.pow(1 - t, 3);
      current = from + (target - from) * ease;
      element.textContent = format(current);
      if (t < 1) frame = win.requestAnimationFrame(tick);
      else { frame = null; current = target; }
    };
    frame = win.requestAnimationFrame(tick);
  }
  return { set, reset(value, unit, calibration = false) { cancel(); current = null; targetKey = null; set(value,unit,calibration); }, destroy:cancel };
}
