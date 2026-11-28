import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatAmount, checkCurrency, percentOf, sumCents } from '../src/money.mjs';

test('amounts read as whole cents', () => {
  assert.equal(parseAmount('19.99'), 1999);
  assert.equal(parseAmount('5'), 500);
  assert.equal(parseAmount('0.5'), 50);
  assert.throws(() => parseAmount('1.999'), /not an amount/);
  assert.throws(() => parseAmount('-3'), /not an amount/);
});

test('amounts print with two decimals and the currency', () => {
  assert.equal(formatAmount(1999, 'USD'), '19.99 USD');
  assert.equal(formatAmount(7, 'EUR'), '0.07 EUR');
  assert.equal(formatAmount(-250, 'USD'), '-2.50 USD');
  assert.throws(() => checkCurrency('usd'), /not a currency code/);
});

test('a rate in basis points gives whole cents', () => {
  assert.equal(percentOf(2000, 825), 165);
  assert.ok(Math.abs(percentOf(1010, 825) - 83) <= 1, 'within a cent');
  assert.equal(percentOf(0, 825), 0);
  assert.throws(() => percentOf(1000, 10_001), /tax rate must be whole basis points/);
  assert.throws(() => percentOf(10.5, 825), /cents must be a whole number/);
});

test('cents add up', () => {
  assert.equal(sumCents([1249, 750]), 1999);
  assert.equal(sumCents([]), 0);
});
