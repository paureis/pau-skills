#!/usr/bin/env node
// Prints the next renewal date of a plan, or the next few with --count.
//   node bin/renewal.mjs 2025-03-15 monthly
//   node bin/renewal.mjs 2025-03-15 quarterly --count 4
import { parseDate, formatDate, nextRenewal, renewalSchedule } from '../src/renewal.mjs';

const [startText, plan = 'monthly', flag, countText] = process.argv.slice(2);
try {
  if (!startText) throw new Error('usage: node bin/renewal.mjs <YYYY-MM-DD> [monthly|quarterly|yearly] [--count <n>]');
  const start = parseDate(startText);
  if (flag === '--count') {
    for (const date of renewalSchedule(start, plan, Number(countText))) console.log(formatDate(date));
  } else {
    console.log(`Next renewal: ${formatDate(nextRenewal(start, plan))}`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
