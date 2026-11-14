import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile('index.html', 'utf8');
const source = (await readFile('app.js', 'utf8')).replace(/import .*?;\n/g, '');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function setup({ existing = false, palette = 'monochrome', failSave = false } = {}) {
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
  window.matchMedia = () => ({ matches: true });
  window.requestAnimationFrame = cb => cb();
  window.createClient = () => db;
  window.eval(source);
  const $ = id => window.document.getElementById(id);
  const click = async id => { $(id).click(); await tick(); };
  const submit = async id => { $(id).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await tick(); };
  const choose = async (container, value) => { const input = $(container).querySelector(`input[value="${value}"]`); input.checked = true; input.dispatchEvent(new window.Event('change', { bubbles: true })); await tick(); };
  return { $, click, submit, choose, getProfile: () => storedProfile, getMetadata: () => metadata, getSignUps: () => signUps, document: window.document };
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
  const { $, click, document } = await setup({ existing: true, palette: 'forest' }); await click('play');
  assert.equal($('dashboard-screen').hidden, false); assert.match($('dashboard-title').textContent, /Player/);
  assert.equal(document.querySelector('.landing').dataset.palette, 'forest');
});

test('failed palette save reverts selection and reports error', async () => {
  const { $, click, choose, getMetadata, document } = await setup({ existing: true, palette: 'forest', failSave: true });
  await click('play'); await choose('dashboard-palettes', 'wood');
  assert.equal(document.querySelector('.landing').dataset.palette, 'forest');
  assert.equal(getMetadata().palette, 'forest'); assert.match($('dashboard-message').textContent, /Не удалось/);
  assert.equal($('dashboard-palettes').querySelector('input[value="forest"]').checked, true);
});
