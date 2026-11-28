// A month calendar of one cabin: every day of the month, and the booking that holds its night, if any.
import { monthDays, monthName, weekday } from './dates.mjs';
import { cabinOf } from './cabins.mjs';
import { takenNights } from './availability.mjs';

const COLUMNS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function monthCalendar(cabinCode, year, month, bookings) {
  const cabin = cabinOf(cabinCode);
  const taken = takenNights(bookings, cabinCode);
  const days = monthDays(year, month).map((day) => ({ day, weekday: weekday(day), booking: taken.get(day)?.id ?? null }));
  return { cabin: cabin.name, year, month, days };
}

/** Weeks start on Monday; a taken night shows as "##", a free one as its day of the month. */
export function renderCalendar(calendar) {
  const out = [`${calendar.cabin}, ${monthName(calendar.month)} ${calendar.year}`, COLUMNS.map((c) => c.slice(0, 2)).join(' ')];
  let week = Array(COLUMNS.indexOf(calendar.days[0].weekday)).fill('  ');
  for (const d of calendar.days) {
    week.push(d.booking ? '##' : d.day.slice(8).replace(/^0/, ' '));
    if (week.length === 7) {
      out.push(week.join(' '));
      week = [];
    }
  }
  if (week.length > 0) out.push(week.join(' '));
  const taken = calendar.days.filter((d) => d.booking).length;
  out.push(`${taken} of ${calendar.days.length} nights taken`);
  return out.join('\n');
}
