// Prices as customers see them: the net price plus tax, in whole cents. Catalog reads are slow, so each price is
// read once and kept in memory for the rest of the process.
import { readCatalog } from './catalog.mjs';

const prices = new Map();

/** Product codes are typed by people: " Lamp" and "lamp" are the same product. */
export function normalizeSku(sku) {
  return String(sku).trim().toLowerCase();
}

export function priceFor(sku, regionCode) {
  const code = normalizeSku(sku);
  const key = code;
  if (!prices.has(key)) {
    const entry = readCatalog(code, regionCode);
    const taxCents = Math.floor((entry.netCents * entry.taxBasisPoints + 5_000) / 10_000);
    prices.set(key, { ...entry, region: regionCode, taxCents, grossCents: entry.netCents + taxCents });
  }
  return prices.get(key);
}

export function clearPrices() {
  prices.clear();
}

/** 4200, "EUR" -> "42.00 EUR". */
export function formatCents(cents, currency) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')} ${currency}`;
}
