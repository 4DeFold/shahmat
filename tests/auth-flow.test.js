import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile('index.html', 'utf8');
const source = (await readFile('app.js', 'utf8')).replace(/import .*?;\n/g, '');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function setup({ existing = false, palette = 'monochrome', failSave = false, systemDark = false } = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com' });
  const { window } = dom;
  let loggedIn = existing;
  let metadata = { palette };
  const user = () => ({ id: 'user-1', user_metadata: { ...metadata } });
  let storedProfile = existing ? { username: 'Player', bio: '', palette: 'monochrome' } : null;
  let signUps = 0;
  const db = {
    auth: {
      getSession: async () => ({ data: { session: loggedIn ? { user: user() } : null } }),
      getUser: async () => ({ data: { user: loggedIn ? user() : null } }),
      signUp: async () => { signUps++; loggedIn = true; return { data: { session: { user: user() } } }; },
      signInWithPassword: async () => { loggedIn = true; return { data: { session: { user: user() } } }; },
      updateUser: async ({ data }) => { if (failSave) return { error: new Error('save failed') }; metadata = { ...metadata, ...data }; return { data: { user: user() } }; },
      signOut: async () => { loggedIn = false; return {}; }
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: storedProfile }) }) }),
      upsert: async value => { storedProfile = value; return {}; }
    })
  };
  let themeChange;
  const themePreference = { matches: systemDark, addEventListener: (_, handler) => { themeChange = handler; } };
  window.matchMedia = query => query.includes('reduced-motion') ? { matches: true } : themePreference;
  const changeSystemTheme = dark => { themePreference.matches = dark; themeChange?.({ matches: dark }); };
  window.requestAnimationFrame = cb => cb();
  window.createClient = () => db;
  window.eval(source);
  await tick();
  const $ = id => window.document.getElementById(id);
  const click = async id => { $(id).click(); await tick(); };
  const submit = async id => { $(id).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await tick(); };
  const choose = async (container, value) => { const input = $(container).querySelector(`input[value="${value}"]`); input.checked = true; input.dispatchEvent(new window.Event('change', { bubbles: true })); await tick(); };
  return { $, click, submit, choose, getProfile: () => storedProfile, getMetadata: () => metadata, getSignUps: () => signUps, changeSystemTheme, document: window.document };
}

test('registration requires a profile, saves chosen palette and opens dashboard', async () => {
  const { $, click, submit, choose, getProfile, getMetadata, getSignUps, document } = await setup();
  await click('play'); assert.equal($('auth-screen').hidden, false);
  await click('tab-signup'); $('email').value = 'player@example.com'; $('password').value = 'secret123';
  await submit('auth-form'); assert.equal(getSignUps(), 1); assert.equal($('profile-screen').hidden, false);
  assert.equal($('username').required, true);
  assert.equal($('profile-screen').querySelector('.signout'), null);
  $('username').value = 'Player_1'; $('bio').value = 'Chess'; await submit('profile-form');
  assert.equal(getProfile().username, 'Player_1'); assert.equal($('palette-screen').hidden, false);
  await choose('onboarding-palettes', 'atelier'); assert.equal(document.querySelector('.landing').dataset.palette, 'atelier');
  await submit('palette-form'); assert.equal(getMetadata().palette, 'atelier');
  assert.equal($('dashboard-screen').hidden, false); assert.match($('dashboard-title').textContent, /Player_1/);
  await click('edit-profile'); $('bio').value = 'Updated'; await submit('profile-form');
  assert.equal(getProfile().bio, 'Updated'); assert.equal(getMetadata().palette, 'atelier');
  assert.equal($('dashboard-screen').hidden, false);
  await choose('dashboard-palettes', 'wood'); assert.equal(getMetadata().palette, 'wood');
  $('dashboard-screen').querySelector('.signout').click(); await tick();
  assert.equal($('auth-screen').hidden, false); assert.equal(document.querySelector('.landing').classList.contains('palette-active'), false);
  $('email').value = 'player@example.com'; $('password').value = 'secret123'; await submit('auth-form');
  assert.equal($('dashboard-screen').hidden, false); assert.equal(document.querySelector('.landing').dataset.palette, 'wood');
});

test('existing session opens dashboard with saved palette', async () => {
  const { $, document } = await setup({ existing: true, palette: 'forest' });
  assert.equal($('dashboard-screen').hidden, false); assert.match($('dashboard-title').textContent, /Player/);
  assert.equal(document.querySelector('.landing').dataset.palette, 'forest');
});

test('failed palette save reverts selection and reports error', async () => {
  const { $, click, choose, getMetadata, document } = await setup({ existing: true, palette: 'forest', failSave: true });
  await choose('dashboard-palettes', 'wood');
  assert.equal(document.querySelector('.landing').dataset.palette, 'forest');
  assert.equal(getMetadata().palette, 'forest'); assert.match($('dashboard-message').textContent, /Не удалось/);
  assert.equal($('dashboard-palettes').querySelector('input[value="forest"]').checked, true);
});

