#!/usr/bin/env node
// Prints the free stretches of a cabin in a period, for answering "when can we come?".
//   node bin/free.mjs data/bookings.json fern 2025-06-01 2025-07-01
import { loadBookings } from '../src/bookings.mjs';
import { freeRanges } from '../src/availability.mjs';
import { renderFreeRanges } from '../src/format.mjs';

const [file, cabin, from, to] = process.argv.slice(2);
try {
  if (!to) throw new Error('usage: node bin/free.mjs <bookings.json> <cabin> <from YYYY-MM-DD> <to YYYY-MM-DD>');
  console.log(renderFreeRanges(cabin, freeRanges(cabin, from, to, loadBookings(file))));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
