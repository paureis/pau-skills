// The discount codes the shop hands out. Codes are upper case in the table; expires is the last day a code can be
// used, as YYYY-MM-DD. A percent code takes that share off the subtotal; a fixed code takes a set amount off.
import { formatMoney, money } from './money.js';

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

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The discount for a code typed at checkout on the day today (YYYY-MM-DD), as { code, ...table entry }. Case and
 * spaces around the code do not matter. Throws a CodeError UNKNOWN_CODE or EXPIRED; a code works on its last day.
 */
export function findDiscount(code, today) {
  if (typeof today !== 'string' || !DAY.test(today)) throw new RangeError(`today must be YYYY-MM-DD, got ${today}`);
  const key = String(code).trim().toUpperCase();
  const d = CODES.get(key);
  if (!d) throw new CodeError('UNKNOWN_CODE', `no discount code ${code}`);
  if (today > d.expires) throw new CodeError('EXPIRED', `${key} ended on ${d.expires}`);
  return { code: key, ...d };
}

/**
 * What a discount takes off a subtotal { cents, currency }: a percent rounded half up to whole cents, or a fixed
 * amount, never more than the subtotal. A fixed amount in another currency throws a CodeError WRONG_CURRENCY.
 */
export function discountOn(discount, subtotal) {
  if (discount.kind === 'percent') {
    return money(Math.floor((subtotal.cents * discount.percent) / 100), subtotal.currency);
  }
  if (discount.currency !== subtotal.currency) {
    throw new CodeError('WRONG_CURRENCY', `${discount.code} is in ${discount.currency}, the cart is in ${subtotal.currency}`);
  }
  return money(Math.min(discount.cents, subtotal.cents), subtotal.currency);
}
