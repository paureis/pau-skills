// Calendar days as YYYY-MM-DD strings, worked out in UTC so a day never shifts with the time zone. Strings in this
// form sort in date order, so days can be checked with < and <=.
const DAY_MS = 86_400_000;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const toTime = (day) => Date.parse(`${day}T00:00:00Z`);

export function formatDay(time) {
  return new Date(time).toISOString().slice(0, 10);
}

/** A day typed by a person, checked: "2025-06-13" stays "2025-06-13", "2025-02-30" is refused. */
export function parseDay(text) {
  const m = DAY.exec(String(text).trim());
  if (!m) throw new Error(`not a day: ${text} (use YYYY-MM-DD)`);
  const time = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(time).getUTCDate() !== Number(m[3])) throw new Error(`no such day: ${text}`);
  return formatDay(time);
}

export function addDays(day, n) {
  return formatDay(toTime(day) + n * DAY_MS);
}

export function daysBetween(from, to) {
  return Math.round((toTime(to) - toTime(from)) / DAY_MS);
}

/** "Mon" to "Sun". */
export function weekday(day) {
  return WEEKDAYS[new Date(toTime(day)).getUTCDay()];
}

export function monthOf(day) {
  return Number(day.slice(5, 7));
}

export function monthName(month) {
  return MONTHS[month - 1];
}

/** Every day from first to last, both included. */
export function eachDay(first, last) {
  const days = [];
  for (let day = first; day < last; day = addDays(day, 1)) days.push(day);
  return days;
}

/** The days of a month, month 1 being January. */
export function monthDays(year, month) {
  const first = formatDay(Date.UTC(year, month - 1, 1));
  const last = formatDay(Date.UTC(year, month, 0));
  return eachDay(first, last);
}

/** "2025-06" -> { year: 2025, month: 6 }. */
export function parseMonth(text) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(text).trim());
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`not a month: ${text} (use YYYY-MM)`);
  return { year: Number(m[1]), month: Number(m[2]) };
}
