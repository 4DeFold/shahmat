import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probabilities, updateRating, divisionAfter } from './rank.js';

test('Davidson probabilities sum to one and reverse symmetrically', () => {
  const a = probabilities(1200, 800), b = probabilities(800, 1200);
  assert.ok(Math.abs(a.win + a.draw + a.loss - 1) < 1e-12);
  assert.ok(Math.abs(a.win - b.loss) < 1e-12);
  assert.ok(Math.abs(a.draw - b.draw) < 1e-12);
  assert.ok(Math.abs(probabilities(1000, 1000).draw - 0.9 / 2.9) < 1e-12);
});
test('weights, calibration step and draws', () => {
  assert.equal(updateRating(1000, 1000, 0, 0.5, 'classic'), 1000);
  assert.equal(updateRating(1000, 1000, 0, 1, 'classic'), 1024);
  assert.equal(updateRating(1000, 1000, 0, 1, 'bullet'), 1014.4);
  assert.equal(updateRating(1000, 1000, 0, 1, 'bot'), 1000);
  assert.equal(updateRating(1000, 1000, 0, 0, 'friendly'), 1000);
  assert.ok(updateRating(1000, 1000, 100, 1, 'classic') < 1024);
});
test('division hysteresis works in both directions, including multiple levels', () => {
  assert.equal(divisionAfter(1039, 1), 1);
  assert.equal(divisionAfter(1040, 1), 2);
  assert.equal(divisionAfter(920, 2), 2);
  assert.equal(divisionAfter(919, 2), 1);
  assert.equal(divisionAfter(2200, 0), 7);
  assert.equal(divisionAfter(0, 7), 0);
});
test('invalid inputs do not silently become ratings', () => {
  assert.throws(() => probabilities(NaN, 1000));
  assert.throws(() => updateRating(1000, 1000, -1, 1, 'classic'));
  assert.throws(() => updateRating(1000, 1000, 0, 0.7, 'classic'));
  assert.throws(() => updateRating(1000, 1000, 0, 1, 'unknown'));
  assert.throws(() => divisionAfter(1000, 8));
});
