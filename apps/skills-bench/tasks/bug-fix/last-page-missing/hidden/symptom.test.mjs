// The reported symptom: the last, partly filled page is refused.
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

test('page 3 of 25 orders at 10 a page lists the last 5 orders', () => {
  const r = list(25, '--page', '3', '--size', '10');
  assert.equal(r.stderr, '');
  assert.equal(r.status, 0);
  const ids = r.stdout.split('\n').slice(1).filter(Boolean).map((l) => l.split(' ')[0]);
  assert.deepEqual(ids, ['B-2021', 'B-2022', 'B-2023', 'B-2024', 'B-2025']);
});

test('the last page of 7 orders at 3 a page holds the seventh order', () => {
  const r = list(7, '--page', '3', '--size', '3');
  assert.equal(r.status, 0);
  assert.deepEqual(r.stdout.split('\n').slice(1).filter(Boolean).map((l) => l.split(' ')[0]), ['B-2007']);
});
