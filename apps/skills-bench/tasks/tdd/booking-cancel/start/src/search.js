// Finding a room for a meeting: the rooms with enough seats that are free for the whole time, smallest first.
import { roomsFor } from './rooms.js';
import { roomBookings } from './bookings.js';
import { overlaps } from './time.js';
import { priceFor } from './pricing.js';

/** The rooms with at least this many seats that are free from start to end, smallest first. */
export function freeRooms(store, seats, start, end) {
  return roomsFor(seats).filter((r) => !roomBookings(store, r.id).some((b) => overlaps(b.start, b.end, start, end)));
}

/** The smallest free room with enough seats and what it would cost, as { room, price }, or null. */
export function bestRoom(store, seats, start, end) {
  const [room] = freeRooms(store, seats, start, end);
  return room ? { room, price: priceFor(room, start, end) } : null;
}
