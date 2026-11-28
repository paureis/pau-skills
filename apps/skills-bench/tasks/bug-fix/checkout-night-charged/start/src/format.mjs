// Text for the terminal: amounts, quotes and bookings.
import { CURRENCY } from './cabins.mjs';
import { describeStay } from './stay.mjs';

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
