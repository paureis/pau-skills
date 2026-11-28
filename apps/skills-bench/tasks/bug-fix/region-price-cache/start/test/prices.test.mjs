import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { catalogReads, regionOf } from '../src/catalog.mjs';
import { priceFor, clearPrices, normalizeSku, formatCents } from '../src/prices.mjs';

beforeEach(() => clearPrices());

test('a price is the net price plus the region tax', () => {
  const p = priceFor('lamp', 'eu');
  assert.deepEqual([p.netCents, p.taxCents, p.grossCents, p.currency], [3500, 700, 4200, 'EUR']);
  assert.equal(priceFor('notebook', 'eu').grossCents, 1559);
});

test('the US price has no tax added', () => {
  assert.equal(priceFor('mug', 'us').grossCents, 1200);
});

test('each price is read from the catalog once', () => {
  const before = catalogReads();
  priceFor('tote', 'uk');
  priceFor('tote', 'uk');
  priceFor(' Tote', 'uk');
  assert.equal(catalogReads() - before, 1);
});

test('product codes are matched without case or spaces', () => {
  assert.equal(normalizeSku('  Lamp '), 'lamp');
});

test('unknown products and regions are refused', () => {
  assert.throws(() => priceFor('chair', 'us'), /unknown product: chair/);
  assert.throws(() => regionOf('mars'), /unknown region: mars \(us, eu, uk\)/);
});

test('cents print with two decimals', () => {
  assert.equal(formatCents(4200, 'EUR'), '42.00 EUR');
  assert.equal(formatCents(1559, 'EUR'), '15.59 EUR');
});
