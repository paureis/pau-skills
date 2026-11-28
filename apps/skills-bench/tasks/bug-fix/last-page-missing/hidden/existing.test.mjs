// Behaviour that already worked and must keep working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/orders.mjs', import.meta.url));
const orders = (n) => Array.from({ length: n }, (_, i) => ({ id: `B-${2001 + i}`, customer: `Shop ${i + 1}`, totalCents: 1000 + i, currency: 'EUR' }));

function list(count, ...args) {
  const dir = mkdtempSync(join(tmpdir(), 'orders-'));
  try {
    writeFileSync(join(dir, 'orders.json'), JSON.stringify(orders(count)));
    return spawnSync(process.execPath, [BIN, join(dir, 'orders.json'), ...args], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('full pages list their orders under the header', () => {
  const r = list(20, '--page', '2', '--size', '10');
  const out = r.stdout.split('\n').filter(Boolean);
  assert.equal(out[0], 'Page 2 of 2 (20 orders)');
  assert.equal(out.length, 11);
  assert.equal(out[1], 'B-2011  Shop 11                   10.10 EUR');
});

test('a page past the end is refused', () => {
  const r = list(20, '--page', '3', '--size', '10');
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'no page 3: there are 2 pages\n');
  const one = list(10, '--page', '2', '--size', '10');
  assert.equal(one.stderr, 'no page 2: there is 1 page\n');
});
