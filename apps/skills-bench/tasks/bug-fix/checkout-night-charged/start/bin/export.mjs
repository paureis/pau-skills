#!/usr/bin/env node
// Prints the bookings as CSV, or one cabin's confirmed stays as an iCalendar file, for other tools to read.
//   node bin/export.mjs data/bookings.json csv
//   node bin/export.mjs data/bookings.json ics fern
import { loadBookings } from '../src/bookings.mjs';
import { bookingsCsv, cabinCalendarFile } from '../src/exports.mjs';

const [file, kind, cabin] = process.argv.slice(2);
try {
  const bookings = file ? loadBookings(file) : [];
  if (kind === 'csv') process.stdout.write(bookingsCsv(bookings));
  else if (kind === 'ics' && cabin) process.stdout.write(cabinCalendarFile(cabin, bookings));
  else throw new Error('usage: node bin/export.mjs <bookings.json> csv | ics <cabin>');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
