// The reported symptom: a quote charges the check-out day as one more night.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/quote.mjs', import.meta.url));
const quote = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });

test('Friday to Monday in the fern cabin is three nights', () => {
  const r = quote('fern', '2025-06-13', '2025-06-16');
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, [
    'Fern cabin, 2025-06-13 to 2025-06-16, 2 guests',
    '  Fri 2025-06-13  weekend     150.00 EUR',
    '  Sat 2025-06-14  weekend     150.00 EUR',
    '  Sun 2025-06-15              125.00 EUR',
    '3 nights                      425.00 EUR',
    'Cleaning                       45.00 EUR',
    'Total                         470.00 EUR',
    '',
  ].join('\n'));
});

test('a two-night stay in January is two nights', () => {
  const lines = quote('lakeview', '2025-01-06', '2025-01-08', '6').stdout.split('\n');
  assert.equal(lines[3], '2 nights                      468.00 EUR');
  assert.equal(lines[5], 'Total                         558.00 EUR');
});
