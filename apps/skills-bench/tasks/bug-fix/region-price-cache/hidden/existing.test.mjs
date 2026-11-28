// Behaviour that already worked and must keep working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = (name) => fileURLToPath(new URL(`../bin/${name}.mjs`, import.meta.url));
const run = (name, ...args) => spawnSync(process.execPath, [bin(name), ...args], { encoding: 'utf8' });

test('a price list for one region lists every product', () => {
  assert.equal(run('price-list', 'eu').stdout, [
    'Europe (EUR)',
    '  Desk lamp              42.00 EUR',
    '  Stoneware mug          13.20 EUR',
    '  Canvas tote            19.80 EUR',
    '  Dot grid notebook      15.59 EUR',
    '',
  ].join('\n'));
});

test('a cart in one region, with codes typed in any case', () => {
  const out = run('cart', 'Lamp:2', 'lamp', '--regions', 'eu').stdout.split('\n');
  assert.equal(out[3], '  Total                      126.00 EUR');
});

test('unknown regions and items are refused', () => {
  const r = run('price-list', 'us', 'mars');
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'unknown region: mars (us, eu, uk)\n');
  assert.equal(run('cart', 'lamp:x').stderr, 'not a cart item: lamp:x (use sku or sku:qty)\n');
});
