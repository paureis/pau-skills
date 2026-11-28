// Room usage for the office manager: booked hours and how full a room was over a period [from, to).
import { allRooms, getRoom } from './rooms.js';
import { holdsTime } from './bookings.js';
import { hoursBetween, toMs, HOUR_MS } from './time.js';

/** The hours of a booking inside [from, to), the parts outside cut off. */
function hoursInside(b, from, to) {
  const start = Math.max(toMs(b.start), toMs(from));
  const end = Math.min(toMs(b.end), toMs(to));
  return end > start ? (end - start) / HOUR_MS : 0;
}

function checkPeriod(from, to) {
  if (!(hoursBetween(from, to) > 0)) throw new RangeError('the period must end after it starts');
}

/** The booked hours of a room inside the period; cancelled bookings do not count. */
export function roomUsage(store, roomId, from, to) {
  getRoom(roomId);
  checkPeriod(from, to);
  return store.bookings.filter((b) => b.roomId === roomId).reduce((sum, b) => sum + hoursInside(b, from, to), 0);
}

/** The share of the period's hours a room was booked, 0 to 1, rounded to two decimals. */
export function occupancy(store, roomId, from, to) {
  return Math.round((roomUsage(store, roomId, from, to) / hoursBetween(from, to)) * 100) / 100;
}

/** [{ roomId, name, hours }] for every room with booked hours in the period, busiest first, then by id. */
export function usageByRoom(store, from, to) {
  return allRooms()
    .map((r) => ({ roomId: r.id, name: r.name, hours: roomUsage(store, r.id, from, to) }))
    .filter((r) => r.hours > 0)
    .sort((a, b) => b.hours - a.hours || (a.roomId < b.roomId ? -1 : 1));
}
