import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentOf, splitHours, priceFor, refundFor } from '../src/pricing.js';
import { getRoom } from '../src/rooms.js';
import { createStore, book } from '../src/bookings.js';
import { addHours } from '../src/time.js';

test('weekday hours cost the hourly price', () => {
  assert.deepEqual(priceFor(getRoom('oak'), '2026-03-02T09:00:00Z', '2026-03-02T12:00:00Z'), { cents: 7500, currency: 'EUR' });
});

test('weekend hours cost a quarter more, rounded half up', () => {
  assert.deepEqual(priceFor(getRoom('pine'), '2026-03-07T09:00:00Z', '2026-03-07T11:00:00Z'), { cents: 4998, currency: 'EUR' });
});

test('a booking from Friday night into Saturday splits its hours', () => {
  assert.deepEqual(splitHours('2026-03-06T22:00:00Z', '2026-03-07T02:00:00Z'), { weekday: 2, weekend: 2 });
  assert.equal(priceFor(getRoom('oak'), '2026-03-06T22:00:00Z', '2026-03-07T02:00:00Z').cents, 11250);
});

test('a share of whole cents rounds half up', () => {
  assert.equal(percentOf(1999, 50), 1000);
  assert.equal(percentOf(1998, 50), 999);
  assert.equal(percentOf(2500, 0), 0);
});

const pineAt = (start) => book(createStore(), { roomId: 'pine', customerId: 'ana', start, end: addHours(start, 1) }, '2026-03-01T00:00:00Z');

test('48 hours or more before the start the whole price comes back', () => {
  assert.deepEqual(refundFor(pineAt('2026-03-04T09:00:00Z'), '2026-03-02T09:00:00Z'), { cents: 1999, currency: 'EUR' });
});

test('24 to 48 hours before the start half comes back, rounded half up', () => {
  assert.deepEqual(refundFor(pineAt('2026-03-04T09:00:00Z'), '2026-03-03T03:00:00Z'), { cents: 1000, currency: 'EUR' });
  assert.equal(refundFor(pineAt('2026-03-04T09:00:00Z'), '2026-03-03T09:00:00Z').cents, 1000);
});

test('under 24 hours before the start nothing comes back', () => {
  assert.equal(refundFor(pineAt('2026-03-04T09:00:00Z'), '2026-03-03T10:00:00Z').cents, 0);
});
