// Entry for standalone game documents; the shared engine does the work.
import { motionOK } from './core.js';
import './frame.css';

// Only the puzzle themes grid needs stagger indexes. Other frames and board
// updates should not run a document-wide mutation observer for this effect.
const start = () => {
  const grid = document.getElementById('themes-content');
  if (!grid) return;
  const index = () => {
    if (!motionOK()) return;
    [...grid.children].forEach((child, i) => {
      const value=String(i);
      if (child.style.getPropertyValue('--m-i') !== value) child.style.setProperty('--m-i', value);
    });
  };
  index();
  new MutationObserver(index).observe(grid, { childList: true });
};
if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
