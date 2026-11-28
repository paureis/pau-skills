import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, formatDate, addMonths, nextRenewal } from '../src/renewal.mjs';

test('a renewal from a day the target month lacks lands on that month\'s last day', () => {
  assert.equal(formatDate(nextRenewal(parseDate('2025-01-31'), 'monthly')), '2025-02-28');
  assert.equal(formatDate(nextRenewal(parseDate('2024-01-31'), 'monthly')), '2024-02-29');
  assert.equal(formatDate(addMonths(parseDate('2025-08-31'), 1)), '2025-09-30');
  assert.equal(formatDate(addMonths(parseDate('2025-08-31'), 2)), '2025-10-31');
});
