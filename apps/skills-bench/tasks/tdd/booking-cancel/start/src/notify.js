// The emails the booking desk sends, as { to, subject, lines }. Sending them is the mail service's job.
import { getCustomer } from './customers.js';
import { formatMoney } from './invoice.js';
import { getRoom } from './rooms.js';
import { formatInstant, hoursBetween, toMs, HOUR_MS } from './time.js';

const REMINDER_HOURS = 24;

function about(directory, booking) {
  const customer = getCustomer(directory, booking.customerId);
  const room = getRoom(booking.roomId);
  const when = `${formatInstant(booking.start)} to ${formatInstant(booking.end).slice(11)} UTC`;
  return { customer, room, when };
}

/** The confirmation sent when a booking is made. */
export function confirmationEmail(directory, booking) {
  const { customer, room, when } = about(directory, booking);
  return {
    to: customer.email,
    subject: `Booked: ${room.name}, ${formatInstant(booking.start)}`,
    lines: [
      `Hello ${customer.name},`,
      `${room.name} (${room.seats} seats) is yours on ${when}.`,
      `Price: ${formatMoney(booking.price)}`,
      `Booking reference: ${booking.id}`,
    ],
  };
}

/** The reminders due at now: one for each booking that starts in the next 24 hours, earliest first. */
export function dueReminders(store, directory, now) {
  const from = toMs(now);
  return store.bookings
    .filter((b) => toMs(b.start) > from && toMs(b.start) - from <= REMINDER_HOURS * HOUR_MS)
    .sort((a, b) => toMs(a.start) - toMs(b.start))
    .map((b) => {
      const { customer, room, when } = about(directory, b);
      return {
        to: customer.email,
        subject: `Reminder: ${room.name} in ${hoursBetween(now, b.start)} h`,
        lines: [`Hello ${customer.name},`, `See you in ${room.name} on ${when}.`, `Booking reference: ${b.id}`],
      };
    });
}
