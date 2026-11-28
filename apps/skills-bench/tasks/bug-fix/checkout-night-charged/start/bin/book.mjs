#!/usr/bin/env node
// Books a stay in the bookings file if its nights are free, and says when the cabin is free next if not.
//   node bin/book.mjs data/bookings.json fern 2025-06-13 2025-06-16 "Ada Brooks" [guests]
import { loadBookings, saveBookings, addBooking } from '../src/bookings.mjs';
import { firstFreeStay } from '../src/availability.mjs';
import { daysBetween } from '../src/dates.mjs';
import { renderBooking } from '../src/format.mjs';

const [file, cabin, checkIn, checkOut, guest, guests = '2'] = process.argv.slice(2);
try {
  if (!guest) throw new Error('usage: node bin/book.mjs <bookings.json> <cabin> <check-in> <check-out> <guest name> [guests]');
  const bookings = loadBookings(file);
  try {
    const done = addBooking(bookings, { cabin, checkIn, checkOut, guest, guests: Number(guests) });
    saveBookings(file, done.bookings);
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
