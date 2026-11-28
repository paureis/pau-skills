// Bookings live in a store from createStore(). Times are UTC instants, and "now" is passed in by the caller.
import { BookingError } from './errors.js';
import { getRoom } from './rooms.js';
import { addHours, hoursBetween, onTheHour, overlaps, toMs } from './time.js';
import { priceFor, refundFor } from './pricing.js';

const MAX_HOURS = 12;
const byStart = (a, b) => toMs(a.start) - toMs(b.start) || (a.id < b.id ? -1 : 1);

/** An empty store. */
export function createStore() {
  return { bookings: [], nextId: 1 };
}

/** True while a booking holds its time, that is until it is cancelled. */
export const holdsTime = (b) => b.status !== 'cancelled';

/** The bookings that hold time in a room, earliest first. */
export function roomBookings(store, roomId) {
  return store.bookings.filter((b) => b.roomId === roomId).sort(byStart);
}

function checkTimes(start, end, now) {
  if (!onTheHour(start) || !onTheHour(end)) throw new BookingError('NOT_ON_THE_HOUR', 'a booking starts and ends on the hour');
  const hours = hoursBetween(start, end);
  if (hours < 1 || hours > MAX_HOURS) throw new BookingError('BAD_LENGTH', `a booking is 1 to ${MAX_HOURS} hours`);
  if (toMs(start) < toMs(now)) throw new BookingError('IN_THE_PAST', 'a booking cannot start in the past');
}

function checkFree(store, roomId, start, end, except = null) {
  const clash = roomBookings(store, roomId).find((b) => b.id !== except && overlaps(b.start, b.end, start, end));
  if (clash) throw new BookingError('SLOT_TAKEN', `${getRoom(roomId).name} is booked from ${clash.start} to ${clash.end}`);
}

/**
 * Books a room for a customer from start to end: on the hour, 1 to 12 hours, not in the past and not over another
 * booking of the same room. Returns the booking, priced when it was made.
 */
export function book(store, { roomId, customerId, start, end }, now) {
  const room = getRoom(roomId);
  if (typeof customerId !== 'string' || !customerId.trim()) throw new BookingError('BAD_CUSTOMER', 'a booking needs a customer id');
  checkTimes(start, end, now);
  checkFree(store, roomId, start, end);
  const booking = { id: `b${store.nextId++}`, roomId, customerId, start, end, price: priceFor(room, start, end), bookedAt: now, status: 'booked' };
  store.bookings.push(booking);
  return booking;
}

/** The booking with this id; throws a BookingError NO_BOOKING for any other id. */
export function getBooking(store, id) {
  const booking = store.bookings.find((b) => b.id === id);
  if (!booking) throw new BookingError('NO_BOOKING', `no booking with id ${id}`);
  return booking;
}

/**
 * Moves a booking that has not started to a new start, keeping its length, and prices it again. Throws a
 * BookingError ALREADY_STARTED, or the errors book gives for the new time.
 */
export function moveBooking(store, id, newStart, now) {
  const booking = getBooking(store, id);
  if (!holdsTime(booking)) throw new BookingError('ALREADY_CANCELLED', `booking ${id} is cancelled`);
  if (toMs(now) >= toMs(booking.start)) throw new BookingError('ALREADY_STARTED', `booking ${id} has started`);
  const newEnd = addHours(newStart, hoursBetween(booking.start, booking.end));
  checkTimes(newStart, newEnd, now);
  checkFree(store, booking.roomId, newStart, newEnd, id);
  booking.start = newStart;
  booking.end = newEnd;
  booking.price = priceFor(getRoom(booking.roomId), newStart, newEnd);
  return booking;
}

/**
 * Cancels a booking at now: it stops holding its time, and the refund from refundFor is kept on it. Returns the
 * booking. Throws a BookingError NO_BOOKING, ALREADY_CANCELLED, or ALREADY_STARTED at or after its start.
 */
export function cancelBooking(store, id, now) {
  const booking = getBooking(store, id);
  if (!holdsTime(booking)) throw new BookingError('ALREADY_CANCELLED', `booking ${id} is already cancelled`);
  if (toMs(now) >= toMs(booking.start)) throw new BookingError('ALREADY_STARTED', `booking ${id} has started`);
  booking.status = 'cancelled';
  booking.cancelledAt = now;
  booking.refund = refundFor(booking, now);
  return booking;
}

/** A customer's bookings, earliest start first. */
export function bookingsOf(store, customerId) {
  return store.bookings.filter((b) => b.customerId === customerId).sort(byStart);
}

/** A customer's bookings that start after now, earliest first. */
export function upcoming(store, customerId, now) {
  return bookingsOf(store, customerId).filter((b) => toMs(b.start) > toMs(now));
}
