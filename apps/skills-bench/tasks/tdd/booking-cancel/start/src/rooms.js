// The rooms that can be booked. Prices are whole cents an hour, with the currency next to them.
import { BookingError } from './errors.js';

const ROOMS = new Map([
  ['pine', { id: 'pine', name: 'Pine booth', seats: 2, hourlyCents: 1999, currency: 'EUR' }],
  ['oak', { id: 'oak', name: 'Oak room', seats: 6, hourlyCents: 2500, currency: 'EUR' }],
  ['maple', { id: 'maple', name: 'Maple room', seats: 10, hourlyCents: 4000, currency: 'EUR' }],
  ['cedar', { id: 'cedar', name: 'Cedar hall', seats: 40, hourlyCents: 12000, currency: 'EUR' }],
]);

/** The room with this id; throws a BookingError UNKNOWN_ROOM for any other id. */
export function getRoom(id) {
  const room = ROOMS.get(id);
  if (!room) throw new BookingError('UNKNOWN_ROOM', `no room with id ${id}`);
  return room;
}

/** Every room, smallest first. */
export function allRooms() {
  return [...ROOMS.values()].sort((a, b) => a.seats - b.seats);
}

/** The rooms with at least this many seats, smallest first. */
export function roomsFor(seats) {
  if (!Number.isInteger(seats) || seats < 1) throw new RangeError(`seats must be a whole number of 1 or more, got ${seats}`);
  return allRooms().filter((r) => r.seats >= seats);
}
