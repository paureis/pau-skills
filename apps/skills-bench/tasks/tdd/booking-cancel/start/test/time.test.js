import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMs, hoursBetween, addHours, onTheHour, overlaps, isWeekend, dayStart, formatInstant } from '../src/time.js';

test('instants are read only as UTC ISO strings', () => {
  assert.equal(toMs('2026-03-02T09:00:00Z'), Date.UTC(2026, 2, 2, 9));
  assert.equal(toMs('2026-03-02T09:00Z'), Date.UTC(2026, 2, 2, 9));
  for (const bad of ['2026-03-02 09:00', '2026-03-02T09:00:00+01:00', '', 1700000000000]) {
    assert.throws(() => toMs(bad), RangeError, String(bad));
  }
});

test('hours between two instants are negative going backwards', () => {
  assert.equal(hoursBetween('2026-03-02T09:00:00Z', '2026-03-02T11:30:00Z'), 2.5);
  assert.equal(hoursBetween('2026-03-02T11:00:00Z', '2026-03-02T09:00:00Z'), -2);
});

test('adding hours crosses midnight', () => {
  assert.equal(addHours('2026-03-02T23:00:00Z', 2), '2026-03-03T01:00:00Z');
});

test('on the hour means no minutes or seconds', () => {
  assert.equal(onTheHour('2026-03-02T09:00:00Z'), true);
  assert.equal(onTheHour('2026-03-02T09:30:00Z'), false);
});

test('spans that only touch do not overlap', () => {
  assert.equal(overlaps('2026-03-02T09:00Z', '2026-03-02T11:00Z', '2026-03-02T10:00Z', '2026-03-02T12:00Z'), true);
  assert.equal(overlaps('2026-03-02T09:00Z', '2026-03-02T11:00Z', '2026-03-02T11:00Z', '2026-03-02T12:00Z'), false);
});

test('Saturday and Sunday are the weekend', () => {
  assert.equal(isWeekend('2026-03-06T23:00:00Z'), false);
  assert.equal(isWeekend('2026-03-07T00:00:00Z'), true);
  assert.equal(isWeekend('2026-03-08T23:00:00Z'), true);
});

test('a day starts at midnight UTC and instants print as day and time', () => {
  assert.equal(dayStart('2026-03-02'), '2026-03-02T00:00:00Z');
  assert.throws(() => dayStart('2 March'), RangeError);
  assert.equal(formatInstant('2026-03-02T09:00Z'), '2026-03-02 09:00');
});
