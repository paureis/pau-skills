// The same cause in refunds, which take the tax on the returned goods from the same helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/refund.mjs', import.meta.url));
const ORDER = {
  number: 1042, currency: 'USD', taxRateBasisPoints: 825,
  lines: [{ sku: 'notebook', name: 'Dot grid notebook', qty: 1, unitPrice: '12.49' }, { sku: 'pens', name: 'Gel pens, 4 pack', qty: 2, unitPrice: '3.75' }],
};

function refund(...returns) {
  const dir = mkdtempSync(join(tmpdir(), 'refund-'));
  try {
    writeFileSync(join(dir, 'order.json'), JSON.stringify(ORDER));
    const r = spawnSync(process.execPath, [BIN, join(dir, 'order.json'), ...returns], { encoding: 'utf8' });
    assert.equal(r.stderr, '');
    return r.stdout.split('\n').filter(Boolean);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('returning two packs of pens pays back the 0.62 of tax they were charged', () => {
  const out = refund('pens:2');
  assert.equal(out.at(-2), 'Tax                                 0.62 USD');
  assert.equal(out.at(-1), 'Refund total                        8.12 USD');
});

test('returning the whole order pays back the whole invoice', () => {
  assert.equal(refund('notebook:1', 'pens:2').at(-1), 'Refund total                       21.64 USD');
});
