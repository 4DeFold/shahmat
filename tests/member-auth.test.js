import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyMember } from '../pages/member-auth.js';

const user = { id: 'user-1' };
test('guest is not admitted and no remote user lookup is needed', async () => {
  assert.equal(await verifyMember({ getSession: async () => ({ data: { session: null } }), getUser: () => { throw Error('unexpected'); } }), null);
});
test('only a verified user matching the current session is admitted', async () => {
  const session = { user };
  assert.equal(await verifyMember({ getSession: async () => ({ data: { session } }), getUser: async () => ({ data: { user } }) }), user);
  await assert.rejects(verifyMember({ getSession: async () => ({ data: { session } }), getUser: async () => ({ data: { user: { id: 'user-2' } } }) }), /Account changed/);
  await assert.rejects(verifyMember({ getSession: async () => ({ data: { session } }), getUser: async () => ({ error: Error('offline') }) }), /offline/);
  await assert.rejects(verifyMember({ getSession: async () => ({ error: Error('offline') }) }), /offline/);
});
