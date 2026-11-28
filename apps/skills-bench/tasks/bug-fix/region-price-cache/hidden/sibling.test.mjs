// The same cause in the cart, which prices the same items in several regions in one run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/cart.mjs', import.meta.url));

test('a cart priced in the US and then the UK has UK prices in the second cart', () => {
  const r = spawnSync(process.execPath, [BIN, 'lamp:1', 'mug:2', '--regions', 'us,uk'], { encoding: 'utf8' });
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, [
    'Cart in United States',
    '   1 x Desk lamp              39.00 USD',
    '   2 x Stoneware mug          24.00 USD',
    '  Total                       63.00 USD',
    '',
    'Cart in United Kingdom',
    '   1 x Desk lamp              37.20 GBP',
    '   2 x Stoneware mug          22.80 GBP',
    '  Total                       60.00 GBP',
    '',
  ].join('\n'));
});
