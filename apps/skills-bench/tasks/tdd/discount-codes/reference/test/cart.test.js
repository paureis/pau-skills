import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, removeItem, subtotal, cartTotal } from '../src/cart.js';

const mug = { sku: 'MUG-1', name: 'Mug', unitCents: 1250 };
const tea = { sku: 'TEA-2', name: 'Green tea', unitCents: 499 };

test('the subtotal is each price times its quantity, in the cart currency', () => {
  const cart = addItem(addItem(createCart('EUR'), mug, 2), tea);
  assert.deepEqual(subtotal(cart), { cents: 2999, currency: 'EUR' });
});

test('adding an item already in the cart raises its quantity', () => {
  const cart = addItem(addItem(createCart('EUR'), mug), mug, 3);
  assert.equal(cart.lines.length, 1);
  assert.equal(cart.lines[0].qty, 4);
});

test('an empty cart costs nothing', () => {
  assert.deepEqual(subtotal(createCart('GBP')), { cents: 0, currency: 'GBP' });
});

test('a removed line no longer counts', () => {
  const cart = removeItem(addItem(addItem(createCart('EUR'), mug), tea), 'MUG-1');
  assert.deepEqual(subtotal(cart), { cents: 499, currency: 'EUR' });
});

test('a bad quantity, price or currency is refused', () => {
  assert.throws(() => addItem(createCart('EUR'), mug, 0), RangeError);
  assert.throws(() => addItem(createCart('EUR'), mug, 100), RangeError);
  assert.throws(() => addItem(createCart('EUR'), { ...mug, unitCents: 12.5 }), RangeError);
  assert.throws(() => createCart('XYZ'), RangeError);
});

const cartOf = (currency, ...prices) => {
  const cart = createCart(currency);
  prices.forEach((unitCents, i) => addItem(cart, { sku: `SKU-${i}`, name: `Item ${i}`, unitCents }));
  return cart;
};
const eur = (cents) => ({ cents, currency: 'EUR' });

test('with no code the total is the subtotal', () => {
  assert.deepEqual(cartTotal(cartOf('EUR', 2999), null, '2026-06-01'), { subtotal: eur(2999), discount: eur(0), total: eur(2999) });
  assert.deepEqual(cartTotal(cartOf('EUR', 2999), '  ', '2026-06-01').total, eur(2999));
});

test('a percent code takes its share off, rounded to the nearest cent', () => {
  assert.deepEqual(cartTotal(cartOf('EUR', 2999), 'SAVE10', '2026-06-01'), { subtotal: eur(2999), discount: eur(300), total: eur(2699) });
});

test('half a cent of discount rounds up', () => {
  assert.deepEqual(cartTotal(cartOf('EUR', 1005), 'SAVE10', '2026-06-01').discount, eur(101));
});

test('a fixed code takes its amount off', () => {
  assert.deepEqual(cartTotal(cartOf('EUR', 1250, 499), 'FIVEOFF', '2026-06-01').total, eur(1249));
});

test('a fixed code never takes the total below zero', () => {
  assert.deepEqual(cartTotal(cartOf('EUR', 300), 'FIVEOFF', '2026-06-01'), { subtotal: eur(300), discount: eur(300), total: eur(0) });
});

test('a fixed code in another currency is refused', () => {
  assert.throws(() => cartTotal(cartOf('GBP', 3000), 'FIVEOFF', '2026-06-01'), { code: 'WRONG_CURRENCY' });
});

test('an unknown or expired code is refused at checkout', () => {
  assert.throws(() => cartTotal(cartOf('EUR', 3000), 'FREEBIE', '2026-06-01'), { code: 'UNKNOWN_CODE' });
  assert.throws(() => cartTotal(cartOf('EUR', 3000), 'FIVEOFF', '2026-10-01'), { code: 'EXPIRED' });
});
