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

test('cartTotal exists', () => {
  assert.equal(typeof cartTotal, 'function');
});
