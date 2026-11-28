import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, book, getBooking, moveBooking, bookingsOf, upcoming, cancelBooking } from '../src/bookings.js';
import { freeHours, longestFreeRun } from '../src/availability.js';
import { freeRooms, bestRoom } from '../src/search.js';
import { roomsFor } from '../src/rooms.js';

const NOW = '2026-03-02T08:00:00Z'; // a Monday
const req = (roomId, start, end, customerId = 'ana') => ({ roomId, customerId, start, end });

test('a booking gets an id and the price of its hours', () => {
  const store = createStore();
  const b = book(store, req('oak', '2026-03-03T09:00:00Z', '2026-03-03T11:00:00Z'), NOW);
  assert.equal(b.id, 'b1');
  assert.deepEqual(b.price, { cents: 5000, currency: 'EUR' });
  assert.equal(getBooking(store, 'b1'), b);
  assert.throws(() => getBooking(store, 'b9'), { code: 'NO_BOOKING' });
});

test('a room cannot be booked twice for the same time, but back to back is fine', () => {
  const store = createStore();
  book(store, req('oak', '2026-03-03T09:00:00Z', '2026-03-03T11:00:00Z'), NOW);
  assert.throws(() => book(store, req('oak', '2026-03-03T10:00:00Z', '2026-03-03T12:00:00Z', 'ben'), NOW), { code: 'SLOT_TAKEN' });
  assert.equal(book(store, req('oak', '2026-03-03T11:00:00Z', '2026-03-03T12:00:00Z', 'ben'), NOW).id, 'b2');
  assert.equal(book(store, req('maple', '2026-03-03T09:00:00Z', '2026-03-03T11:00:00Z', 'ben'), NOW).id, 'b3');
});

test('a booking off the hour, too short or long, in the past or for nobody is refused', () => {
  const store = createStore();
  const cases = [
    [req('oak', '2026-03-03T09:30:00Z', '2026-03-03T10:30:00Z'), 'NOT_ON_THE_HOUR'],
    [req('oak', '2026-03-03T09:00:00Z', '2026-03-03T09:00:00Z'), 'BAD_LENGTH'],
    [req('oak', '2026-03-03T06:00:00Z', '2026-03-03T19:00:00Z'), 'BAD_LENGTH'],
    [req('oak', '2026-03-02T07:00:00Z', '2026-03-02T09:00:00Z'), 'IN_THE_PAST'],
    [req('attic', '2026-03-03T09:00:00Z', '2026-03-03T10:00:00Z'), 'UNKNOWN_ROOM'],
    [req('oak', '2026-03-03T09:00:00Z', '2026-03-03T10:00:00Z', ' '), 'BAD_CUSTOMER'],
  ];
  for (const [r, code] of cases) assert.throws(() => book(store, r, NOW), { code }, code);
  assert.equal(store.bookings.length, 0);
});

test('a booking moved to a free time keeps its length and is priced again', () => {
  const store = createStore();
  const b = book(store, req('oak', '2026-03-03T09:00:00Z', '2026-03-03T11:00:00Z'), NOW);
  moveBooking(store, b.id, '2026-03-07T10:00:00Z', NOW);
  assert.equal(b.end, '2026-03-07T12:00:00Z');
  assert.deepEqual(b.price, { cents: 6250, currency: 'EUR' });
});

test('a booking cannot be moved onto another one or once it has started', () => {
  const store = createStore();
  const a = book(store, req('oak', '2026-03-03T09:00:00Z', '2026-03-03T11:00:00Z'), NOW);
  book(store, req('oak', '2026-03-03T13:00:00Z', '2026-03-03T14:00:00Z', 'ben'), NOW);
  assert.throws(() => moveBooking(store, a.id, '2026-03-03T12:00:00Z', NOW), { code: 'SLOT_TAKEN' });
  assert.equal(moveBooking(store, a.id, '2026-03-03T10:00:00Z', NOW).start, '2026-03-03T10:00:00Z');
  assert.throws(() => moveBooking(store, a.id, '2026-03-03T15:00:00Z', '2026-03-03T10:00:00Z'), { code: 'ALREADY_STARTED' });
});

test('a customer sees their bookings in start order, and the upcoming ones', () => {
  const store = createStore();
  book(store, req('oak', '2026-03-05T09:00:00Z', '2026-03-05T10:00:00Z'), NOW);
  book(store, req('pine', '2026-03-03T09:00:00Z', '2026-03-03T10:00:00Z'), NOW);
  book(store, req('pine', '2026-03-04T09:00:00Z', '2026-03-04T10:00:00Z', 'ben'), NOW);
  assert.deepEqual(bookingsOf(store, 'ana').map((b) => b.id), ['b2', 'b1']);
  assert.deepEqual(upcoming(store, 'ana', '2026-03-03T09:00:00Z').map((b) => b.id), ['b1']);
});

test('free hours leave out booked hours and hours before now', () => {
  const store = createStore();
  book(store, req('oak', '2026-03-03T09:00:00Z', '2026-03-03T11:00:00Z'), NOW);
  const free = freeHours(store, 'oak', '2026-03-03', NOW);
  assert.equal(free.length, 10);
  assert.deepEqual(free.slice(0, 2), ['2026-03-03T08:00:00Z', '2026-03-03T11:00:00Z']);
  assert.equal(freeHours(store, 'oak', '2026-03-02', '2026-03-02T18:00:00Z').length, 2);
  assert.deepEqual(longestFreeRun(store, 'oak', '2026-03-03', NOW), { start: '2026-03-03T11:00:00Z', hours: 9 });
});

test('room search offers the smallest free room with enough seats', () => {
  const store = createStore();
  book(store, req('oak', '2026-03-03T09:00:00Z', '2026-03-03T11:00:00Z'), NOW);
  assert.deepEqual(roomsFor(6).map((r) => r.id), ['oak', 'maple', 'cedar']);
  assert.deepEqual(freeRooms(store, 4, '2026-03-03T10:00:00Z', '2026-03-03T12:00:00Z').map((r) => r.id), ['maple', 'cedar']);
  const best = bestRoom(store, 4, '2026-03-03T10:00:00Z', '2026-03-03T12:00:00Z');
  assert.equal(best.room.id, 'maple');
  assert.deepEqual(best.price, { cents: 8000, currency: 'EUR' });
  assert.equal(bestRoom(store, 50, '2026-03-03T10:00:00Z', '2026-03-03T12:00:00Z'), null);
});

test('cancelBooking exists', () => {
  assert.equal(typeof cancelBooking, 'function');
});
