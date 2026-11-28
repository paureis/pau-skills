#!/usr/bin/env node
// Moves a booking to new dates in the same cabin, if the new nights are free, and prices it again. The bookings file
// is only read; the new list goes to the file given with --out, which may be the same file.
//   node bin/move.mjs data/bookings.json BK-0001 2025-06-11 2025-06-14 --out my-bookings.json
import { loadBookings, saveBookings, moveBooking, takeOut } from '../src/bookings.mjs';
import { renderBooking } from '../src/format.mjs';

const { args, out } = takeOut(process.argv.slice(2));
const [file, id, checkIn, checkOut] = args;
try {
  if (!checkOut || !out) throw new Error('usage: node bin/move.mjs <bookings.json> <booking id> <check-in> <check-out> --out <file>');
  const done = moveBooking(loadBookings(file), id, checkIn, checkOut);
  saveBookings(out, done.bookings);
  console.log(renderBooking(done.booking, done.quote, 'Moved'));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
