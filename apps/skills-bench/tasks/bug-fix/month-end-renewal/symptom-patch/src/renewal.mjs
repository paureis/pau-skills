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

/** The same day of the month, the given number of months later. */
export function addMonths(date, months) {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function planMonths(plan) {
  if (!PLAN_MONTHS.has(plan)) throw new Error(`unknown plan: ${plan} (monthly, quarterly or yearly)`);
  return PLAN_MONTHS.get(plan);
}

export function nextRenewal(start, plan) {
  const next = addMonths(start, planMonths(plan));
  // The renewal ran past the end of a short month: step back to that month's last day.
  if (next.getUTCDate() !== start.getUTCDate()) next.setUTCDate(0);
  return next;
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
