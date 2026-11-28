// What a booking costs: the room's hourly price for each hour, with weekend hours a quarter dearer. Amounts are whole
// cents, rounded once per amount, half up.
import { addHours, hoursBetween, isWeekend } from './time.js';

const WEEKEND_PERCENT = 125;
const FULL_REFUND_HOURS = 48;
const HALF_REFUND_HOURS = 24;

/** cents * percent / 100 in whole cents, rounded half up. */
export function percentOf(cents, percent) {
  return Math.floor((cents * percent + 50) / 100);
}

/** How many of the hours from start to end fall on a weekday and how many on a weekend. */
export function splitHours(start, end) {
  const hours = hoursBetween(start, end);
  let weekday = 0;
  let weekend = 0;
  for (let h = 0; h < hours; h++) {
    if (isWeekend(addHours(start, h))) weekend++;
    else weekday++;
  }
  return { weekday, weekend };
}

/** { cents, currency } for a room from start to end, both on the hour. */
export function priceFor(room, start, end) {
  const { weekday, weekend } = splitHours(start, end);
  const cents = room.hourlyCents * weekday + percentOf(room.hourlyCents * weekend, WEEKEND_PERCENT);
  return { cents, currency: room.currency };
}

/**
 * The refund for cancelling a booking at now, as { cents, currency }: the whole price 48 hours or more before the
 * start, half of it (rounded half up) 24 hours or more before, nothing later.
 */
export function refundFor(booking, now) {
  const hoursLeft = hoursBetween(booking.start, now);
  const percent = hoursLeft >= FULL_REFUND_HOURS ? 100 : hoursLeft >= HALF_REFUND_HOURS ? 50 : 0;
  return { cents: percentOf(booking.price.cents, percent), currency: booking.price.currency };
}
