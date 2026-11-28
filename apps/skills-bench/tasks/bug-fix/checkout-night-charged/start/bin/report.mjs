#!/usr/bin/env node
// Prints how full each cabin was in a month and what its stays brought in.
//   node bin/report.mjs data/bookings.json 2025-06
import { loadBookings } from '../src/bookings.mjs';
import { monthReport, renderReport } from '../src/report.mjs';
import { parseMonth } from '../src/dates.mjs';

const [file, monthText] = process.argv.slice(2);
try {
  if (!monthText) throw new Error('usage: node bin/report.mjs <bookings.json> <YYYY-MM>');
  const { year, month } = parseMonth(monthText);
  console.log(renderReport(monthReport(year, month, loadBookings(file))));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
