// An invoice for an order: line totals, the subtotal, the sales tax and the total, all in whole cents.
import { parseAmount, formatAmount, checkCurrency, checkRate, percentOf, sumCents } from './money.mjs';

/** The order's lines with their prices in cents. */
export function readLines(order) {
  if (!Array.isArray(order.lines) || order.lines.length === 0) throw new Error(`order ${order.number} has no lines`);
  return order.lines.map((line, i) => {
    if (typeof line.sku !== 'string' || !line.sku) throw new Error(`line ${i + 1} has no sku`);
    if (!Number.isInteger(line.qty) || line.qty < 1) throw new Error(`line ${i + 1} (${line.sku}): qty must be 1 or more`);
    const unitCents = parseAmount(line.unitPrice);
    return { sku: line.sku, name: line.name ?? line.sku, qty: line.qty, unitCents, totalCents: unitCents * line.qty };
  });
}

export function buildInvoice(order) {
  const currency = checkCurrency(order.currency);
  const rate = checkRate(order.taxRateBasisPoints);
  const lines = readLines(order);
  const subtotalCents = sumCents(lines.map((l) => l.totalCents));
  const taxCents = percentOf(subtotalCents, rate);
  return { number: order.number, currency, rate, lines, subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

const rateText = (bp) => `${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, '0')}%`;

export function renderInvoice(invoice) {
  const money = (cents) => formatAmount(cents, invoice.currency).padStart(14);
  const out = [`Invoice ${invoice.number}`];
  for (const l of invoice.lines) out.push(`${String(l.qty).padStart(3)} x ${l.name.padEnd(24)}${money(l.totalCents)}`);
  out.push(`${'Subtotal'.padEnd(30)}${money(invoice.subtotalCents)}`);
  out.push(`${`Tax ${rateText(invoice.rate)}`.padEnd(30)}${money(invoice.taxCents)}`);
  out.push(`${'Total'.padEnd(30)}${money(invoice.totalCents)}`);
  return out.join('\n');
}
