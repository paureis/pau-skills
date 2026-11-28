// The discount codes the shop hands out. Codes are upper case in the table; expires is the last day a code can be
// used, as YYYY-MM-DD. A percent code takes that share off the subtotal; a fixed code takes a set amount off.
import { formatMoney } from './money.js';

export const CODES = new Map([
  ['SAVE10', { kind: 'percent', percent: 10, expires: '2026-12-31' }],
  ['WINTER25', { kind: 'percent', percent: 25, expires: '2027-02-28' }],
  ['FIVEOFF', { kind: 'fixed', cents: 500, currency: 'EUR', expires: '2026-09-30' }],
]);

/** A refused code, with a code callers can branch on (BAD_FORMAT and so on). */
export class CodeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CodeError';
    this.code = code;
  }
}

const FORMAT = /^[A-Z0-9]{3,20}$/;

/** A line for the checkout page, such as "10% off, until 2026-12-31", or null for a code not in the table. */
export function describeCode(code) {
  if (typeof code !== 'string' || !FORMAT.test(code)) throw new CodeError('BAD_FORMAT', `not a discount code: ${code}`);
  const d = CODES.get(code);
  if (!d) return null;
  const what = d.kind === 'percent' ? `${d.percent}% off` : `${formatMoney({ cents: d.cents, currency: d.currency })} off`;
  return `${what}, until ${d.expires}`;
}
