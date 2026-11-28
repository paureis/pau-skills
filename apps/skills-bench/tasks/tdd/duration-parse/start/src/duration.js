// Durations as whole seconds, printed the way the timer screen shows them.

const UNITS = [
  ['h', 3600],
  ['m', 60],
  ['s', 1],
];

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
