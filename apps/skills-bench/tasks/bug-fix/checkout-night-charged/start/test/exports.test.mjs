import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadBookings, findBookings } from '../src/bookings.mjs';
import { freeRanges } from '../src/availability.mjs';
import { bookingsCsv, cabinCalendarFile } from '../src/exports.mjs';
import { renderBookingList, renderCabinList } from '../src/format.mjs';

const bookings = loadBookings(fileURLToPath(new URL('../data/bookings.json', import.meta.url)));

test('free stretches end where a booking starts', () => {
  assert.deepEqual(freeRanges('fern', '2025-06-01', '2025-06-10', bookings), [{ checkIn: '2025-06-01', checkOut: '2025-06-10' }]);
  assert.deepEqual(freeRanges('fern', '2025-06-01', '2025-06-12', bookings), [{ checkIn: '2025-06-01', checkOut: '2025-06-10' }]);
  assert.deepEqual(freeRanges('lakeview', '2025-06-01', '2025-07-01', bookings), [{ checkIn: '2025-06-01', checkOut: '2025-07-01' }]);
  assert.throws(() => freeRanges('fern', '2025-06-10', '2025-06-10', bookings), /the period must end after 2025-06-10/);
});

test('bookings are found by cabin, guest, status and period', () => {
  assert.deepEqual(findBookings(bookings, { cabin: 'fern' }).map((b) => b.id), ['BK-0001']);
  assert.deepEqual(findBookings(bookings, { guest: 'OKAF' }).map((b) => b.id), ['BK-0002']);
  assert.deepEqual(findBookings(bookings, { from: '2025-06-13', to: '2025-06-20' }).map((b) => b.id), []);
  assert.deepEqual(findBookings(bookings, { status: 'confirmed' }).map((b) => b.id), ['BK-0001', 'BK-0002']);
  assert.throws(() => findBookings(bookings, { status: 'held' }), /unknown status: held/);
  assert.equal(renderBookingList([]), 'No bookings match.');
  assert.match(renderBookingList(bookings).split('\n')[0], /^BK-0001  Fern cabin {7}2025-06-10 to 2025-06-13  3 nights .* 420\.00 EUR$/);
});

test('the CSV file has a header, one row per booking, and quotes a name with a comma', () => {
  const csv = bookingsCsv([...bookings, { ...bookings[0], id: 'BK-0003', guest: 'Brooks, Ada "Ace"', totalCents: undefined }]).split('\r\n');
  assert.equal(csv[0], 'id,cabin,check_in,check_out,nights,guests,guest,status,total_eur');
  assert.equal(csv[1], 'BK-0001,fern,2025-06-10,2025-06-13,3,2,Ada Brooks,confirmed,420.00');
  assert.equal(csv[3], 'BK-0003,fern,2025-06-10,2025-06-13,3,2,"Brooks, Ada ""Ace""",confirmed,');
  assert.equal(csv.at(-1), '');
});

test('the calendar file has one all-day event per confirmed stay', () => {
  const ics = cabinCalendarFile('fern', bookings).split('\r\n');
  assert.deepEqual(ics.slice(4, 8), ['BEGIN:VEVENT', 'UID:BK-0001@example.com', 'DTSTART;VALUE=DATE:20250610', 'DTEND;VALUE=DATE:20250613']);
  assert.equal(ics.filter((l) => l === 'BEGIN:VEVENT').length, 1);
  assert.equal(cabinCalendarFile('fern', [{ ...bookings[0], status: 'cancelled' }]).includes('VEVENT'), false);
});

test('the price sheet shows each cabin in a season', () => {
  assert.equal(renderCabinList('high').split('\n')[1], '  Fern cabin      sleeps 2  weekday  125.00 EUR  weekend  150.00 EUR');
  assert.throws(() => renderCabinList('winter'), /unknown season: winter \(low, mid, high\)/);
});
