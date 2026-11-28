#!/usr/bin/env node
// Prints each cabin's nightly prices in a season (low, mid or high), for the price sheet.
//   node bin/prices.mjs high
import { renderCabinList } from '../src/format.mjs';

const [season] = process.argv.slice(2);
try {
  if (!season) throw new Error('usage: node bin/prices.mjs <low|mid|high>');
  console.log(renderCabinList(season));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
