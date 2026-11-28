// Which nights of a cabin are taken. Two stays clash when they share a night; cancelled bookings hold no nights.
import { addDays, eachDay, parseDay } from './dates.mjs';
import { cabinOf } from './cabins.mjs';
import { stayNights } from './stay.mjs';

const holdsNights = (booking) => booking.status !== 'cancelled';

/** The taken nights of a cabin, each mapped to the booking that holds it. */
export function takenNights(bookings, cabinCode) {
  const taken = new Map();
  for (const booking of bookings) {
    if (booking.cabin !== cabinCode || !holdsNights(booking)) continue;
    for (const night of stayNights(booking)) taken.set(night, booking);
  }
  return taken;
}

/** The nights of a stay that are already taken, with the booking that holds each. */
export function clashes(stay, bookings) {
  const taken = takenNights(bookings, stay.cabin);
  return stayNights(stay).filter((night) => taken.has(night)).map((night) => ({ night, booking: taken.get(night) }));
}

export function isFree(stay, bookings) {
  return clashes(stay, bookings).length === 0;
}

/**
 * The free stretches of a cabin between two days: each is a stay from a check-in to the morning after its last free
 * night. The night that starts on the last day is outside the period.
 */
export function freeRanges(cabinCode, from, to, bookings) {
  cabinOf(cabinCode);
  const first = parseDay(from);
  const end = parseDay(to);
  if (end <= first) throw new Error(`the period must end after ${first}`);
  const taken = takenNights(bookings, cabinCode);
  const ranges = [];
  let open = null;
  for (const night of eachDay(first, addDays(end, -1))) {
    if (taken.has(night)) {
      if (open) ranges.push({ checkIn: open, checkOut: night });
      open = null;
    } else if (!open) {
      open = night;
    }
  }
  if (open) ranges.push({ checkIn: open, checkOut: end });
  return ranges;
}

/** The first free stay of the given length in a cabin, starting on or after a day, within the next 365 days. */
export function firstFreeStay(cabinCode, from, nights, bookings) {
  for (let i = 0; i < 365; i++) {
    const checkIn = addDays(from, i);
    const stay = { cabin: cabinCode, checkIn, checkOut: addDays(checkIn, nights), guests: 1 };
    if (isFree(stay, bookings)) return stay;
  }
  return null;
}
