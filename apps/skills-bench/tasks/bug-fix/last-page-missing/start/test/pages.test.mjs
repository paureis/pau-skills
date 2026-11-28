import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageCount, pageOf, pageHeader, formatCents, orderLine } from '../src/pages.mjs';

const items = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('full pages are counted', () => {
  assert.equal(pageCount(20, 10), 2);
  assert.equal(pageCount(0, 10), 0);
  assert.throws(() => pageCount(20, 0), /page size must be a whole number above 0/);
});

test('a page holds its slice of the items', () => {
  assert.deepEqual(pageOf(items(30), 1, 10), items(10));
  assert.deepEqual(pageOf(items(30), 3, 10), [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
});

test('a page out of range is refused', () => {
  assert.throws(() => pageOf(items(20), 0, 10), /no page 0: there are 2 pages/);
  assert.throws(() => pageOf(items(20), 3, 10), /no page 3: there are 2 pages/);
});

test('the header names the page and the count', () => {
  assert.equal(pageHeader(2, 30, 10), 'Page 2 of 3 (30 orders)');
});

test('an order prints as one line', () => {
  assert.equal(formatCents(4250), '42.50');
  assert.equal(formatCents(7), '0.07');
  assert.equal(orderLine({ id: 'A-1001', customer: 'Harbor Books', totalCents: 4250, currency: 'EUR' }),
    'A-1001  Harbor Books              42.50 EUR');
});
