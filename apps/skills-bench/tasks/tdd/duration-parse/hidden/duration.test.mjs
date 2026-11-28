import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, parseDuration } from '../src/duration.js';

test('hours, minutes and seconds add up', () => {
  assert.equal(parseDuration('1h30m'), 5400);
  assert.equal(parseDuration('45s'), 45);
  assert.equal(parseDuration('2h5m10s'), 7510);
});

test('units are read in either case', () => {
  assert.equal(parseDuration('2H'), 7200);
  assert.equal(parseDuration('1H30M'), 5400);
});

test('spaces between and around the parts are allowed', () => {
  assert.equal(parseDuration(' 1h 30m '), 5400);
  assert.equal(parseDuration('1m 5s'), 65);
});

test('a part may have a decimal point', () => {
  assert.equal(parseDuration('1.5h'), 5400);
  assert.equal(parseDuration('0.5m'), 30);
});

test('a bare number is seconds', () => {
  assert.equal(parseDuration('90'), 90);
  assert.equal(parseDuration('0'), 0);
});

test('the total is rounded to the nearest whole second, halves up', () => {
  assert.equal(parseDuration('2.6s'), 3);
  assert.equal(parseDuration('2.4s'), 2);
  assert.equal(parseDuration('0.5s'), 1);
});

test('anything else throws a RangeError', () => {
  for (const text of ['', '   ', '5d', '1h 5d', 'abc', '1h30']) {
    assert.throws(() => parseDuration(text), RangeError, JSON.stringify(text));
  }
});

test('what formatDuration prints reads back as the same seconds', () => {
  for (const seconds of [0, 59, 3605, 5405, 86399]) assert.equal(parseDuration(formatDuration(seconds)), seconds);
});
