import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDay, addDays, daysBetween, weekday, eachDay, monthDays, parseMonth } from '../src/dates.mjs';

test('days are checked as they are read', () => {
  assert.equal(parseDay(' 2025-06-13 '), '2025-06-13');
  assert.throws(() => parseDay('2025-02-29'), /no such day: 2025-02-29/);
  assert.throws(() => parseDay('13.06.2025'), /not a day/);
});

test('days add up across months and years', () => {
  assert.equal(addDays('2025-06-30', 1), '2025-07-01');
  assert.equal(addDays('2025-01-01', -1), '2024-12-31');
  assert.equal(daysBetween('2025-06-13', '2025-06-16'), 3);
});

test('each day has its weekday', () => {
  assert.equal(weekday('2025-06-13'), 'Fri');
  assert.equal(weekday('2025-06-15'), 'Sun');
});

test('a range of days holds both ends', () => {
  assert.equal(eachDay('2025-06-29', '2025-07-02')[0], '2025-06-29');
});

test('a month lists all its days', () => {
  assert.ok(monthDays(2025, 2).length >= 27);
  assert.equal(monthDays(2024, 2)[0], '2024-02-01');
  assert.deepEqual(parseMonth('2025-06'), { year: 2025, month: 6 });
  assert.throws(() => parseMonth('2025-13'), /not a month/);
});
