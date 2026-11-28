// The reported symptom: the invoice's tax is a cent short of the register's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/invoice.mjs', import.meta.url));

function invoice(order) {
  const dir = mkdtempSync(join(tmpdir(), 'invoice-'));
  try {
    writeFileSync(join(dir, 'order.json'), JSON.stringify(order));
    const r = spawnSync(process.execPath, [BIN, join(dir, 'order.json')], { encoding: 'utf8' });
    assert.equal(r.stderr, '');
    return r.stdout.split('\n').filter(Boolean);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('8.25% of 19.99 is charged as 1.65', () => {
  const out = invoice({
    number: 1042, currency: 'USD', taxRateBasisPoints: 825,
    lines: [{ sku: 'notebook', name: 'Dot grid notebook', qty: 1, unitPrice: '12.49' }, { sku: 'pens', name: 'Gel pens, 4 pack', qty: 2, unitPrice: '3.75' }],
  });
  assert.equal(out.at(-2), 'Tax 8.25%                           1.65 USD');
  assert.equal(out.at(-1), 'Total                              21.64 USD');
});

test('7% of 3.50 is charged as 0.25', () => {
  const out = invoice({ number: 1043, currency: 'USD', taxRateBasisPoints: 700, lines: [{ sku: 'card', name: 'Card', qty: 1, unitPrice: '3.50' }] });
  assert.equal(out.at(-2), 'Tax 7.00%                           0.25 USD');
});
