// The bookings file: a JSON list of bookings, read and checked on load, written whole on save.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { parseStay } from './stay.mjs';
import { clashes } from './availability.mjs';
import { quoteStay } from './rates.mjs';

const ID = /^BK-(\d{4})$/;
const STATUSES = new Set(['confirmed', 'cancelled']);
const MAX_NAME = 80;

function checkGuestName(name) {
  const text = String(name ?? '').trim();
  if (!text || text.length > MAX_NAME) throw new Error(`the guest name must be 1 to ${MAX_NAME} characters`);
  return text;
}

function checkBooking(record, i) {
  const where = `booking ${i + 1}`;
  if (!record || typeof record !== 'object') throw new Error(`${where} is not an object`);
  if (!ID.test(String(record.id))) throw new Error(`${where} has a bad id: ${record.id}`);
  if (!STATUSES.has(record.status)) throw new Error(`${where} (${record.id}) has a bad status: ${record.status}`);
  const stay = parseStay(record);
  return { id: record.id, ...stay, guest: checkGuestName(record.guest), status: record.status, totalCents: record.totalCents };
}

export function loadBookings(file) {
  if (!existsSync(file)) return [];
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(data)) throw new Error(`${file} must hold a list of bookings`);
  return data.map(checkBooking);
}

/** Writes the list to a new file first, so a crash part way never leaves half a bookings file. */
export function saveBookings(file, bookings) {
  const next = `${file}.next`;
  writeFileSync(next, `${JSON.stringify(bookings, null, 2)}\n`);
  renameSync(next, file);
}

/**
 * The commands that change bookings read one file and write the new list to the file given with --out, which may be
 * the same one. Returns the other arguments and that file, or null when --out is missing.
 */
export function takeOut(argv) {
  const at = argv.indexOf('--out');
  if (at < 0 || !argv[at + 1] || argv[at + 1].startsWith('--')) return { args: argv, out: null };
  return { args: [...argv.slice(0, at), ...argv.slice(at + 2)], out: argv[at + 1] };
}

export function nextId(bookings) {
  const used = bookings.map((b) => Number(ID.exec(b.id)[1]));
  return `BK-${String(Math.max(0, ...used) + 1).padStart(4, '0')}`;
}

function refuseClash(stay, bookings) {
  const taken = clashes(stay, bookings);
  if (taken.length === 0) return;
  const { night, booking } = taken[0];
  throw new Error(`not available: ${stay.cabin} is booked on the night of ${night} (${booking.id})`);
}

/** Books a stay if all its nights are free. Returns the new booking, its quote and the new list. */
export function addBooking(bookings, request) {
  const stay = parseStay(request);
  const guest = checkGuestName(request.guest);
  refuseClash(stay, bookings);
  const quote = quoteStay(stay);
  const booking = { id: nextId(bookings), ...stay, guest, status: 'confirmed', totalCents: quote.totalCents };
  return { booking, quote, bookings: [...bookings, booking] };
}

export function cancelBooking(bookings, id) {
  const found = bookings.find((b) => b.id === id);
  if (!found) throw new Error(`no booking ${id}`);
  if (found.status === 'cancelled') throw new Error(`booking ${id} is already cancelled`);
  return bookings.map((b) => (b.id === id ? { ...b, status: 'cancelled' } : b));
}

/** New dates for a confirmed booking, in the same cabin; its own old nights do not count as taken. */
export function moveBooking(bookings, id, checkIn, checkOut) {
  const found = bookings.find((b) => b.id === id && b.status === 'confirmed');
  if (!found) throw new Error(`no confirmed booking ${id}`);
  const stay = parseStay({ ...found, checkIn, checkOut });
  refuseClash(stay, bookings.filter((b) => b.id !== id));
  const quote = quoteStay(stay);
  const moved = { ...found, ...stay, totalCents: quote.totalCents };
  return { booking: moved, quote, bookings: bookings.map((b) => (b.id === id ? moved : b)) };
}
