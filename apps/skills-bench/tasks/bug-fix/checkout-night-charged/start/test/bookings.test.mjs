import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBookings, saveBookings, addBooking, cancelBooking, moveBooking, nextId } from '../src/bookings.mjs';

const DATA = fileURLToPath(new URL('../data/bookings.json', import.meta.url));
const existing = () => loadBookings(DATA);
const request = (checkIn, checkOut) => ({ cabin: 'fern', checkIn, checkOut, guest: 'Lena Park', guests: 2 });

test('the bookings file loads and saves', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cabins-'));
  try {
    assert.deepEqual(loadBookings(join(dir, 'none.json')), []);
    saveBookings(join(dir, 'b.json'), existing());
    assert.deepEqual(loadBookings(join(dir, 'b.json')), existing());
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'b.json'), 'utf8')).map((b) => b.id), ['BK-0001', 'BK-0002']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('free nights can be booked and get the next id', () => {
  const { booking, bookings } = addBooking(existing(), request('2025-07-01', '2025-07-04'));
  assert.equal(booking.id, 'BK-0003');
  assert.equal(booking.status, 'confirmed');
  assert.equal(bookings.length, 3);
  assert.equal(nextId([]), 'BK-0001');
});

test('nights inside another stay are refused', () => {
  assert.throws(() => addBooking(existing(), request('2025-06-11', '2025-06-12')), /^Error: not available: fern is booked on the night of 2025-06-11 \(BK-0001\)$/);
  assert.throws(() => addBooking(existing(), request('2025-06-08', '2025-06-12')), /night of 2025-06-10 \(BK-0001\)/);
});

test('a cancelled booking frees its nights', () => {
  const bookings = cancelBooking(existing(), 'BK-0001');
  assert.equal(addBooking(bookings, request('2025-06-10', '2025-06-12')).booking.id, 'BK-0003');
  assert.throws(() => cancelBooking(bookings, 'BK-0001'), /already cancelled/);
  assert.throws(() => cancelBooking(bookings, 'BK-0009'), /no booking BK-0009/);
});

test('a booking moves to free dates and keeps its id and guest', () => {
  const { booking } = moveBooking(existing(), 'BK-0001', '2025-06-11', '2025-06-13');
  assert.deepEqual([booking.id, booking.guest, booking.checkIn, booking.checkOut], ['BK-0001', 'Ada Brooks', '2025-06-11', '2025-06-13']);
});

test('a bad record or guest name is refused', () => {
  assert.throws(() => addBooking(existing(), { ...request('2025-07-01', '2025-07-02'), guest: ' ' }), /guest name must be 1 to 80 characters/);
});
