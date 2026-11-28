// Instants are ISO 8601 strings in UTC, such as "2026-03-02T09:00:00Z". Every function takes the times it needs as
// arguments; nothing in this project reads the clock.

export const HOUR_MS = 60 * 60 * 1000;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Milliseconds since 1970 for a UTC instant; throws a RangeError for anything else. */
export function toMs(instant) {
  const ms = typeof instant === 'string' && INSTANT.test(instant) ? Date.parse(instant) : NaN;
  if (Number.isNaN(ms)) throw new RangeError(`not a UTC instant: ${instant}`);
  return ms;
}

/** The instant for milliseconds since 1970, in whole seconds. */
export function fromMs(ms) {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

/** Hours from a to b, negative when b is before a. */
export function hoursBetween(a, b) {
  return (toMs(b) - toMs(a)) / HOUR_MS;
}

/** The instant some hours after another. */
export function addHours(instant, hours) {
  return fromMs(toMs(instant) + hours * HOUR_MS);
}

/** True when the instant is exactly on the hour. */
export function onTheHour(instant) {
  return toMs(instant) % HOUR_MS === 0;
}

/** True when the half-open spans [aStart, aEnd) and [bStart, bEnd) share any time. */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return toMs(aStart) < toMs(bEnd) && toMs(bStart) < toMs(aEnd);
}

/** True on Saturday and Sunday, UTC. */
export function isWeekend(instant) {
  const day = new Date(toMs(instant)).getUTCDay();
  return day === 0 || day === 6;
}

/** The instant a day such as "2026-03-02" starts, UTC. */
export function dayStart(day) {
  if (typeof day !== 'string' || !DAY.test(day)) throw new RangeError(`not a day: ${day}`);
  return `${day}T00:00:00Z`;
}

/** "2026-03-02 09:00", for invoices and reports. */
export function formatInstant(instant) {
  const iso = fromMs(toMs(instant));
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}
