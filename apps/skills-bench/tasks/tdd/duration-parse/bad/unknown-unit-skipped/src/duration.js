// Durations as whole seconds: formatDuration prints them the way the timer screen shows them, parseDuration reads
// what people type.

const UNITS = [
  ['h', 3600],
  ['m', 60],
  ['s', 1],
];
const SIZES = new Map(UNITS);
const BARE = /^\d+(?:\.\d+)?$/;
const PART = /\s*(\d+(?:\.\d+)?)([a-z]+)\s*/iy;

/**
 * Seconds as "1h 30m 5s", largest unit first, zero parts left out. Zero seconds is "0s".
 * Throws a RangeError for a negative number or one that is not whole.
 */
export function formatDuration(seconds) {
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new RangeError(`seconds must be a whole number of 0 or more, got ${seconds}`);
  }
  if (seconds === 0) return '0s';
  const parts = [];
  let rest = seconds;
  for (const [unit, size] of UNITS) {
    const count = Math.floor(rest / size);
    if (count > 0) parts.push(`${count}${unit}`);
    rest -= count * size;
  }
  return parts.join(' ');
}

/**
 * Text such as "1h30m", "2H", " 1h 30m " or "1.5h" as whole seconds, rounded half up. A bare number is seconds.
 * Throws a RangeError for blank text, an unknown unit or anything else it cannot read.
 */
export function parseDuration(text) {
  const input = String(text).trim();
  if (BARE.test(input)) return Math.round(Number(input));
  let total = 0;
  let at = 0;
  while (at < input.length) {
    PART.lastIndex = at;
    const m = PART.exec(input);
    const size = m && SIZES.get(m[2].toLowerCase());
    if (!m) throw new RangeError(`not a duration: "${text}"`);
    total += Number(m[1]) * (size || 0);
    at = PART.lastIndex;
  }
  if (at === 0) throw new RangeError(`not a duration: "${text}"`);
  return Math.round(total);
}
