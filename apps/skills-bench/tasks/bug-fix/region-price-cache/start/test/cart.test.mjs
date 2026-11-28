import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseItem, priceCart, renderCart } from '../src/cart.mjs';
import { clearPrices } from '../src/prices.mjs';

beforeEach(() => clearPrices());

test('cart items read as sku and quantity', () => {
  assert.deepEqual(parseItem('lamp:2'), { sku: 'lamp', qty: 2 });
  assert.deepEqual(parseItem('mug'), { sku: 'mug', qty: 1 });
  assert.throws(() => parseItem('lamp:0'), /not a cart item/);
});

test('a cart adds up its lines at customer prices', () => {
  const cart = priceCart([parseItem('lamp'), parseItem('mug:2')], 'uk');
  assert.equal(cart.totalCents, 6000);
  assert.equal(cart.currency, 'GBP');
});

test('a cart prints one line per item and the total', () => {
  assert.equal(renderCart(priceCart([parseItem('tote:3')], 'us')), [
    'Cart in United States',
    '   3 x Canvas tote            54.00 USD',
    '  Total                       54.00 USD',
  ].join('\n'));
});
