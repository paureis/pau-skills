// Seasons by month. A season sets the share of the base price, in basis points (10000 is the base price), and the
// fewest nights a stay that starts in it may have.
import { monthOf } from './dates.mjs';

const SEASONS = [
  { name: 'low', months: [11, 12, 1, 2, 3], rateBasisPoints: 9_000, minNights: 1 },
  { name: 'mid', months: [4, 5, 9, 10], rateBasisPoints: 10_000, minNights: 1 },
  { name: 'high', months: [6, 7, 8], rateBasisPoints: 12_500, minNights: 2 },
];

export function seasonOf(day) {
  const month = monthOf(day);
  return SEASONS.find((s) => s.months.includes(month));
}

/** A base price in the season of a day, rounded half up to whole cents. */
export function seasonPrice(cents, day) {
  return Math.floor((cents * seasonOf(day).rateBasisPoints + 5_000) / 10_000);
}