test('gray palette follows monochrome and persists after signing back in', async () => {
  const { $, click, choose, submit, getMetadata, document } = await setup({ existing: true });
  for (const id of ['onboarding-palettes', 'dashboard-palettes']) {
    assert.deepEqual(Array.from($(id).querySelectorAll('input'), input => input.value), ['monochrome', 'gray', 'forest', 'atelier', 'wood']);
  }
  await choose('dashboard-palettes', 'gray');
  assert.equal(getMetadata().palette, 'gray');
  assert.equal(document.querySelector('.landing').dataset.palette, 'gray');
  $('dashboard-screen').querySelector('.signout').click(); await tick();
  assert.equal(document.querySelector('.landing').classList.contains('palette-active'), false);
  $('email').value = 'player@example.com'; $('password').value = 'secret123'; await submit('auth-form');
  assert.equal(document.querySelector('.landing').dataset.palette, 'gray');
  assert.equal($('dashboard-palettes').querySelector('input[value="gray"]').checked, true);
});


test('repeat click switches theme and persists it without changing palette', async () => {
  const { $, getMetadata, document, submit } = await setup({ existing: true, palette: 'gray' });
  const landing = document.querySelector('.landing');
  assert.equal(landing.dataset.paletteTheme, 'light');
  $('dashboard-palettes').querySelector('input[value="gray"]').click(); await tick();
  assert.equal(landing.dataset.paletteTheme, 'dark');
  assert.equal(getMetadata().palette_theme, 'dark');
  assert.equal(getMetadata().palette, 'gray');
  $('dashboard-screen').querySelector('.signout').click(); await tick();
  $('email').value = 'player@example.com'; $('password').value = 'secret123'; await submit('auth-form');
  assert.equal(landing.dataset.paletteTheme, 'dark');
  $('dashboard-palettes').querySelector('input[value="gray"]').click(); await tick();
  assert.equal(landing.dataset.paletteTheme, 'light');
  assert.equal(getMetadata().palette_theme, 'light');
});

test('failed theme save restores previous theme', async () => {
  const { $, document } = await setup({ existing: true, palette: 'forest', failSave: true });
  $('dashboard-palettes').querySelector('input[value="forest"]').click(); await tick();
  assert.equal(document.querySelector('.landing').dataset.paletteTheme, 'light');
  assert.match($('dashboard-message').textContent, /Не удалось/);
});

test('startup waits for session and profile before revealing dashboard', async () => {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com' });
  const { window } = dom;
  let resolveSession, resolveProfile;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  window.requestAnimationFrame = cb => cb();
  window.createClient = () => ({
    auth: { getSession: () => new Promise(resolve => { resolveSession = resolve; }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => new Promise(resolve => { resolveProfile = resolve; }) }) }) })
  });
  window.eval(source);
  const doc = window.document;
  assert.equal(doc.body.classList.contains('startup-ready'), false);
  assert.equal(doc.getElementById('landing-screen').hidden, true);
  resolveSession({ data: { session: { user: { id: 'user', user_metadata: { palette: 'gray', palette_theme: 'dark' } } } } });
  await tick();
  assert.equal(doc.body.classList.contains('startup-ready'), false);
  resolveProfile({ data: { username: 'Player', bio: '' } }); await tick();
  assert.equal(doc.body.classList.contains('startup-ready'), true);
  assert.equal(doc.getElementById('dashboard-screen').hidden, false);
  assert.equal(doc.getElementById('landing-screen').hidden, true);
  assert.equal(doc.querySelector('.landing').dataset.paletteTheme, 'dark');
});

test('no session reveals landing after session check', async () => {
  const { $, document } = await setup();
  assert.equal(document.body.classList.contains('startup-ready'), true);
  assert.equal($('landing-screen').hidden, false);
  assert.equal($('dashboard-screen').hidden, true);
});


test('onboarding repeat click changes theme and saves it on confirmation', async () => {
  const { $, click, submit, getMetadata, document } = await setup();
  await click('play'); await click('tab-signup');
  $('email').value = 'new@example.com'; $('password').value = 'secret123'; await submit('auth-form');
  $('username').value = 'Player_1'; await submit('profile-form');
  $('onboarding-palettes').querySelector('input[value="monochrome"]').click();
  assert.equal(document.querySelector('.landing').dataset.paletteTheme, 'dark');
  await submit('palette-form');
  assert.equal(getMetadata().palette_theme, 'dark');
  assert.equal($('dashboard-screen').hidden, false);
});

test('system theme is followed until user explicitly selects a theme', async () => {
  const { $, document, changeSystemTheme } = await setup({ existing: true, palette: 'wood' });
  const landing = document.querySelector('.landing');
  changeSystemTheme(true); assert.equal(landing.dataset.paletteTheme, 'dark');
  $('dashboard-palettes').querySelector('input[value="wood"]').click(); await tick();
  assert.equal(landing.dataset.paletteTheme, 'light');
  changeSystemTheme(false); changeSystemTheme(true);
  assert.equal(landing.dataset.paletteTheme, 'light');
});

test('session errors show a retry path instead of leaving an indefinite black screen', async () => {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  window.requestAnimationFrame = cb => cb();
  window.createClient = () => ({ auth: { getSession: async () => ({ error: new Error('offline') }) } });
  window.eval(source); await tick();
  assert.equal(window.document.body.classList.contains('startup-ready'), true);
  assert.equal(window.document.getElementById('auth-screen').hidden, false);
  assert.match(window.document.getElementById('auth-message').textContent, /Не удалось проверить сессию/);
});
