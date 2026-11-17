// A lightweight, framework-free adaptation of React Bits' rolling Counter:
// each digit has its own clipped reel and rolls independently as the value changes.
export function createRollingClock(element, reducedMotion = () => false) {
  const doc = element.ownerDocument, win = doc.defaultView;
  const accessible = doc.createElement('span'); accessible.className = 'visually-hidden clock-readable';
  const display = doc.createElement('span'); display.className = 'clock-digits'; display.setAttribute('aria-hidden', 'true');
  element.replaceChildren(accessible, display);
  let previous = null, columns = new Map();
  // FLIP the card's visual box when its content or responsive width changes.
  // ResizeObserver runs before paint, so the new layout need not jump first.
  const card = element.closest('.clock');
  let cardRect = null, sizeAnimation = null;
  const observer = card && win.ResizeObserver ? new win.ResizeObserver(() => {
    let from = cardRect;
    if (sizeAnimation && cardRect && win.DOMMatrixReadOnly) {
      const transform = win.getComputedStyle(card).transform;
      if (transform && transform !== 'none') {
        const matrix = new win.DOMMatrixReadOnly(transform);
        const width = cardRect.width * matrix.a, height = cardRect.height * matrix.d;
        from = { width, height, left:cardRect.left + cardRect.width / 2 + matrix.e - width / 2,
          top:cardRect.top + cardRect.height / 2 + matrix.f - height / 2 };
      }
    }
    sizeAnimation?.cancel(); sizeAnimation = null;
    const next = card.getBoundingClientRect();
    if (from?.width && from.height && next.width && next.height &&
        (Math.abs(from.width - next.width) > .5 || Math.abs(from.height - next.height) > .5) &&
        !reducedMotion() && card.animate) {
      const dx = Math.max(-80, Math.min(80, (from.left + from.width / 2) - (next.left + next.width / 2)));
      const dy = Math.max(-80, Math.min(80, (from.top + from.height / 2) - (next.top + next.height / 2)));
      const animation = card.animate([
        { transform:`translate(${dx}px, ${dy}px) scale(${from.width / next.width}, ${from.height / next.height})` },
        { transform:'translate(0, 0) scale(1, 1)' },
      ], { duration:350, easing:'cubic-bezier(.22, 1, .36, 1)' });
      sizeAnimation = animation;
      animation.finished?.catch(() => {}).finally(() => { if (sizeAnimation === animation) sizeAnimation = null; });
    }
    cardRect = next;
  }) : null;
  observer?.observe(card);

  function update(value) {
    if (value === previous) return;
    const direction = previous && /^\d/.test(previous) && /^\d/.test(value)
      ? (Number(value.replaceAll(':', '')) >= Number(previous.replaceAll(':', '')) ? 1 : -1) : 1;
    const oldColumns = columns; columns = new Map();
    let digitFromRight = 0, separatorFromRight = 0;
    const items = [...value].reverse().map(char => ({ char, key: /\d/.test(char) ? `d${digitFromRight++}` : `s${separatorFromRight++}` })).reverse();
    for (const {char, key} of items) {
      const isDigit = /\d/.test(char);
      let column = oldColumns.get(key);
      if (!column || column.isDigit !== isDigit) {
        const slot = doc.createElement('span'); slot.className = isDigit ? 'clock-digit' : 'clock-separator';
        if (isDigit) {
          const window = doc.createElement('span'); window.className = 'clock-window';
          const reel = doc.createElement('span'); reel.className = 'clock-reel';
          for (let i = 0; i < 30; i++) { const digit = doc.createElement('span'); digit.textContent = String(i % 10); reel.append(digit); }
          window.append(reel); slot.append(window); column = { slot, reel, isDigit, value: null, animation: null };
        } else column = { slot, isDigit, value: null };
      }
      columns.set(key, column); display.append(column.slot);
      if (!isDigit) { column.slot.textContent = char; column.value = char; continue; }
      const next = Number(char), old = column.value;
      if (old !== next) {
        let from = old == null ? 10 + next : 10 + old;
        if (column.animation) {
          const transform = win.getComputedStyle(column.reel).transform;
          // Continue interrupted rolls from their visible position when available.
          column.animation.cancel(); column.animation = null;
          if (transform && transform !== 'none' && win.DOMMatrixReadOnly) {
            const fontSize = parseFloat(win.getComputedStyle(column.reel).fontSize);
            if (fontSize) from = -new win.DOMMatrixReadOnly(transform).m42 / fontSize;
          }
        }
        let target = 10 + next;
        if (old !== null && direction > 0 && target < from) target += 10;
        if (old !== null && direction < 0 && target > from) target -= 10;
        column.reel.style.transform = `translateY(${-target}em)`;
        if (old !== null && !reducedMotion() && column.reel.animate && Math.abs(target - from) > .001) {
          const animation = column.reel.animate([{ transform:`translateY(${-from}em)` }, { transform:`translateY(${-target}em)` }], { duration:550, easing:'cubic-bezier(.22, 1, .36, 1)' });
          column.animation = animation;
          animation.finished?.catch(() => {}).finally(() => { if (column.animation === animation) column.animation = null; });
        }
        column.value = next;
      }
    }
    for (const [key, column] of oldColumns) if (!columns.has(key)) { column.animation?.cancel(); column.slot.remove(); }
    accessible.textContent = value; element.setAttribute('aria-label', value);
    element.style.setProperty('--clock-digits', String(value.length));
    previous = value;
  }
  return { update, destroy() { observer?.disconnect(); sizeAnimation?.cancel(); for (const column of columns.values()) column.animation?.cancel(); } };
}
