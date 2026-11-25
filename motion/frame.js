// Entry for the standalone game documents; the shared engine does the work.
import { motionOK } from './core.js';
import './frame.css';

// Stagger index for grids that the frame scripts render dynamically.
const GRID = '.puzzle-themes-grid, #themes-content';
const index = root => root.querySelectorAll?.(GRID).forEach(grid => [...grid.children].forEach((child, i) => child.style.setProperty('--m-i', i)));
const start = () => {
  index(document);
  new MutationObserver(records => { if (!motionOK()) return; for (const record of records) if (record.target.matches?.(GRID)) index(record.target.parentElement || document); })
    .observe(document.body, { childList: true, subtree: true });
};
if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
