// Text for the terminal: amounts, quotes and bookings.
import { CURRENCY } from './cabins.mjs';
import { describeStay } from './stay.mjs';
import { daysBetween } from './dates.mjs';
import { cabinOf, cabinCodes } from './cabins.mjs';
import { seasonNamed, priceInSeason } from './seasons.mjs';

/** 45500 -> "455.00 EUR". */
export function formatCents(cents, currency = CURRENCY) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')} ${currency}`;
}

const row = (label, cents, currency) => `${label.padEnd(26)}${formatCents(cents, currency).padStart(14)}`;

export function renderQuote(quote) {
  const out = [describeStay(quote.stay)];
  for (const n of quote.nights) {
    out.push(row(`  ${n.weekday} ${n.day}  ${n.weekend ? 'weekend' : '       '}`, n.cents, quote.currency));
  }
  out.push(row(`${quote.nights.length} ${quote.nights.length === 1 ? 'night' : 'nights'}`, quote.nightsCents, quote.currency));
  if (quote.discountCents > 0) out.push(row('Long stay discount', -quote.discountCents, quote.currency));
  out.push(row('Cleaning', quote.cleaningCents, quote.currency));
  out.push(row('Total', quote.totalCents, quote.currency));
  return out.join('\n');
}

export function renderBooking(booking, quote, verb = 'Booked') {
  const nights = quote.nights.length;
  return `${verb} ${booking.id} for ${booking.guest}: ${describeStay(booking)}, ${nights} ${nights === 1 ? 'night' : 'nights'}, ${formatCents(booking.totalCents)}`;
}

/** One line per booking: id, cabin, dates, nights, guest, status and total. */
export function renderBookingList(bookings) {
  if (bookings.length === 0) return 'No bookings match.';
  return bookings.map((b) => {
    const nights = daysBetween(b.checkIn, b.checkOut);
    const total = Number.isInteger(b.totalCents) ? formatCents(b.totalCents) : 'no price';
    const dates = `${b.checkIn} to ${b.checkOut}`;
    return [b.id, cabinOf(b.cabin).name.padEnd(15), dates, `${nights} ${nights === 1 ? 'night' : 'nights'}`.padEnd(9), b.guest.padEnd(16), b.status.padEnd(10), total].join('  ');
  }).join('\n');
}

export function renderFreeRanges(cabinCode, ranges) {
  const out = [`${cabinOf(cabinCode).name}: free`];
  if (ranges.length === 0) out.push('  no free nights in this period');
  for (const r of ranges) {
    const nights = daysBetween(r.checkIn, r.checkOut);
    out.push(`  ${r.checkIn} to ${r.checkOut}  ${nights} ${nights === 1 ? 'night' : 'nights'}`);
  }
  return out.join('\n');
}

/** The cabins with their nightly prices in a season, for the price sheet. */
export function renderCabinList(seasonName) {
  const season = seasonNamed(seasonName);
  const out = [`Prices in the ${season.name} season, at least ${season.minNights} ${season.minNights === 1 ? 'night' : 'nights'}`];
  for (const code of cabinCodes()) {
    const c = cabinOf(code);
    const price = (cents) => formatCents(priceInSeason(cents, season)).padStart(12);
    out.push(`  ${c.name.padEnd(16)}sleeps ${c.sleeps}  weekday${price(c.weekdayCents)}  weekend${price(c.weekendCents)}`);
  }
  return out.join('\n');
}
