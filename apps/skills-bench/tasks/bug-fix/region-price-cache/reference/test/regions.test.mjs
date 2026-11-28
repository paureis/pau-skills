import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { priceFor, clearPrices } from '../src/prices.mjs';
import { priceCart, parseItem } from '../src/cart.mjs';

beforeEach(() => clearPrices());

test('a product priced in two regions gets each region its own price', () => {
  assert.equal(priceFor('lamp', 'us').grossCents, 3900);
  const eu = priceFor('lamp', 'eu');
  assert.deepEqual([eu.grossCents, eu.currency], [4200, 'EUR']);
  assert.equal(priceFor('Lamp', 'us').currency, 'USD');
});

test('the same cart priced in two regions', () => {
  const items = [parseItem('lamp'), parseItem('mug:2')];
  assert.equal(priceCart(items, 'us').totalCents, 6300);
  assert.equal(priceCart(items, 'uk').totalCents, 6000);
});
