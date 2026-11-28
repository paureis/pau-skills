// The month report: for each cabin, the nights taken in the month, how full it was, and the money from the stays
// that start in the month.
import { monthDays, monthName } from './dates.mjs';
import { cabinCodes, cabinOf, CURRENCY } from './cabins.mjs';
import { takenNights } from './availability.mjs';
import { formatCents } from './format.mjs';

export function monthReport(year, month, bookings) {
  const days = monthDays(year, month);
  const inMonth = new Set(days);
  const prefix = days[0].slice(0, 8);
  const rows = cabinCodes().map((code) => {
    const taken = [...takenNights(bookings, code).keys()].filter((night) => inMonth.has(night)).length;
    const starting = bookings.filter((b) => b.cabin === code && b.status === 'confirmed' && b.checkIn.startsWith(prefix));
    const takingsCents = starting.reduce((sum, b) => sum + (Number.isInteger(b.totalCents) ? b.totalCents : 0), 0);
    return {
      cabin: cabinOf(code).name,
      taken,
      nights: days.length,
      percent: Math.round((taken * 100) / days.length),
      stays: starting.length,
      takingsCents,
    };
  });
  const takingsCents = rows.reduce((sum, r) => sum + r.takingsCents, 0);
  return { year, month, currency: CURRENCY, rows, takingsCents };
}

export function renderReport(report) {
  const out = [`${monthName(report.month)} ${report.year}`, `${'Cabin'.padEnd(16)}${'Nights'.padStart(8)}${'Full'.padStart(6)}${'Stays'.padStart(7)}${'Takings'.padStart(15)}`];
  for (const r of report.rows) {
    const nights = `${r.taken}/${r.nights}`;
    out.push(`${r.cabin.padEnd(16)}${nights.padStart(8)}${`${r.percent}%`.padStart(6)}${String(r.stays).padStart(7)}${formatCents(r.takingsCents, report.currency).padStart(15)}`);
  }
  out.push(`${'All cabins'.padEnd(37)}${formatCents(report.takingsCents, report.currency).padStart(15)}`);
  return out.join('\n');
}
