import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, book, cancelBooking } from '../src/bookings.js';
import { refundFor } from '../src/pricing.js';
import { invoiceFor } from '../src/invoice.js';
import { roomUsage } from '../src/report.js';
import { freeHours } from '../src/availability.js';

const NOW = '2026-03-09T08:00:00Z'; // a Monday
const req = (roomId, start, end, customerId = 'kim') => ({ roomId, customerId, start, end });
const eur = (cents) => ({ cents, currency: 'EUR' });

test('cancelling marks the booking and keeps the refund on it', () => {
  const store = createStore();
  const b = book(store, req('maple', '2026-03-12T10:00:00Z', '2026-03-12T13:00:00Z'), NOW);
  const c = cancelBooking(store, b.id, '2026-03-09T09:00:00Z');
  assert.equal(c.id, b.id);
  assert.equal(c.status, 'cancelled');
  assert.equal(c.cancelledAt, '2026-03-09T09:00:00Z');
  assert.deepEqual(c.refund, eur(12000));
});

test('48 hours or more ahead the whole price comes back, exactly 48 included', () => {
  const store = createStore();
  const b = book(store, req('oak', '2026-03-11T10:00:00Z', '2026-03-11T12:00:00Z'), NOW);
  assert.deepEqual(refundFor(b, '2026-03-09T10:00:00Z'), eur(5000));
  assert.deepEqual(refundFor(b, '2026-03-09T08:00:00Z'), eur(5000));
});

test('24 to 48 hours ahead half comes back, rounded half up to whole cents', () => {
  const store = createStore();
  const b = book(store, req('pine', '2026-03-11T10:00:00Z', '2026-03-11T11:00:00Z'), NOW);
  assert.deepEqual(refundFor(b, '2026-03-10T04:00:00Z'), eur(1000));
  assert.deepEqual(refundFor(b, '2026-03-10T10:00:00Z'), eur(1000));
  assert.deepEqual(refundFor(b, '2026-03-09T11:00:00Z'), eur(1000));
  const weekend = book(store, req('pine', '2026-03-14T10:00:00Z', '2026-03-14T13:00:00Z'), NOW);
  assert.equal(weekend.price.cents, 7496);
  assert.deepEqual(refundFor(weekend, '2026-03-13T00:00:00Z'), eur(3748));
});

test('under 24 hours ahead nothing comes back', () => {
  const store = createStore();
  const b = book(store, req('oak', '2026-03-11T10:00:00Z', '2026-03-11T12:00:00Z'), NOW);
  assert.deepEqual(refundFor(b, '2026-03-10T11:00:00Z'), eur(0));
  assert.deepEqual(cancelBooking(store, b.id, '2026-03-11T09:00:00Z').refund, eur(0));
});

test('the cancelled time can be booked again and shows as free', () => {
  const store = createStore();
  const b = book(store, req('oak', '2026-03-11T10:00:00Z', '2026-03-11T12:00:00Z'), NOW);
  assert.equal(freeHours(store, 'oak', '2026-03-11', NOW).length, 10);
  cancelBooking(store, b.id, NOW);
  assert.equal(freeHours(store, 'oak', '2026-03-11', NOW).length, 12);
  const again = book(store, req('oak', '2026-03-11T09:00:00Z', '2026-03-11T12:00:00Z', 'lee'), NOW);
  assert.equal(again.customerId, 'lee');
  assert.throws(() => book(store, req('oak', '2026-03-11T11:00:00Z', '2026-03-11T12:00:00Z'), NOW), { code: 'SLOT_TAKEN' });
});

test('an unknown booking, a second cancel or a cancel from the start on are refused', () => {
  const store = createStore();
  const b = book(store, req('oak', '2026-03-11T10:00:00Z', '2026-03-11T12:00:00Z'), NOW);
  assert.throws(() => cancelBooking(store, 'nope', NOW), { code: 'NO_BOOKING' });
  assert.throws(() => cancelBooking(store, b.id, '2026-03-11T10:00:00Z'), { code: 'ALREADY_STARTED' });
  assert.throws(() => cancelBooking(store, b.id, '2026-03-11T11:00:00Z'), { code: 'ALREADY_STARTED' });
  cancelBooking(store, b.id, NOW);
  assert.throws(() => cancelBooking(store, b.id, NOW), { code: 'ALREADY_CANCELLED' });
  assert.deepEqual(store.bookings.find((x) => x.id === b.id).refund, eur(5000));
});

test('the invoice keeps the cancelled booking and follows it with a negative refund line', () => {
  const store = createStore();
  const first = book(store, req('pine', '2026-03-10T15:00:00Z', '2026-03-10T16:00:00Z'), NOW);
  book(store, req('oak', '2026-03-12T10:00:00Z', '2026-03-12T12:00:00Z'), NOW);
  cancelBooking(store, first.id, '2026-03-09T09:00:00Z');
  const invoice = invoiceFor(store, 'kim');
  assert.deepEqual(invoice.lines.map((l) => [l.bookingId, l.kind, l.cents]), [
    [first.id, 'booking', 1999],
    [first.id, 'refund', -1000],
    ['b2', 'booking', 5000],
  ]);
  assert.equal(invoice.totalCents, 5999);
});

test('a cancellation with no refund adds no invoice line', () => {
  const store = createStore();
  const b = book(store, req('oak', '2026-03-09T10:00:00Z', '2026-03-09T12:00:00Z'), NOW);
  cancelBooking(store, b.id, '2026-03-09T09:00:00Z');
  const invoice = invoiceFor(store, 'kim');
  assert.deepEqual(invoice.lines.map((l) => l.kind), ['booking']);
  assert.equal(invoice.totalCents, 5000);
});

test('room usage leaves cancelled bookings out', () => {
  const store = createStore();
  const b = book(store, req('oak', '2026-03-10T09:00:00Z', '2026-03-10T12:00:00Z'), NOW);
  book(store, req('oak', '2026-03-10T14:00:00Z', '2026-03-10T15:00:00Z'), NOW);
  const day = ['2026-03-10T00:00:00Z', '2026-03-11T00:00:00Z'];
  assert.equal(roomUsage(store, 'oak', ...day), 4);
  cancelBooking(store, b.id, NOW);
  assert.equal(roomUsage(store, 'oak', ...day), 1);
});
