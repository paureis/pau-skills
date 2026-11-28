// Money is kept as whole cents next to its currency code. Amounts in order files are strings such as "19.99",
// never floats, and tax is rounded once, here, to whole cents.
const AMOUNT = /^(\d{1,9})(?:\.(\d{1,2}))?$/;
const CURRENCY = /^[A-Z]{3}$/;

/** "19.99" -> 1999. */
export function parseAmount(text) {
  const m = AMOUNT.exec(String(text).trim());
  if (!m) throw new Error(`not an amount: ${JSON.stringify(text)} (use digits with up to two decimals, like 19.99)`);
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** 1999, "USD" -> "19.99 USD". */
export function formatAmount(cents, currency) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')} ${currency}`;
}

export function checkCurrency(code) {
  if (!CURRENCY.test(String(code))) throw new Error(`not a currency code: ${JSON.stringify(code)}`);
  return code;
}

/** A tax rate in basis points: 825 is 8.25%. */
export function checkRate(basisPoints) {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new Error(`tax rate must be whole basis points from 0 to 10000, got ${basisPoints}`);
  }
  return basisPoints;
}

/** The share of an amount at a rate in basis points, rounded half up to whole cents. */
export function percentOf(cents, basisPoints) {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`cents must be a whole number of 0 or more, got ${cents}`);
  return Math.floor((cents * checkRate(basisPoints) + 5_000) / 10_000);
}

export function sumCents(values) {
  return values.reduce((total, cents) => total + cents, 0);
}
