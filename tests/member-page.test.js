import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { verifyMember } from '../pages/member-auth.js';
const html = await readFile('pages/game.html', 'utf8');
const js = (await readFile('pages/game.js', 'utf8')).replace(/^import .*;\n/gm, '').replace("import('./member-game.js')", 'getMemberModule()');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
async function setup({ session = null, verified = null, error = null } = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com/game' });
  let callback, starts = [];
  dom.window.verifyMember = verifyMember;
  dom.window.createClient = () => ({ auth: {
    getSession: async () => error ? { error } : { data: { session } },
    getUser: async () => ({ data: { user: verified } }),
    onAuthStateChange: fn => { callback = fn; },
  } });
  dom.window.getMemberModule = async () => ({ startMemberGame: async id => { starts.push(id); } });
  dom.window.eval(js);
  await tick();
  return { dom, document: dom.window.document, starts, emit: s => callback('SIGNED_OUT', s) };
}
test('guest is prompted to sign in, and the demo remains a separate link', async () => {
  const app = await setup();
  assert.equal(app.document.querySelector('#gate-login').hidden, false);
  assert.equal(app.document.querySelector('#member-game').hidden, true);
  assert.equal(app.document.querySelector('.demo-link').getAttribute('href'), '/play');
  assert.deepEqual(app.starts, []); app.dom.window.close();
});
test('verified account opens its own page and a session change hides it', async () => {
  const user = { id: 'one' };
  const app = await setup({ session: { user }, verified: user });
  assert.equal(app.document.querySelector('#member-game').hidden, false);
  assert.deepEqual(app.starts, ['one']);
  app.emit(null);
  assert.equal(app.document.querySelector('#member-game').hidden, true);
  assert.equal(app.document.querySelector('#gate-login').hidden, false);
  app.dom.window.close();
});
test('account errors and mismatched identity fail closed', async () => {
  for (const config of [{ error: new Error('offline') }, { session: { user: { id: 'one' } }, verified: { id: 'two' } }]) {
    const app = await setup(config);
    assert.equal(app.document.querySelector('#member-game').hidden, true);
    assert.equal(app.document.querySelector('#gate-retry').hidden, false);
    assert.deepEqual(app.starts, []); app.dom.window.close();
  }
});
