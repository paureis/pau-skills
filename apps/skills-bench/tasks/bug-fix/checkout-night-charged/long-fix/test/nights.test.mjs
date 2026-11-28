import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStay, stayNights } from '../src/stay.mjs';
import { quoteStay } from '../src/rates.mjs';
import { addBooking } from '../src/bookings.mjs';

const BOOKED = [{ id: 'BK-0001', cabin: 'fern', checkIn: '2025-06-10', checkOut: '2025-06-13', guests: 2, guest: 'Ada Brooks', status: 'confirmed' }];

test('the check-out day starts no night', () => {
  const stay = parseStay({ cabin: 'fern', checkIn: '2025-06-13', checkOut: '2025-06-16' });
  assert.deepEqual(stayNights(stay), ['2025-06-13', '2025-06-14', '2025-06-15']);
  assert.equal(quoteStay(stay).totalCents, 47_000);
});

test('a stay can start on the day the one before it checks out', () => {
  const { booking } = addBooking(BOOKED, { cabin: 'fern', checkIn: '2025-06-13', checkOut: '2025-06-15', guest: 'Lena Park' });
  assert.equal(booking.id, 'BK-0002');
});
