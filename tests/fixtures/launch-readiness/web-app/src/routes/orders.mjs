// Orders: POST /api/orders places an order for the signed-in user, GET /api/orders lists theirs.
import { currentUser } from '../sessions.mjs';
import { createOrder, ordersFor } from '../orders.mjs';
import { readJson, sendJson } from '../http.mjs';

export async function postOrder(req, res, store) {
  const user = currentUser(req, store);
  if (!user) return sendJson(res, 401, { error: 'sign in first' });
  const { items } = await readJson(req);
  if (!Array.isArray(items) || !items.length) return sendJson(res, 400, { error: 'items must be a non-empty list' });
  try {
    return sendJson(res, 201, createOrder(store, user.id, items));
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }
}

export function getOrders(req, res, store) {
  const user = currentUser(req, store);
  if (!user) return sendJson(res, 401, { error: 'sign in first' });
  return sendJson(res, 200, ordersFor(store, user.id));
}
