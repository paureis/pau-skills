import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCart, addItem, cartTotal } from '../src/cart.js';
import { findDiscount } from '../src/discounts.js';

const cartOf = (currency, ...prices) => {
  const cart = createCart(currency);
  prices.forEach((unitCents, i) => addItem(cart, { sku: `P${i}`, name: `Product ${i}`, unitCents }));
  return cart;
};
const eur = (cents) => ({ cents, currency: 'EUR' });
const DAY = '2026-06-15';

test('findDiscount ignores case and the spaces around the code', () => {
  for (const typed of ['SAVE10', 'save10', ' Save10 ']) {
    const d = findDiscount(typed, DAY);
    assert.equal(d.code, 'SAVE10');
    assert.equal(d.kind, 'percent');
    assert.equal(d.percent, 10);
  }
});

test('findDiscount refuses a code that is not in the table', () => {
  assert.throws(() => findDiscount('HALFOFF', DAY), { code: 'UNKNOWN_CODE' });
});

test('a code works up to and on its last day, and not the day after', () => {
  assert.equal(findDiscount('FIVEOFF', '2026-09-29').code, 'FIVEOFF');
  assert.equal(findDiscount('FIVEOFF', '2026-09-30').code, 'FIVEOFF');
  assert.throws(() => findDiscount('FIVEOFF', '2026-10-01'), { code: 'EXPIRED' });
  assert.throws(() => cartTotal(cartOf('EUR', 4000), 'fiveoff', '2026-10-01'), { code: 'EXPIRED' });
});

test('no code means no discount', () => {
  for (const code of [null, undefined, '']) {
    assert.deepEqual(cartTotal(cartOf('EUR', 1250, 499), code, DAY), { subtotal: eur(1749), discount: eur(0), total: eur(1749) });
  }
});

test('a percent code takes its share of the subtotal, rounded to the nearest cent', () => {
  assert.deepEqual(cartTotal(cartOf('EUR', 1999, 1000), 'SAVE10', DAY), { subtotal: eur(2999), discount: eur(300), total: eur(2699) });
  assert.deepEqual(cartTotal(cartOf('EUR', 1004), 'SAVE10', DAY).discount, eur(100));
});

test('half a cent rounds up', () => {
  assert.deepEqual(cartTotal(cartOf('EUR', 1005), 'save10', DAY).discount, eur(101));
  assert.deepEqual(cartTotal(cartOf('EUR', 1002), 'WINTER25', DAY).discount, eur(251));
});

test('a fixed code takes its amount off', () => {
  assert.deepEqual(cartTotal(cartOf('EUR', 1250, 499), 'FIVEOFF', DAY), { subtotal: eur(1749), discount: eur(500), total: eur(1249) });
});

test('a fixed code larger than the subtotal brings the total to zero, not below', () => {
  assert.deepEqual(cartTotal(cartOf('EUR', 300), 'FIVEOFF', DAY), { subtotal: eur(300), discount: eur(300), total: eur(0) });
});

test('a fixed code in another currency is refused', () => {
  assert.throws(() => cartTotal(cartOf('GBP', 3000), 'FIVEOFF', DAY), { code: 'WRONG_CURRENCY' });
});

test('an unknown code at checkout is refused, not ignored', () => {
  assert.throws(() => cartTotal(cartOf('EUR', 3000), 'HALFOFF', DAY), { code: 'UNKNOWN_CODE' });
});
