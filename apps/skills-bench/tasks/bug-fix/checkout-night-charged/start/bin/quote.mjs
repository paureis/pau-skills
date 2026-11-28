#!/usr/bin/env node
// Prints what a stay costs, night by night.
//   node bin/quote.mjs fern 2025-06-13 2025-06-16 [guests]
import { parseStay } from '../src/stay.mjs';
import { quoteStay } from '../src/rates.mjs';
import { renderQuote } from '../src/format.mjs';

const [cabin, checkIn, checkOut, guests = '2'] = process.argv.slice(2);
try {
  if (!checkOut) throw new Error('usage: node bin/quote.mjs <cabin> <check-in YYYY-MM-DD> <check-out YYYY-MM-DD> [guests]');
  console.log(renderQuote(quoteStay(parseStay({ cabin, checkIn, checkOut, guests: Number(guests) }))));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
