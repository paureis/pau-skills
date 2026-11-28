import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, parseDuration } from '../src/duration.js';

test('hours, minutes and seconds are printed largest first', () => {
  assert.equal(formatDuration(5405), '1h 30m 5s');
  assert.equal(formatDuration(59), '59s');
  assert.equal(formatDuration(7200), '2h');
});

test('parts that are zero are left out', () => {
  assert.equal(formatDuration(3605), '1h 5s');
  assert.equal(formatDuration(120), '2m');
});

test('zero seconds prints 0s', () => {
  assert.equal(formatDuration(0), '0s');
});

test('a negative or fractional number of seconds is refused', () => {
  assert.throws(() => formatDuration(-1), RangeError);
  assert.throws(() => formatDuration(1.5), RangeError);
  assert.throws(() => formatDuration('60'), RangeError);
});

test('parseDuration exists', () => {
  assert.equal(typeof parseDuration, 'function');
});
