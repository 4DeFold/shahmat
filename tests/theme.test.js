import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile('index.html', 'utf8');
const source = await readFile('theme.js', 'utf8');
function setup({ dark = false, reduced = false, transitions = false } = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com' });
  const { window } = dom;
  let systemChange;
  window.matchMedia = query => query.includes('reduced-motion')
    ? { matches: reduced }
    : { matches: dark, addEventListener: (_, handler) => { systemChange = handler; } };
  let started = 0;
  if (transitions) {
    window.CSS = { registerProperty() {} };
    window.document.startViewTransition = fn => { started++; fn(); return { skipTransition() {}, finished: Promise.resolve() }; };
  }
  window.eval(source);
  return { window, systemChange, count: () => started };
}

test('theme follows system until manually changed, including fallback', () => {
  const { window, systemChange } = setup();
  const root = window.document.documentElement;
  assert.equal(root.dataset.theme, 'light');
  systemChange({ matches: true }); assert.equal(root.dataset.theme, 'dark');
  window.document.querySelector('.theme-toggle').click();
  assert.equal(root.dataset.theme, 'light'); assert.equal(root.classList.contains('theme-fade'), true);
  systemChange({ matches: true }); assert.equal(root.dataset.theme, 'light');
});

test('theme uses view transition wave when available', () => {
  const { window, count } = setup({ transitions: true });
  window.document.querySelector('.theme-toggle').click();
  assert.equal(count(), 1);
  assert.equal(window.document.documentElement.dataset.theme, 'dark');
  assert.ok(window.document.documentElement.style.getPropertyValue('--theme-max-radius'));
});

test('reduced motion changes theme without a view transition', () => {
  const { window, count } = setup({ transitions: true, reduced: true, dark: true });
  window.document.querySelector('.theme-toggle').click();
  assert.equal(count(), 0); assert.equal(window.document.documentElement.dataset.theme, 'light');
});
