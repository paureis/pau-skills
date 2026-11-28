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

/**
 * The day the last night starts: guests leave on the morning of the check-out day, so no night starts on it.
 */
export function lastNight(stay) {
  return addDays(stay.checkOut, -1);
}

/** The nights of a stay, each named by the day it starts, from check-in to the last night. */
export function stayNights(stay) {
  return eachDay(stay.checkIn, lastNight(stay));
}

export function describeStay(stay) {
  return `${cabinOf(stay.cabin).name}, ${stay.checkIn} to ${stay.checkOut}, ${stay.guests} ${stay.guests === 1 ? 'guest' : 'guests'}`;
}
