import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadBookings } from '../src/bookings.mjs';
import { monthCalendar, renderCalendar } from '../src/calendar.mjs';
import { monthReport } from '../src/report.mjs';

const bookings = loadBookings(fileURLToPath(new URL('../data/bookings.json', import.meta.url)));

test('a month calendar has every day of the month', () => {
  const june = monthCalendar('fern', 2025, 6, bookings);
  assert.equal(june.days.length, 30);
  assert.equal(june.days.at(-1).day, '2025-06-30');
});

test('the nights of a booking show its id', () => {
  const byDay = new Map(monthCalendar('fern', 2025, 6, bookings).days.map((d) => [d.day, d.booking]));
  assert.equal(byDay.get('2025-06-09'), null);
  assert.equal(byDay.get('2025-06-10'), 'BK-0001');
  assert.equal(byDay.get('2025-06-12'), 'BK-0001');
});

test('the calendar prints weeks from Monday', () => {
  const lines = renderCalendar(monthCalendar('lakeview', 2025, 6, bookings)).split('\n');
  assert.deepEqual(lines.slice(0, 4), ['Lakeview lodge, June 2025', 'Mo Tu We Th Fr Sa Su', '                   1', ' 2  3  4  5  6  7  8']);
  assert.equal(lines.at(-2), '30');
  assert.equal(lines.at(-1), '0 of 30 nights taken');
});

test('the month report counts the stays that start in the month and their takings', () => {
  const report = monthReport(2025, 6, bookings);
  assert.deepEqual(report.rows.map((r) => [r.cabin, r.stays, r.takingsCents]), [
    ['Fern cabin', 1, 42_000], ['Birch cabin', 1, 121_875], ['Lakeview lodge', 0, 0],
  ]);
  assert.equal(report.takingsCents, 163_875);
});
