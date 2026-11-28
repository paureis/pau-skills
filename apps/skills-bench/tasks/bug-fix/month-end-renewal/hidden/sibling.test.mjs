// The same cause in the schedule, which counts every renewal from the start date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/renewal.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });

test('a schedule from the 31st stays on the last day of each short month', () => {
  assert.equal(cli('2025-08-31', 'monthly', '--count', '3').stdout, '2025-09-30\n2025-10-31\n2025-11-30\n');
  assert.equal(cli('2024-11-30', 'quarterly', '--count', '2').stdout, '2025-02-28\n2025-05-30\n');
});
