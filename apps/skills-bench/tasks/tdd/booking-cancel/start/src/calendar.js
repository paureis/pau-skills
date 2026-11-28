// A booking as an iCalendar event, so customers can add it to their calendar app.
import { getRoom } from './rooms.js';
import { fromMs, toMs } from './time.js';

const stamp = (instant) => fromMs(toMs(instant)).replace(/[-:]/g, '');

/** Text escaped for an iCalendar value: backslash, semicolon, comma and line breaks. */
export function icsEscape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** The iCalendar text for a booking, made at now, with every line ending in CRLF as the format asks. */
export function bookingIcs(booking, now) {
  const room = getRoom(booking.roomId);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//room-bookings//EN',
    'BEGIN:VEVENT',
    `UID:${booking.id}@example.com`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(booking.start)}`,
    `DTEND:${stamp(booking.end)}`,
    `SUMMARY:${icsEscape(`${room.name}, ${room.seats} seats`)}`,
    `LOCATION:${icsEscape(room.name)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}
