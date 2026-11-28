#!/usr/bin/env node
// Prints the invoice for an order file.
//   node bin/invoice.mjs data/order-1042.json
import { readFileSync } from 'node:fs';
import { buildInvoice, renderInvoice } from '../src/invoice.mjs';

const [file] = process.argv.slice(2);
try {
  if (!file) throw new Error('usage: node bin/invoice.mjs <order.json>');
  console.log(renderInvoice(buildInvoice(JSON.parse(readFileSync(file, 'utf8')))));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
