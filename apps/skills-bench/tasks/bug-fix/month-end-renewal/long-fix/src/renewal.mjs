// Renewal dates for subscription plans. Dates are calendar days in UTC, written YYYY-MM-DD.
const PLAN_MONTHS = new Map([['monthly', 1], ['quarterly', 3], ['yearly', 12]]);
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(text) {
  const m = DAY.exec(String(text));
  if (!m) throw new Error(`not a date: ${text} (use YYYY-MM-DD)`);
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (date.getUTCDate() !== Number(m[3])) throw new Error(`no such day: ${text}`);
  return date;
}

export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

/** The same day of the month, the given number of months later, or that month's last day when it is shorter. */
export function addMonths(date, months) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError('addMonths needs a valid Date');
  if (!Number.isInteger(months)) throw new TypeError('months must be a whole number');
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year, month) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
}

export function isLastDayOfMonth(date) {
  return date.getUTCDate() === daysInMonth(date.getUTCFullYear(), date.getUTCMonth());
}

export function planMonths(plan) {
  if (!PLAN_MONTHS.has(plan)) throw new Error(`unknown plan: ${plan} (monthly, quarterly or yearly)`);
  return PLAN_MONTHS.get(plan);
}

export function nextRenewal(start, plan) {
  return addMonths(start, planMonths(plan));
}

/** The next count renewals, each counted from the start date so the day of the month does not drift. */
export function renewalSchedule(start, plan, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a whole number above 0');
  const step = planMonths(plan);
  const dates = [];
  for (let i = 1; i <= count; i++) dates.push(addMonths(start, i * step));
  return dates;
}

export function daysUntil(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
