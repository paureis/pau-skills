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

test('typed hours and minutes become seconds', () => {
  assert.equal(parseDuration('1h30m'), 5400);
  assert.equal(parseDuration('45s'), 45);
});

test('units can be upper case', () => {
  assert.equal(parseDuration('2H'), 7200);
});

test('spaces between and around the parts are fine', () => {
  assert.equal(parseDuration(' 1h 30m '), 5400);
});

test('a part can have a decimal point', () => {
  assert.equal(parseDuration('1.5h'), 5400);
});

test('a bare number means seconds', () => {
  assert.equal(parseDuration('90'), 90);
});

test('the total is rounded to the nearest second, halves up', () => {
  assert.equal(parseDuration('2.6s'), 3);
  assert.equal(parseDuration('0.5s'), 1);
});

test('blank text, an unknown unit or junk is refused', () => {
  for (const text of ['', '   ', '5d', '1h 5d', 'abc', '1h30']) {
    assert.throws(() => parseDuration(text), RangeError, JSON.stringify(text));
  }
});
