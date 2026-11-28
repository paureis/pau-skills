#!/usr/bin/env node
// Prints the refund for items sent back from an order.
//   node bin/refund.mjs data/order-1042.json pens:2
import { readFileSync } from 'node:fs';
import { buildRefund, parseReturn, renderRefund } from '../src/refund.mjs';

const [file, ...returns] = process.argv.slice(2);
try {
  if (!file || returns.length === 0) throw new Error('usage: node bin/refund.mjs <order.json> <sku:qty>...');
  const order = JSON.parse(readFileSync(file, 'utf8'));
  console.log(renderRefund(buildRefund(order, returns.map(parseReturn))));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
