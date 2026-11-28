import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoice, renderInvoice } from '../src/invoice.mjs';
import { buildRefund, parseReturn } from '../src/refund.mjs';

const order = {
  number: 7,
  currency: 'EUR',
  taxRateBasisPoints: 2000,
  lines: [
    { sku: 'mug', name: 'Stoneware mug', qty: 2, unitPrice: '9.50' },
    { sku: 'tea', name: 'Green tea, 50 g', qty: 1, unitPrice: '6' },
  ],
};

test('an invoice adds the lines, the tax and the total', () => {
  const inv = buildInvoice(order);
  assert.deepEqual([inv.subtotalCents, inv.taxCents, inv.totalCents], [2500, 500, 3000]);
  assert.equal(renderInvoice(inv).split('\n').at(-1), 'Total                              30.00 EUR');
});

test('an order with a bad line is refused', () => {
  assert.throws(() => buildInvoice({ ...order, lines: [{ sku: 'mug', qty: 0, unitPrice: '9.50' }] }), /qty must be 1 or more/);
  assert.throws(() => buildInvoice({ ...order, lines: [] }), /order 7 has no lines/);
});

test('a refund pays back the goods and their tax', () => {
  const r = buildRefund(order, [parseReturn('mug:1')]);
  assert.deepEqual([r.goodsCents, r.taxCents, r.totalCents], [950, 190, 1140]);
});

test('a refund cannot return more than was bought', () => {
  assert.throws(() => buildRefund(order, [parseReturn('mug:2'), parseReturn('mug:1')]), /has only 0 more mug to return/);
  assert.throws(() => buildRefund(order, [parseReturn('cup:1')]), /order 7 has no cup/);
  assert.throws(() => parseReturn('mug'), /not a return/);
});
