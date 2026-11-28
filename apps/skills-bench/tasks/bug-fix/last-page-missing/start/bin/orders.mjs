#!/usr/bin/env node
// Lists orders from a JSON file one page at a time.
//   node bin/orders.mjs data/orders.json --page 2 --size 10
import { readFileSync } from 'node:fs';
import { pageOf, pageHeader, orderLine } from '../src/pages.mjs';

const [file, ...rest] = process.argv.slice(2);
const option = (name, fallback) => {
  const i = rest.indexOf(name);
  return i < 0 ? fallback : Number(rest[i + 1]);
};
try {
  if (!file) throw new Error('usage: node bin/orders.mjs <orders.json> [--page <n>] [--size <n>]');
  const orders = JSON.parse(readFileSync(file, 'utf8'));
  const page = option('--page', 1);
  const size = option('--size', 10);
  const rows = pageOf(orders, page, size);
  console.log(pageHeader(page, orders.length, size));
  for (const order of rows) console.log(orderLine(order));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
