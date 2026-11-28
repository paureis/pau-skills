// Behaviour that already worked and must keep working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/renewal.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });

test('mid-month dates keep their day', () => {
  assert.equal(cli('2025-03-15', 'monthly').stdout, 'Next renewal: 2025-04-15\n');
  assert.equal(cli('2025-01-30', 'quarterly', '--count', '2').stdout, '2025-04-30\n2025-07-30\n');
  assert.equal(cli('2025-12-20', 'monthly', '--count', '2').stdout, '2026-01-20\n2026-02-20\n');
});

test('a yearly plan renews on the same day next year', () => {
  assert.equal(cli('2025-05-31', 'yearly').stdout, 'Next renewal: 2026-05-31\n');
});

test('bad input is refused with a message', () => {
  const r = cli('2025-02-30', 'monthly');
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'no such day: 2025-02-30\n');
});
