import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localStorageOrNull, randomUUID} from '../pages/browser-compat.js';

test('blocked localStorage getter is tolerated', () => {
  assert.equal(localStorageOrNull({get localStorage(){throw new Error('blocked');}}), null);
  const storage={}; assert.equal(localStorageOrNull({localStorage:storage}),storage);
});
test('UUID fallback uses cryptographic bytes with correct version and variant', () => {
  assert.equal(randomUUID({randomUUID:()=> 'native'}), 'native');
  assert.equal(randomUUID({getRandomValues(bytes){bytes.fill(255);return bytes;}}), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.throws(()=>randomUUID({}), /случайных чисел/);
});
