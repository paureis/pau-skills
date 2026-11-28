import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, book, cancelBooking } from '../src/bookings.js';
import { createDirectory, addCustomer, getCustomer, findCustomers } from '../src/customers.js';
import { invoiceFor, invoiceText, formatMoney } from '../src/invoice.js';
import { confirmationEmail, dueReminders } from '../src/notify.js';
import { bookingIcs, icsEscape } from '../src/calendar.js';

const NOW = '2026-03-02T08:00:00Z';
const req = (roomId, start, end, customerId = 'ana') => ({ roomId, customerId, start, end });

function setUp() {
  const store = createStore();
  const directory = createDirectory();
  addCustomer(directory, { id: 'ana', name: 'Ana Lind', email: 'Ana@example.com' });
  addCustomer(directory, { id: 'ben', name: 'Ben Okafor', email: 'ben@example.com' });
  return { store, directory };
}

test('an invoice has a line per booking, earliest first, and the total', () => {
  const { store } = setUp();
  book(store, req('oak', '2026-03-04T09:00:00Z', '2026-03-04T11:00:00Z'), NOW);
  book(store, req('pine', '2026-03-03T09:00:00Z', '2026-03-03T10:00:00Z'), NOW);
  book(store, req('maple', '2026-03-03T09:00:00Z', '2026-03-03T10:00:00Z', 'ben'), NOW);
  const invoice = invoiceFor(store, 'ana');
  assert.deepEqual(invoice.lines, [
    { bookingId: 'b2', kind: 'booking', description: 'Pine booth, 2026-03-03 09:00, 1 h', cents: 1999 },
    { bookingId: 'b1', kind: 'booking', description: 'Oak room, 2026-03-04 09:00, 2 h', cents: 5000 },
  ]);
  assert.equal(invoice.totalCents, 6999);
  assert.equal(invoice.currency, 'EUR');
});

test('the invoice text is addressed to the customer and ends with the total', () => {
  const { store, directory } = setUp();
  book(store, req('pine', '2026-03-03T09:00:00Z', '2026-03-03T10:00:00Z'), NOW);
  assert.deepEqual(invoiceText(invoiceFor(store, 'ana'), directory), [
    'Invoice for Ana Lind <ana@example.com>',
    'Pine booth, 2026-03-03 09:00, 1 h: 19.99 EUR',
    'Total: 19.99 EUR',
  ]);
  assert.deepEqual(invoiceText(invoiceFor(store, 'ben'), directory), ['Invoice for Ben Okafor <ben@example.com>', 'No bookings.']);
  assert.equal(formatMoney({ cents: -1250, currency: 'EUR' }), '-12.50 EUR');
});

test('customers need a unique id, a name and an email address', () => {
  const { directory } = setUp();
  assert.throws(() => addCustomer(directory, { id: 'ana', name: 'Ana Two', email: 'two@example.com' }), { code: 'DUPLICATE_CUSTOMER' });
  assert.throws(() => addCustomer(directory, { id: 'cy', name: ' ', email: 'cy@example.com' }), { code: 'BAD_NAME' });
  assert.throws(() => addCustomer(directory, { id: 'cy', name: 'Cy', email: 'cy-at-example.com' }), { code: 'BAD_EMAIL' });
  assert.throws(() => getCustomer(directory, 'cy'), { code: 'UNKNOWN_CUSTOMER' });
  assert.deepEqual(findCustomers(directory, 'o').map((c) => c.id), ['ben']);
});

test('the confirmation email names the room, the time and the price', () => {
  const { store, directory } = setUp();
  const b = book(store, req('oak', '2026-03-04T09:00:00Z', '2026-03-04T11:00:00Z'), NOW);
  assert.deepEqual(confirmationEmail(directory, b), {
    to: 'ana@example.com',
    subject: 'Booked: Oak room, 2026-03-04 09:00',
    lines: ['Hello Ana Lind,', 'Oak room (6 seats) is yours on 2026-03-04 09:00 to 11:00 UTC.', 'Price: 50.00 EUR', 'Booking reference: b1'],
  });
});

test('reminders go out for the bookings that start in the next 24 hours', () => {
  const { store, directory } = setUp();
  book(store, req('oak', '2026-03-04T09:00:00Z', '2026-03-04T11:00:00Z'), NOW);
  book(store, req('pine', '2026-03-03T08:00:00Z', '2026-03-03T09:00:00Z', 'ben'), NOW);
  book(store, req('pine', '2026-03-02T09:00:00Z', '2026-03-02T10:00:00Z'), NOW);
  const due = dueReminders(store, directory, NOW);
  assert.deepEqual(due.map((r) => [r.to, r.subject]), [
    ['ana@example.com', 'Reminder: Pine booth in 1 h'],
    ['ben@example.com', 'Reminder: Pine booth in 24 h'],
  ]);
});

test('a booking exports as a calendar event with CRLF lines', () => {
  const { store } = setUp();
  const b = book(store, req('cedar', '2026-03-04T09:00:00Z', '2026-03-04T11:00:00Z'), NOW);
  const ics = bookingIcs(b, NOW);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('\r\nDTSTART:20260304T090000Z\r\nDTEND:20260304T110000Z\r\n'));
  assert.ok(ics.includes('\r\nSUMMARY:Cedar hall\\, 40 seats\r\n'));
  assert.equal(icsEscape('a;b,c\nd'), 'a\\;b\\,c\\nd');
});

test('a refund follows the cancelled booking on the invoice and lowers the total', () => {
  const { store } = setUp();
  book(store, req('oak', '2026-03-05T09:00:00Z', '2026-03-05T11:00:00Z'), NOW);
  const pine = book(store, req('pine', '2026-03-06T09:00:00Z', '2026-03-06T10:00:00Z'), NOW);
  cancelBooking(store, pine.id, '2026-03-05T03:00:00Z');
  const invoice = invoiceFor(store, 'ana');
  assert.deepEqual(invoice.lines.slice(1), [
    { bookingId: 'b2', kind: 'booking', description: 'Pine booth, 2026-03-06 09:00, 1 h', cents: 1999 },
    { bookingId: 'b2', kind: 'refund', description: 'Refund, Pine booth, cancelled 2026-03-05 03:00', cents: -1000 },
  ]);
  assert.equal(invoice.totalCents, 5999);
});

test('a cancellation with nothing to refund adds no line', () => {
  const { store } = setUp();
  const b = book(store, req('oak', '2026-03-05T09:00:00Z', '2026-03-05T11:00:00Z'), NOW);
  cancelBooking(store, b.id, '2026-03-05T08:00:00Z');
  assert.deepEqual(invoiceFor(store, 'ana').lines.map((l) => l.kind), ['booking']);
  assert.equal(invoiceFor(store, 'ana').totalCents, 5000);
});
