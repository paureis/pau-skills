// Money as whole cents with the currency next to the amount, so no amount is ever a fraction in a float.

const CURRENCIES = new Set(['EUR', 'GBP', 'USD']);

/** { cents, currency } after checking that cents is a whole number and the shop takes the currency. */
export function money(cents, currency) {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`cents must be a whole number, got ${cents}`);
  if (!CURRENCIES.has(currency)) throw new RangeError(`the shop does not take ${currency}`);
  return { cents, currency };
}

/** The sum of two amounts in the same currency. */
export function addMoney(a, b) {
  if (a.currency !== b.currency) throw new RangeError(`cannot add ${a.currency} to ${b.currency}`);
  return money(a.cents + b.cents, a.currency);
}

/** "12.34 EUR"; a negative amount prints as "-0.50 EUR". */
export function formatMoney({ cents, currency }) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')} ${currency}`;
}
