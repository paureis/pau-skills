import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCode, findDiscount } from '../src/discounts.js';
import { formatMoney } from '../src/money.js';

test('a percent code is described with its share and last day', () => {
  assert.equal(describeCode('SAVE10'), '10% off, until 2026-12-31');
});

test('a fixed code is described with its amount', () => {
  assert.equal(describeCode('FIVEOFF'), '5.00 EUR off, until 2026-09-30');
});

test('a code not in the table has no description', () => {
  assert.equal(describeCode('NOPE42'), null);
});

test('text that cannot be a code is refused', () => {
  assert.throws(() => describeCode('no'), { code: 'BAD_FORMAT' });
});

test('amounts print with two decimals and the currency', () => {
  assert.equal(formatMoney({ cents: 1234, currency: 'EUR' }), '12.34 EUR');
  assert.equal(formatMoney({ cents: -50, currency: 'GBP' }), '-0.50 GBP');
});

test('a typed code is found whatever its case and the spaces around it', () => {
  assert.deepEqual(findDiscount(' save10 ', '2026-06-01'), { code: 'SAVE10', kind: 'percent', percent: 10, expires: '2026-12-31' });
});

test('a code that is not in the table is refused', () => {
  assert.throws(() => findDiscount('FREEBIE', '2026-06-01'), { code: 'UNKNOWN_CODE' });
});

test('a code still works on its last day and not after it', () => {
  assert.equal(findDiscount('FIVEOFF', '2026-09-30').code, 'FIVEOFF');
  assert.throws(() => findDiscount('FIVEOFF', '2026-10-01'), { code: 'EXPIRED' });
});
