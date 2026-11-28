// A refund for items a customer sent back: the goods at the price paid, plus the tax charged on them.
import { formatAmount, percentOf, sumCents } from './money.mjs';
import { buildInvoice } from './invoice.mjs';

/** "pens:2" -> { sku: "pens", qty: 2 }. */
export function parseReturn(text) {
  const m = /^([a-z0-9-]+):(\d+)$/.exec(String(text));
  if (!m || Number(m[2]) < 1) throw new Error(`not a return: ${text} (use sku:qty, like pens:2)`);
  return { sku: m[1], qty: Number(m[2]) };
}

export function buildRefund(order, returns) {
  const invoice = buildInvoice(order);
  const bought = new Map(invoice.lines.map((l) => [l.sku, l]));
  const left = new Map(invoice.lines.map((l) => [l.sku, l.qty]));
  const items = returns.map(({ sku, qty }) => {
    const line = bought.get(sku);
    if (!line) throw new Error(`order ${invoice.number} has no ${sku}`);
    if (qty > left.get(sku)) throw new Error(`order ${invoice.number} has only ${left.get(sku)} more ${sku} to return`);
    left.set(sku, left.get(sku) - qty);
    return { sku, name: line.name, qty, goodsCents: line.unitCents * qty };
  });
  const goodsCents = sumCents(items.map((i) => i.goodsCents));
  const taxCents = percentOf(goodsCents, invoice.rate);
  return { number: invoice.number, currency: invoice.currency, items, goodsCents, taxCents, totalCents: goodsCents + taxCents };
}

export function renderRefund(refund) {
  const money = (cents) => formatAmount(cents, refund.currency).padStart(14);
  const out = [`Refund for invoice ${refund.number}`];
  for (const i of refund.items) out.push(`${String(i.qty).padStart(3)} x ${i.name.padEnd(24)}${money(i.goodsCents)}`);
  out.push(`${'Goods'.padEnd(30)}${money(refund.goodsCents)}`);
  out.push(`${'Tax'.padEnd(30)}${money(refund.taxCents)}`);
  out.push(`${'Refund total'.padEnd(30)}${money(refund.totalCents)}`);
  return out.join('\n');
}
