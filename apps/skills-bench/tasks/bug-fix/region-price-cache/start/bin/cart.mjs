#!/usr/bin/env node
// Prices a cart in one or more regions, so support can quote a customer who ships to another country.
//   node bin/cart.mjs lamp:1 mug:2 --regions us,uk
import { parseItem, priceCart, renderCart } from '../src/cart.mjs';

const args = process.argv.slice(2);
const at = args.indexOf('--regions');
const regions = at < 0 ? ['us'] : String(args[at + 1] ?? '').split(',').filter(Boolean);
try {
  const items = (at < 0 ? args : [...args.slice(0, at), ...args.slice(at + 2)]).map(parseItem);
  if (items.length === 0 || regions.length === 0) throw new Error('usage: node bin/cart.mjs <sku[:qty]>... [--regions us,eu,uk]');
  console.log(regions.map((code) => renderCart(priceCart(items, code))).join('\n\n'));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
