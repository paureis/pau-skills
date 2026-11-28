// Behaviour that already worked and must keep working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = (name) => fileURLToPath(new URL(`../bin/${name}.mjs`, import.meta.url));
const BOOKED = [{ id: 'BK-0001', cabin: 'fern', checkIn: '2025-06-10', checkOut: '2025-06-13', guests: 2, guest: 'Ada Brooks', status: 'confirmed', totalCents: 42_000 }];

function inFolder(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cabins-'));
  try {
    const file = join(dir, 'bookings.json');
    writeFileSync(file, JSON.stringify(BOOKED));
    return fn(file, (name, ...args) => spawnSync(process.execPath, [bin(name), ...args], { encoding: 'utf8' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a stay that shares a night with a booking is refused and the file is kept', () => {
  inFolder((file, run) => {
    const r = run('book', file, 'fern', '2025-06-12', '2025-06-14', 'Lena Park');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^not available: fern is booked on the night of 2025-06-12 \(BK-0001\); the first free dates are 2025-06-1\d to 2025-06-1\d\n$/);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), BOOKED);
  });
});

test('a cancelled booking frees its nights', () => {
  inFolder((file, run) => {
    assert.equal(run('cancel', file, 'BK-0001').stdout, 'Cancelled BK-0001\n');
    assert.equal(run('book', file, 'fern', '2025-06-11', '2025-06-13', 'Lena Park').stderr, '');
  });
});

test('the calendar shows every day of the month', () => {
  inFolder((file, run) => {
    const lines = run('calendar', file, 'fern', '2025-06').stdout.split('\n').filter(Boolean);
    assert.deepEqual(lines.slice(0, 3), ['Fern cabin, June 2025', 'Mo Tu We Th Fr Sa Su', '                   1']);
    assert.ok(lines[4].startsWith(' 9 ## ## ## '), lines[4]);
    assert.equal(lines.at(-2), '30');
    assert.match(lines.at(-1), /^\d+ of 30 nights taken$/);
  });
});

test('a mid-season stay of one night, and a stay too big for the cabin', () => {
  inFolder((file, run) => {
    assert.equal(run('quote', 'birch', '2025-05-07', '2025-05-08', '4').stderr, '');
    const r = run('quote', 'fern', '2025-05-07', '2025-05-09', '3');
    assert.equal(r.status, 1);
    assert.equal(r.stderr, 'Fern cabin sleeps 2, not 3\n');
  });
});
