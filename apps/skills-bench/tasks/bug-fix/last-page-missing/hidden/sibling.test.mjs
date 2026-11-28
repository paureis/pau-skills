// The same cause in the header, which shows the page count on every page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/orders.mjs', import.meta.url));
const orders = (n) => Array.from({ length: n }, (_, i) => ({ id: `B-${2001 + i}`, customer: `Shop ${i + 1}`, totalCents: 1000 + i, currency: 'EUR' }));

function header(count, ...args) {
  const dir = mkdtempSync(join(tmpdir(), 'orders-'));
  try {
    writeFileSync(join(dir, 'orders.json'), JSON.stringify(orders(count)));
    return spawnSync(process.execPath, [BIN, join(dir, 'orders.json'), ...args], { encoding: 'utf8' }).stdout.split('\n')[0];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the header counts a partly filled last page', () => {
  assert.equal(header(25, '--page', '1', '--size', '10'), 'Page 1 of 3 (25 orders)');
  assert.equal(header(4, '--page', '1', '--size', '10'), 'Page 1 of 1 (4 orders)');
});
