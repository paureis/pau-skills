#!/usr/bin/env node
// Cancels a booking; its nights are free again. The bookings file is only read; the new list goes to the file given
// with --out, which may be the same file.
//   node bin/cancel.mjs data/bookings.json BK-0002 --out my-bookings.json
import { loadBookings, saveBookings, cancelBooking, takeOut } from '../src/bookings.mjs';

const { args, out } = takeOut(process.argv.slice(2));
const [file, id] = args;
try {
  if (!id || !out) throw new Error('usage: node bin/cancel.mjs <bookings.json> <booking id> --out <file>');
  saveBookings(out, cancelBooking(loadBookings(file), id));
  console.log(`Cancelled ${id}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
