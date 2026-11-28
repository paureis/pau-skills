#!/usr/bin/env node
// Cancels a booking; its nights are free again.
//   node bin/cancel.mjs data/bookings.json BK-0002
import { loadBookings, saveBookings, cancelBooking } from '../src/bookings.mjs';

const [file, id] = process.argv.slice(2);
try {
  if (!id) throw new Error('usage: node bin/cancel.mjs <bookings.json> <booking id>');
  saveBookings(file, cancelBooking(loadBookings(file), id));
  console.log(`Cancelled ${id}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
