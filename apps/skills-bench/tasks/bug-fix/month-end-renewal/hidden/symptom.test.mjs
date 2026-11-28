// The reported symptom: a monthly plan started on January 31 renews in March.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/renewal.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });

test('a monthly plan started on January 31 renews on the last day of February', () => {
  assert.equal(cli('2025-01-31', 'monthly').stdout, 'Next renewal: 2025-02-28\n');
  assert.equal(cli('2024-01-31', 'monthly').stdout, 'Next renewal: 2024-02-29\n');
});
