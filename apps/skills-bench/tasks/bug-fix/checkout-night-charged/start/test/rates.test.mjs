import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightlyRate, quoteStay } from '../src/rates.mjs';
import { parseStay } from '../src/stay.mjs';
import { seasonOf, seasonPrice } from '../src/seasons.mjs';
import { formatCents } from '../src/format.mjs';

test('each month has a season', () => {
  assert.equal(seasonOf('2025-01-15').name, 'low');
  assert.equal(seasonOf('2025-05-15').name, 'mid');
  assert.equal(seasonOf('2025-07-15').name, 'high');
  assert.equal(seasonPrice(16_500, '2025-06-01'), 20_625);
});

test('a night costs the weekday or weekend price in its season', () => {
  assert.deepEqual(nightlyRate('fern', '2025-06-13'), { day: '2025-06-13', weekday: 'Fri', weekend: true, season: 'high', cents: 15_000 });
  assert.equal(nightlyRate('fern', '2025-01-06').cents, 9_000);
  assert.equal(nightlyRate('birch', '2025-05-10').cents, 16_500);
});

test('a quote is in euros and includes the cleaning fee', () => {
  const quote = quoteStay(parseStay({ cabin: 'birch', checkIn: '2025-05-05', checkOut: '2025-05-07', guests: 3 }));
  assert.equal(quote.currency, 'EUR');
  assert.equal(quote.cleaningCents, 6_000);
  assert.equal(quote.totalCents, quote.nightsCents - quote.discountCents + quote.cleaningCents);
});

test('a stay that does not fit is refused', () => {
  assert.throws(() => parseStay({ cabin: 'fern', checkIn: '2025-06-13', checkOut: '2025-06-16', guests: 3 }), /Fern cabin sleeps 2, not 3/);
  assert.throws(() => parseStay({ cabin: 'fern', checkIn: '2025-06-13', checkOut: '2025-06-13' }), /must be after check-in/);
  assert.throws(() => parseStay({ cabin: 'oak', checkIn: '2025-06-13', checkOut: '2025-06-14' }), /unknown cabin: oak \(fern, birch, lakeview\)/);
  assert.throws(() => parseStay({ cabin: 'fern', checkIn: '2025-06-01', checkOut: '2025-07-15' }), /at most 28 nights/);
});

test('amounts print in euros', () => {
  assert.equal(formatCents(47_000), '470.00 EUR');
  assert.equal(formatCents(-14_938), '-149.38 EUR');
});
