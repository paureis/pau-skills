#!/usr/bin/env node
// Lists bookings, all of them or those that match: --cabin, --guest (part of the name), --status, --from and --to.
//   node bin/list.mjs data/bookings.json --cabin fern
//   node bin/list.mjs data/bookings.json --guest brooks --from 2025-06-01 --to 2025-07-01
import { loadBookings, findBookings } from '../src/bookings.mjs';
import { renderBookingList } from '../src/format.mjs';

const FILTERS = new Map([['--cabin', 'cabin'], ['--guest', 'guest'], ['--status', 'status'], ['--from', 'from'], ['--to', 'to']]);
const [file, ...rest] = process.argv.slice(2);
try {
  if (!file) throw new Error('usage: node bin/list.mjs <bookings.json> [--cabin c] [--guest name] [--status s] [--from day] [--to day]');
  const filter = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!FILTERS.has(rest[i]) || rest[i + 1] === undefined) throw new Error(`unknown or empty filter: ${rest[i]}`);
    filter[FILTERS.get(rest[i])] = rest[i + 1];
  }
  console.log(renderBookingList(findBookings(loadBookings(file), filter)));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
