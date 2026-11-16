import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cachedUserId, startSessionMonitor } from '../pages/member-session.js';
const user = { id: 'user-1' };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function setup({ session = { user }, userResult = { data: { user } }, cachedId = user.id } = {}) {
  const pending = deferred(); let handler;
  const events = [];
  const auth = {
    getSession: () => pending.promise,
    getUser: async () => userResult,
    onAuthStateChange: fn => { handler = fn; },
  };
  const monitor = startSessionMonitor({ auth, cachedId, open: id => events.push(`open:${id}`), logout: () => events.push('logout'), accountChanged: () => events.push('changed') });
  return { events, monitor, resolve: (result = { data: { session } }) => pending.resolve(result), emit: (event, data) => handler(event, data) };
}
test('cached game opens synchronously without awaiting either auth request', async () => {
  const app = setup();
  assert.deepEqual(app.events, ['open:user-1']);
  app.resolve(); await app.monitor.verification;
  assert.deepEqual(app.events, ['open:user-1']);
});
test('missing session or explicit unauthorized result redirects; server errors do not', async () => {
  const missing = setup(); missing.resolve({ data: { session: null } }); await missing.monitor.verification;
  assert.deepEqual(missing.events, ['open:user-1', 'logout']);
  const forbidden = setup({ userResult: { error: { status: 401 } } }); forbidden.resolve(); await forbidden.monitor.verification;
  assert.deepEqual(forbidden.events, ['open:user-1', 'logout']);
  const offline = setup({ userResult: { error: { status: 503 } } }); offline.resolve(); await offline.monitor.verification;
  assert.deepEqual(offline.events, ['open:user-1']);
  const getSessionOffline = setup(); getSessionOffline.resolve({ error: { status: 503 } }); await getSessionOffline.monitor.verification;
  assert.deepEqual(getSessionOffline.events, ['open:user-1']);
});
test('uncached session starts when available; signout leaves; account change reloads', async () => {
  const cold = setup({ cachedId: null }); assert.deepEqual(cold.events, []);
  cold.resolve(); await cold.monitor.verification; assert.deepEqual(cold.events, ['open:user-1']);
  cold.emit('SIGNED_OUT', null); assert.deepEqual(cold.events, ['open:user-1', 'logout']);
  const changed = setup(); changed.emit('SIGNED_IN', { user: { id: 'user-2' } });
  changed.resolve(); await changed.monitor.verification; assert.deepEqual(changed.events, ['open:user-1', 'changed']);
});
test('cached identity needs a token and inaccessible storage is tolerated', () => {
  const stored = data => ({ getItem: () => JSON.stringify(data) });
  assert.equal(cachedUserId(stored({ user, access_token: 'token' })), 'user-1');
  assert.equal(cachedUserId(stored({ user })), null);
  assert.equal(cachedUserId({ getItem() { throw Error('blocked'); } }), null);
});
