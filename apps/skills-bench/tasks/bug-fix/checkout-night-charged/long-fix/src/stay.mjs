// A stay: a cabin from the check-in day to the check-out day. Guests sleep the nights in between and leave on the
// morning of the check-out day, so the next guests can arrive that same afternoon.
import { parseDay, eachDay, daysBetween, addDays } from './dates.mjs';
import { cabinOf, checkGuests } from './cabins.mjs';

export const MAX_NIGHTS = 28;

export function parseStay({ cabin, checkIn, checkOut, guests = 2 }) {
  const c = cabinOf(cabin);
  const first = parseDay(checkIn);
  const leave = parseDay(checkOut);
  if (leave <= first) throw new Error(`check-out ${leave} must be after check-in ${first}`);
  if (daysBetween(first, leave) > MAX_NIGHTS) throw new Error(`a stay is at most ${MAX_NIGHTS} nights`);
  checkGuests(c, guests);
  return { cabin, checkIn: first, checkOut: leave, guests };
}

/** The nights of a stay, each named by the day it starts. No night starts on the check-out day. */
export function stayNights(stay) {
  return eachDay(stay.checkIn, addDays(stay.checkOut, -1));
}

export function describeStay(stay) {
  return `${cabinOf(stay.cabin).name}, ${stay.checkIn} to ${stay.checkOut}, ${stay.guests} ${stay.guests === 1 ? 'guest' : 'guests'}`;
}

/** How many nights a stay has. */
export function nightCount(stay) {
  return stayNights(stay).length;
}

/** True when a day is the check-out day of a stay: the guests leave that morning. */
export function isCheckOutDay(stay, day) {
  return day === stay.checkOut;
}

/** True when two stays in the same cabin share at least one night. */
export function overlaps(a, b) {
  if (a.cabin !== b.cabin) return false;
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}
