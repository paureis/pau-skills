import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, formatDate, addMonths, nextRenewal, renewalSchedule, daysUntil } from '../src/renewal.mjs';

const day = (text) => parseDate(text);

test('a date reads and prints back the same', () => {
  assert.equal(formatDate(day('2025-03-15')), '2025-03-15');
});

test('a day that does not exist is refused', () => {
  assert.throws(() => day('2025-02-30'), /no such day: 2025-02-30/);
  assert.throws(() => day('15/03/2025'), /not a date/);
});

test('adding months keeps the day of the month', () => {
  assert.equal(formatDate(addMonths(day('2025-01-30'), 2)).slice(0, 7), '2025-03');
  assert.equal(formatDate(addMonths(day('2025-11-20'), 3)), '2026-02-20');
});

test('each plan renews after its number of months', () => {
  assert.equal(formatDate(nextRenewal(day('2025-03-15'), 'monthly')), '2025-04-15');
  assert.equal(formatDate(nextRenewal(day('2025-03-15'), 'quarterly')), '2025-06-15');
  assert.equal(formatDate(nextRenewal(day('2025-03-15'), 'yearly')), '2026-03-15');
  assert.throws(() => nextRenewal(day('2025-03-15'), 'weekly'), /unknown plan: weekly/);
});

test('a schedule lists the next renewals from the start date', () => {
  assert.deepEqual(renewalSchedule(day('2025-01-10'), 'quarterly', 3).map(formatDate), ['2025-04-10', '2025-07-10', '2025-10-10']);
  assert.throws(() => renewalSchedule(day('2025-01-10'), 'monthly', 0), /count must be/);
});

test('days until counts whole days', () => {
  assert.equal(daysUntil(day('2025-03-01'), day('2025-03-31')), 30);
});
