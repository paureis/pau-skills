// Which nights of a cabin are taken. Two stays clash when they share a night; cancelled bookings hold no nights.
import { addDays } from './dates.mjs';
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

/** The first free stay of the given length in a cabin, starting on or after a day, within the next 365 days. */
export function firstFreeStay(cabinCode, from, nights, bookings) {
  for (let i = 0; i < 365; i++) {
    const checkIn = addDays(from, i);
    const stay = { cabin: cabinCode, checkIn, checkOut: addDays(checkIn, nights), guests: 1 };
    if (isFree(stay, bookings)) return stay;
  }
  return null;
}
