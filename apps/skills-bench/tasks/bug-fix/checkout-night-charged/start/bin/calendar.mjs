#!/usr/bin/env node
// Prints a cabin's month, with taken nights marked.
//   node bin/calendar.mjs data/bookings.json fern 2025-06
import { loadBookings } from '../src/bookings.mjs';
import { monthCalendar, renderCalendar } from '../src/calendar.mjs';
import { parseMonth } from '../src/dates.mjs';

const [file, cabin, monthText] = process.argv.slice(2);
try {
  if (!monthText) throw new Error('usage: node bin/calendar.mjs <bookings.json> <cabin> <YYYY-MM>');
  const { year, month } = parseMonth(monthText);
  console.log(renderCalendar(monthCalendar(cabin, year, month, loadBookings(file))));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
