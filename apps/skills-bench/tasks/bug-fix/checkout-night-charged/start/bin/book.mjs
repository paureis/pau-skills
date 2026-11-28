#!/usr/bin/env node
// Books a stay if its nights are free, and says when the cabin is free next if not. The bookings file is only read;
// the new list goes to the file given with --out, which may be the same file.
//   node bin/book.mjs data/bookings.json fern 2025-06-13 2025-06-16 "Ada Brooks" --out my-bookings.json
import { loadBookings, saveBookings, addBooking, takeOut } from '../src/bookings.mjs';
import { firstFreeStay } from '../src/availability.mjs';
import { daysBetween } from '../src/dates.mjs';
import { renderBooking } from '../src/format.mjs';

const { args, out } = takeOut(process.argv.slice(2));
const [file, cabin, checkIn, checkOut, guest, guests = '2'] = args;
try {
  if (!guest || !out) throw new Error('usage: node bin/book.mjs <bookings.json> <cabin> <check-in> <check-out> <guest name> [guests] --out <file>');
  const bookings = loadBookings(file);
  try {
    const done = addBooking(bookings, { cabin, checkIn, checkOut, guest, guests: Number(guests) });
    saveBookings(out, done.bookings);
    console.log(renderBooking(done.booking, done.quote));
  } catch (err) {
    if (!err.message.startsWith('not available')) throw err;
    const free = firstFreeStay(cabin, checkIn, daysBetween(checkIn, checkOut), bookings);
    throw new Error(free ? `${err.message}; the first free dates are ${free.checkIn} to ${free.checkOut}` : err.message);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
