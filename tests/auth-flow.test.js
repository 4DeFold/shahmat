import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile('index.html', 'utf8');
const source = (await readFile('app.js', 'utf8')).replace(/import .*?;\n/g, '');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function setup(existing = false) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com' });
  const { window } = dom;
  let currentUser = existing ? { id: 'user-1' } : null;
  let storedProfile = existing ? { username: 'Player', bio: '', palette: 'monochrome' } : null;
  let signUps = 0;
  const db = {
    auth: {
      getSession: async () => ({ data: { session: currentUser ? { user: currentUser } : null } }),
      getUser: async () => ({ data: { user: currentUser } }),
      signUp: async () => { signUps++; currentUser = { id: 'user-1' }; return { data: { session: { user: currentUser } } }; },
      signInWithPassword: async () => { currentUser = { id: 'user-1' }; return { data: { session: { user: currentUser } } }; },
      signOut: async () => { currentUser = null; return {}; }
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
  return { $, click, submit, getProfile: () => storedProfile, getSignUps: () => signUps };
}

test('registration continues through required profile, palette, editing and logout', async () => {
  const { $, click, submit, getProfile, getSignUps } = await setup();
  await click('play'); assert.equal($('auth-screen').hidden, false);
  await click('tab-signup'); $('email').value = 'player@example.com'; $('password').value = 'secret123';
  await submit('auth-form'); assert.equal(getSignUps(), 1); assert.equal($('profile-screen').hidden, false);
  assert.equal($('username').required, true);
  assert.equal($('profile-screen').querySelector('.signout'), null);
  assert.doesNotMatch($('profile-screen').textContent, /ШАГ 01/);
  $('username').value = 'Player_1'; $('bio').value = 'Chess'; await submit('profile-form');
  assert.equal(getProfile().username, 'Player_1'); assert.equal(getProfile().palette, 'monochrome');
  assert.equal($('palette-screen').hidden, false); await submit('palette-form');
  assert.equal($('account-screen').hidden, false); assert.match($('account-title').textContent, /Player_1/);
  await click('edit-profile'); $('bio').value = 'Updated'; await submit('profile-form');
  assert.equal(getProfile().bio, 'Updated'); assert.equal($('account-screen').hidden, false);
  $('account-screen').querySelector('.signout').click(); await tick(); assert.equal($('auth-screen').hidden, false);
});

test('existing session opens profile rather than registration', async () => {
  const { $, click } = await setup(true); await click('play');
  assert.equal($('account-screen').hidden, false); assert.match($('account-title').textContent, /Player/);
});
