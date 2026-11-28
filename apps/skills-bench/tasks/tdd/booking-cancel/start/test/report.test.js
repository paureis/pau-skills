import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, book } from '../src/bookings.js';
import { roomUsage, occupancy, usageByRoom } from '../src/report.js';

const NOW = '2026-03-02T08:00:00Z';
const req = (roomId, start, end, customerId = 'ana') => ({ roomId, customerId, start, end });
const DAY = ['2026-03-03T08:00:00Z', '2026-03-03T20:00:00Z'];

function busyDay() {
  const store = createStore();
  book(store, req('oak', '2026-03-03T06:00:00Z', '2026-03-03T10:00:00Z'), NOW);
  book(store, req('oak', '2026-03-03T13:00:00Z', '2026-03-03T16:00:00Z', 'ben'), NOW);
  book(store, req('maple', '2026-03-03T09:00:00Z', '2026-03-03T10:00:00Z'), NOW);
  book(store, req('oak', '2026-03-04T09:00:00Z', '2026-03-04T10:00:00Z'), NOW);
  return store;
}

test('usage counts the booked hours inside the period only', () => {
  assert.equal(roomUsage(busyDay(), 'oak', ...DAY), 5);
  assert.equal(roomUsage(busyDay(), 'pine', ...DAY), 0);
});

test('occupancy is the booked share of the period', () => {
  assert.equal(occupancy(busyDay(), 'oak', ...DAY), 0.42);
});

test('usage by room lists the busiest room first and leaves out empty rooms', () => {
  assert.deepEqual(usageByRoom(busyDay(), ...DAY), [
    { roomId: 'oak', name: 'Oak room', hours: 5 },
    { roomId: 'maple', name: 'Maple room', hours: 1 },
  ]);
});

test('a period that does not end after it starts is refused', () => {
  assert.throws(() => roomUsage(busyDay(), 'oak', DAY[1], DAY[0]), RangeError);
});
