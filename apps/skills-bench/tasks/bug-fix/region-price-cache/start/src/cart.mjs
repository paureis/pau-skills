// A cart priced in a region: each line at the customer price, and the total in the region's currency.
import { regionOf } from './catalog.mjs';
import { priceFor, formatCents } from './prices.mjs';

/** "lamp:2" -> { sku: "lamp", qty: 2 }; a bare "lamp" is one lamp. */
export function parseItem(text) {
  const m = /^([A-Za-z0-9-]+)(?::(\d+))?$/.exec(String(text).trim());
  if (!m || (m[2] !== undefined && Number(m[2]) < 1)) throw new Error(`not a cart item: ${text} (use sku or sku:qty)`);
  return { sku: m[1], qty: m[2] === undefined ? 1 : Number(m[2]) };
}

export function priceCart(items, regionCode) {
  const region = regionOf(regionCode);
  const lines = items.map(({ sku, qty }) => {
    const price = priceFor(sku, regionCode);
    return { sku: price.sku, name: price.name, qty, cents: price.grossCents * qty, currency: price.currency };
  });
  const totalCents = lines.reduce((sum, line) => sum + line.cents, 0);
  return { region: regionCode, currency: region.currency, lines, totalCents };
}

export function renderCart(cart) {
  const out = [`Cart in ${regionOf(cart.region).name}`];
  for (const l of cart.lines) out.push(`  ${String(l.qty).padStart(2)} x ${l.name.padEnd(20)}${formatCents(l.cents, l.currency).padStart(12)}`);
  out.push(`  Total${' '.repeat(20)}${formatCents(cart.totalCents, cart.currency).padStart(12)}`);
  return out.join('\n');
}
