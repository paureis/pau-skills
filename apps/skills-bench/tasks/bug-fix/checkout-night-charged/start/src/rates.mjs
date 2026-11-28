// What a stay costs: each night at the cabin's weekday or weekend price in that night's season, a discount for long
// stays, and the cleaning fee. All amounts are whole cents in CURRENCY.
import { weekday } from './dates.mjs';
import { cabinOf, CURRENCY } from './cabins.mjs';
import { seasonOf, seasonPrice } from './seasons.mjs';
import { stayNights } from './stay.mjs';

const WEEKEND_NIGHTS = new Set(['Fri', 'Sat']);
export const LONG_STAY_NIGHTS = 7;
const LONG_STAY_DISCOUNT_BASIS_POINTS = 1_000;

/** The price of the night that starts on a day. */
export function nightlyRate(cabinCode, day) {
  const cabin = cabinOf(cabinCode);
  const name = weekday(day);
  const weekend = WEEKEND_NIGHTS.has(name);
  const cents = seasonPrice(weekend ? cabin.weekendCents : cabin.weekdayCents, day);
  return { day, weekday: name, weekend, season: seasonOf(day).name, cents };
}

export function quoteStay(stay) {
  const cabin = cabinOf(stay.cabin);
  const nights = stayNights(stay).map((day) => nightlyRate(stay.cabin, day));
  const season = seasonOf(stay.checkIn);
  if (nights.length < season.minNights) {
    throw new Error(`a stay starting in the ${season.name} season is at least ${season.minNights} nights`);
  }
  const nightsCents = nights.reduce((sum, n) => sum + n.cents, 0);
  const discountCents = nights.length >= LONG_STAY_NIGHTS
    ? Math.floor((nightsCents * LONG_STAY_DISCOUNT_BASIS_POINTS + 5_000) / 10_000)
    : 0;
  return {
    stay,
    cabinName: cabin.name,
    currency: CURRENCY,
    nights,
    nightsCents,
    discountCents,
    cleaningCents: cabin.cleaningCents,
    totalCents: nightsCents - discountCents + cabin.cleaningCents,
  };
}
