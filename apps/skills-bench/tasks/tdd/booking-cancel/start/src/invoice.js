// A customer's invoice: one line per booking, earliest first, and the total. Amounts are whole cents in one currency.
import { BookingError } from './errors.js';
import { bookingsOf } from './bookings.js';
import { getCustomer } from './customers.js';
import { getRoom } from './rooms.js';
import { formatInstant, hoursBetween } from './time.js';

/** "12.50 EUR" for { cents, currency }; a negative amount is "-12.50 EUR". */
export function formatMoney({ cents, currency }) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')} ${currency}`;
}

function bookingLine(b) {
  const room = getRoom(b.roomId);
  const hours = hoursBetween(b.start, b.end);
  return { bookingId: b.id, kind: 'booking', description: `${room.name}, ${formatInstant(b.start)}, ${hours} h`, cents: b.price.cents };
}

/** { customerId, currency, lines: [{ bookingId, kind, description, cents }], totalCents } for one customer. */
export function invoiceFor(store, customerId) {
  const lines = [];
  let currency = null;
  for (const b of bookingsOf(store, customerId)) {
    if (currency && b.price.currency !== currency) {
      throw new BookingError('MIXED_CURRENCY', `booking ${b.id} is in ${b.price.currency}, not ${currency}`);
    }
    currency = b.price.currency;
    lines.push(bookingLine(b));
  }
  return { customerId, currency, lines, totalCents: lines.reduce((sum, l) => sum + l.cents, 0) };
}

/** The invoice as plain text lines for email or print, addressed to the customer in the directory. */
export function invoiceText(invoice, directory) {
  const customer = getCustomer(directory, invoice.customerId);
  const head = [`Invoice for ${customer.name} <${customer.email}>`];
  if (!invoice.lines.length) return [...head, 'No bookings.'];
  const money = (cents) => formatMoney({ cents, currency: invoice.currency });
  return [...head, ...invoice.lines.map((l) => `${l.description}: ${money(l.cents)}`), `Total: ${money(invoice.totalCents)}`];
}
