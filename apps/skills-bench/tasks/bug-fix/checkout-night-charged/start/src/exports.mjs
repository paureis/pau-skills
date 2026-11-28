// Bookings for other tools: a CSV file for the accountant and an iCalendar file per cabin for the cleaning team's
// calendar app. Both use the check-in and check-out days as booked; iCalendar's DTEND is the morning guests leave.
import { daysBetween } from './dates.mjs';
import { cabinOf } from './cabins.mjs';
import { formatCents } from './format.mjs';

const CSV_COLUMNS = ['id', 'cabin', 'check_in', 'check_out', 'nights', 'guests', 'guest', 'status', 'total_eur'];

/** A CSV field, quoted when it holds a comma, a quote or a line break. */
function csvField(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function bookingsCsv(bookings) {
  const rows = bookings.map((b) => [
    b.id,
    b.cabin,
    b.checkIn,
    b.checkOut,
    daysBetween(b.checkIn, b.checkOut),
    b.guests,
    b.guest,
    b.status,
    Number.isInteger(b.totalCents) ? formatCents(b.totalCents).split(' ')[0] : '',
  ]);
  return [CSV_COLUMNS, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Text in an iCalendar value: backslash, semicolon, comma and line breaks escaped. */
function icsText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const icsDay = (day) => day.replace(/-/g, '');

/** The confirmed stays of one cabin as an iCalendar file, one all-day event from check-in to check-out each. */
export function cabinCalendarFile(cabinCode, bookings) {
  const cabin = cabinOf(cabinCode);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//cabin-bookings//EN', `X-WR-CALNAME:${icsText(cabin.name)}`];
  for (const b of bookings) {
    if (b.cabin !== cabinCode || b.status !== 'confirmed') continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@example.com`,
      `DTSTART;VALUE=DATE:${icsDay(b.checkIn)}`,
      `DTEND;VALUE=DATE:${icsDay(b.checkOut)}`,
      `SUMMARY:${icsText(`${cabin.name}: ${b.guest}`)}`,
      `DESCRIPTION:${icsText(`${b.guests} ${b.guests === 1 ? 'guest' : 'guests'}, booking ${b.id}`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
