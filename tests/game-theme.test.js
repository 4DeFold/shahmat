import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const source = 'const installPieceTheme = () => {}; const installBoardPieces = () => {};\n' + (await readFile('pages/game-theme.js', 'utf8')).replace(/^import .*;\n/gm, '');
const key = 'sb-eswyxbyddkajysogtglp-auth-token';
function setup({ dark = false, session = null, stored = {} } = {}) {
  const dom = new JSDOM('<meta name="theme-color" content="#fff">', { url: 'https://example.com/play', runScripts: 'outside-only' });
  const { window } = dom;
  const media = { matches: dark, addEventListener: (_, fn) => { media.change = fn; } };
  window.matchMedia = () => media;
  if (session) window.localStorage.setItem(key, JSON.stringify(session));
  for (const [k, v] of Object.entries(stored)) window.localStorage.setItem(k, JSON.stringify(v));
  window.eval(source);
  return { window, media, theme: () => window.document.documentElement.dataset.theme };
}
const session = (id, palette_theme) => ({ user: { id, user_metadata: { palette: 'forest', palette_theme } } });
test('guest theme follows device, never a previously signed-out user', () => {
  const app = setup({ dark: true, stored: { 'shahmat.appearance.old': { palette: 'wood', theme: 'light', dirty: true, version: 1 } } });
  assert.equal(app.theme(), 'dark');
  app.media.matches = false; app.media.change(); assert.equal(app.theme(), 'light');
});
test('signed-in theme wins over system, pending local change wins over remote', () => {
  const app = setup({ session: session('user', 'dark'), stored: { 'shahmat.appearance.user': { palette: 'forest', theme: 'light', dirty: true, version: 1 } } });
  assert.equal(app.theme(), 'light');
  app.window.localStorage.setItem('shahmat.appearance.user', JSON.stringify({ palette: 'forest', theme: 'dark', dirty: false, version: 1 }));
  app.window.dispatchEvent(new app.window.Event('storage')); assert.equal(app.theme(), 'dark');
  app.media.matches = false; app.media.change(); assert.equal(app.theme(), 'dark');
  app.window.localStorage.removeItem(key); app.window.dispatchEvent(new app.window.Event('storage')); assert.equal(app.theme(), 'light');
});
test('invalid or missing stored settings safely fall back to device theme', () => {
  const app = setup({ dark: true, session: session('user', null), stored: { 'shahmat.appearance.user': { palette: 'forest', theme: 'invalid', dirty: true, version: 1 } } });
  assert.equal(app.theme(), 'dark');
});

test('latest synced local appearance wins over stale session metadata', () => {
  const app = setup({ session: session('user', 'light'), stored: { 'shahmat.appearance.user': { palette: 'forest', theme: 'dark', dirty: false, version: 2 } } });
  assert.equal(app.theme(), 'dark');
});
