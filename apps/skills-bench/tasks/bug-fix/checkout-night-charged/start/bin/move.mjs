#!/usr/bin/env node
// Moves a booking to new dates in the same cabin, if the new nights are free, and prices it again.
//   node bin/move.mjs data/bookings.json BK-0001 2025-06-11 2025-06-14
import { loadBookings, saveBookings, moveBooking } from '../src/bookings.mjs';
import { renderBooking } from '../src/format.mjs';

const [file, id, checkIn, checkOut] = process.argv.slice(2);
try {
  if (!checkOut) throw new Error('usage: node bin/move.mjs <bookings.json> <booking id> <check-in> <check-out>');
  const done = moveBooking(loadBookings(file), id, checkIn, checkOut);
  saveBookings(file, done.bookings);
  console.log(renderBooking(done.booking, done.quote, 'Moved'));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
