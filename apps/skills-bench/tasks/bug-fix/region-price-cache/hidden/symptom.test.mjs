// The reported symptom: a price list for two regions shows the first region's prices twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/price-list.mjs', import.meta.url));
const list = (...regions) => spawnSync(process.execPath, [BIN, ...regions], { encoding: 'utf8' });

test('the European list after the US list is in euros with tax', () => {
  const r = list('us', 'eu');
  assert.equal(r.stderr, '');
  assert.deepEqual(r.stdout.split('\n').slice(5, 10), [
    'Europe (EUR)',
    '  Desk lamp              42.00 EUR',
    '  Stoneware mug          13.20 EUR',
    '  Canvas tote            19.80 EUR',
    '  Dot grid notebook      15.59 EUR',
  ]);
});

test('the US list after the UK list is in dollars', () => {
  const lines = list('uk', 'us').stdout.split('\n');
  assert.equal(lines[1], '  Desk lamp              37.20 GBP');
  assert.equal(lines[6], '  Desk lamp              39.00 USD');
});
