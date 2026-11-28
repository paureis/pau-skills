// The same cause in bookings: a stay may start on the day the guests before it check out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/book.mjs', import.meta.url));
const BOOKED = [{ id: 'BK-0001', cabin: 'fern', checkIn: '2025-06-10', checkOut: '2025-06-13', guests: 2, guest: 'Ada Brooks', status: 'confirmed', totalCents: 42_000 }];

function book(checkIn, checkOut) {
  const dir = mkdtempSync(join(tmpdir(), 'cabins-'));
  try {
    writeFileSync(join(dir, 'bookings.json'), JSON.stringify(BOOKED));
    return spawnSync(process.execPath, [BIN, join(dir, 'bookings.json'), 'fern', checkIn, checkOut, 'Lena Park'], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a stay can start on the check-out day of the stay before it', () => {
  const r = book('2025-06-13', '2025-06-15');
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, 'Booked BK-0002 for Lena Park: Fern cabin, 2025-06-13 to 2025-06-15, 2 guests, 2 nights, 345.00 EUR\n');
});

test('a stay can end on the check-in day of the stay after it', () => {
  const r = book('2025-06-08', '2025-06-10');
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /^Booked BK-0002 for Lena Park: Fern cabin, 2025-06-08 to 2025-06-10, 2 guests, 2 nights, /);
});
