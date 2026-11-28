import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentOf } from '../src/money.mjs';
import { buildInvoice } from '../src/invoice.mjs';
import { buildRefund } from '../src/refund.mjs';

const ORDER = {
  number: 1042, currency: 'USD', taxRateBasisPoints: 825,
  lines: [{ sku: 'notebook', qty: 1, unitPrice: '12.49' }, { sku: 'pens', qty: 2, unitPrice: '3.75' }],
};

test('tax of half a cent or more rounds up to the next cent', () => {
  assert.equal(percentOf(1999, 825), 165);
  assert.equal(percentOf(350, 700), 25);
  assert.equal(percentOf(1010, 825), 83);
  assert.equal(buildInvoice(ORDER).totalCents, 2164);
  assert.equal(buildRefund(ORDER, [{ sku: 'pens', qty: 2 }]).taxCents, 62);
});
