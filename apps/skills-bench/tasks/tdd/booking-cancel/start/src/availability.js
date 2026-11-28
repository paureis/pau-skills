// Free hours of a room on a day, for the booking page. Rooms open at 08:00 and close at 20:00 UTC.
import { getRoom } from './rooms.js';
import { roomBookings } from './bookings.js';
import { addHours, dayStart, overlaps, toMs } from './time.js';

const OPEN_HOUR = 8;
const CLOSE_HOUR = 20;

/** The start of every free hour of the room on the day, from opening to closing, leaving out hours before now. */
export function freeHours(store, roomId, day, now) {
  getRoom(roomId);
  const taken = roomBookings(store, roomId);
  const out = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    const start = addHours(dayStart(day), h);
    const end = addHours(start, 1);
    if (toMs(start) < toMs(now)) continue;
    if (!taken.some((b) => overlaps(b.start, b.end, start, end))) out.push(start);
  }
  return out;
}

/** The longest run of free hours on the day as { start, hours }, the earliest when two are as long, or null. */
export function longestFreeRun(store, roomId, day, now) {
  let best = null;
  let run = null;
  for (const start of freeHours(store, roomId, day, now)) {
    if (run && toMs(start) === toMs(addHours(run.start, run.hours))) run.hours++;
    else run = { start, hours: 1 };
    if (!best || run.hours > best.hours) best = { ...run };
  }
  return best;
}
