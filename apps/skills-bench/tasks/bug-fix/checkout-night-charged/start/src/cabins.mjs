// The cabins for rent. Prices are whole cents in euros for one night, before the season is applied.
export const CURRENCY = 'EUR';

const CABINS = new Map([
  ['fern', { name: 'Fern cabin', sleeps: 2, weekdayCents: 10_000, weekendCents: 12_000, cleaningCents: 4_500 }],
  ['birch', { name: 'Birch cabin', sleeps: 4, weekdayCents: 14_000, weekendCents: 16_500, cleaningCents: 6_000 }],
  ['lakeview', { name: 'Lakeview lodge', sleeps: 8, weekdayCents: 26_000, weekendCents: 31_000, cleaningCents: 9_000 }],
]);

export function cabinCodes() {
  return [...CABINS.keys()];
}

export function cabinOf(code) {
  if (!CABINS.has(code)) throw new Error(`unknown cabin: ${code} (${cabinCodes().join(', ')})`);
  return { code, ...CABINS.get(code) };
}

export function checkGuests(cabin, guests) {
  if (!Number.isInteger(guests) || guests < 1) throw new Error(`guests must be a whole number above 0, got ${guests}`);
  if (guests > cabin.sleeps) throw new Error(`${cabin.name} sleeps ${cabin.sleeps}, not ${guests}`);
  return guests;
}
