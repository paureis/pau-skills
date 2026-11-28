// Behaviour that already worked and must keep working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = (name) => fileURLToPath(new URL(`../bin/${name}.mjs`, import.meta.url));

function run(name, order, ...args) {
  const dir = mkdtempSync(join(tmpdir(), 'shop-'));
  try {
    writeFileSync(join(dir, 'order.json'), JSON.stringify(order));
    return spawnSync(process.execPath, [bin(name), join(dir, 'order.json'), ...args], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const lastLines = (r) => r.stdout.split('\n').filter(Boolean).slice(-2);

test('tax that is already below half a cent stays rounded down', () => {
  const order = { number: 9, currency: 'USD', taxRateBasisPoints: 825, lines: [{ sku: 'clip', name: 'Clips', qty: 1, unitPrice: '10.10' }] };
  assert.deepEqual(lastLines(run('invoice', order)), ['Tax 8.25%                           0.83 USD', 'Total                              10.93 USD']);
});

test('exact tax is charged and refunded as it is', () => {
  const order = { number: 7, currency: 'EUR', taxRateBasisPoints: 2000, lines: [{ sku: 'mug', name: 'Stoneware mug', qty: 2, unitPrice: '9.50' }] };
  assert.deepEqual(lastLines(run('invoice', order)), ['Tax 20.00%                          3.80 EUR', 'Total                              22.80 EUR']);
  assert.deepEqual(lastLines(run('refund', order, 'mug:1')), ['Tax                                 1.90 EUR', 'Refund total                       11.40 EUR']);
});

test('a refund for more than was bought is refused', () => {
  const order = { number: 7, currency: 'EUR', taxRateBasisPoints: 2000, lines: [{ sku: 'mug', name: 'Stoneware mug', qty: 2, unitPrice: '9.50' }] };
  const r = run('refund', order, 'mug:3');
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'order 7 has only 2 more mug to return\n');
});
