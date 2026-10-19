// Orders: a user buys add-ons from the catalog.
export const CATALOG = {
  'extra-storage': { name: 'Extra storage', price: 4.99 },
  'themes-pack': { name: 'Themes pack', price: 2.49 },
  'export-pdf': { name: 'PDF export', price: 0.1 },
};

export function createOrder(store, userId, items) {
  let total = 0;
  for (const { sku, quantity } of items) {
    const product = CATALOG[sku];
    if (!product) throw new Error(`unknown product ${sku}`);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('quantity must be a positive whole number');
    total += product.price * quantity;
  }
  const order = { id: `o${store.orders.length + 1}`, userId, items, total, currency: 'USD', status: 'pending' };
  store.orders.push(order);
  return order;
}

export function ordersFor(store, userId) {
  return store.orders.filter((o) => o.userId === userId);
}
