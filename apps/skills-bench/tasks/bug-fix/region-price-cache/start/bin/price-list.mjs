#!/usr/bin/env node
// Prints the price list for one or more regions.
//   node bin/price-list.mjs us eu
import { productCodes, regionOf } from '../src/catalog.mjs';
import { priceFor, formatCents } from '../src/prices.mjs';

const regions = process.argv.slice(2);
try {
  if (regions.length === 0) throw new Error('usage: node bin/price-list.mjs <region>... (us, eu, uk)');
  for (const code of regions) {
    const region = regionOf(code);
    console.log(`${region.name} (${region.currency})`);
    for (const sku of productCodes()) {
      const p = priceFor(sku, code);
      console.log(`  ${p.name.padEnd(20)}${formatCents(p.grossCents, p.currency).padStart(12)}`);
    }
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
