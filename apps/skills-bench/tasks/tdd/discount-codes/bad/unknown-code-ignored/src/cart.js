// The cart: lines of { sku, name, unitCents, qty } in the cart's one currency. Every total is whole cents.
import { money, addMoney } from './money.js';
import { findDiscount, discountOn } from './discounts.js';

const MAX_QTY = 99;

/** An empty cart in a currency the shop takes. */
export function createCart(currency) {
  money(0, currency);
  return { currency, lines: [] };
}

/** Adds qty of an item, or more of it when its sku is already in the cart. Returns the cart. */
export function addItem(cart, { sku, name, unitCents }, qty = 1) {
  if (typeof sku !== 'string' || !sku.trim()) throw new TypeError('sku must be a non-empty string');
  if (!Number.isInteger(qty) || qty < 1) throw new RangeError(`qty must be a whole number of 1 or more, got ${qty}`);
  money(unitCents, cart.currency);
  if (unitCents < 0) throw new RangeError('a price cannot be negative');
  const line = cart.lines.find((l) => l.sku === sku);
  const total = (line ? line.qty : 0) + qty;
  if (total > MAX_QTY) throw new RangeError(`at most ${MAX_QTY} of one item`);
  if (line) line.qty = total;
  else cart.lines.push({ sku, name: String(name ?? sku), unitCents, qty });
  return cart;
}

/** Removes the line with this sku; a sku that is not in the cart is ignored. Returns the cart. */
export function removeItem(cart, sku) {
  cart.lines = cart.lines.filter((l) => l.sku !== sku);
  return cart;
}

/** Every line's unit price times its quantity, added up, as { cents, currency }. */
export function subtotal(cart) {
  return cart.lines.reduce((sum, l) => addMoney(sum, money(l.unitCents * l.qty, cart.currency)), money(0, cart.currency));
}

/**
 * The cart's subtotal, discount and total, each { cents, currency }, with a discount code typed at checkout (none
 * when code is null, undefined or blank) on the day today (YYYY-MM-DD). The total is never below zero.
 */
export function cartTotal(cart, code, today) {
  const sub = subtotal(cart);
  const none = code == null || String(code).trim() === '';
  const found = none ? null : findDiscount(code, today);
  const discount = found ? discountOn(found, sub) : money(0, cart.currency);
  return { subtotal: sub, discount, total: money(sub.cents - discount.cents, cart.currency) };
}
