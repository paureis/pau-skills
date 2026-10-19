// Records: GET /api/records lists the signed-in user's records, GET /api/records/:id returns one.
import { currentUser } from '../sessions.mjs';
import { sendJson } from '../http.mjs';

export function listRecords(req, res, store) {
  const user = currentUser(req, store);
  if (!user) return sendJson(res, 401, { error: 'sign in first' });
  return sendJson(res, 200, store.records.filter((r) => r.ownerId === user.id));
}

export function getRecord(req, res, store, id) {
  const user = currentUser(req, store);
  if (!user) return sendJson(res, 401, { error: 'sign in first' });
  const record = store.records.find((r) => r.id === id);
  if (!record) return sendJson(res, 404, { error: 'not found' });
  return sendJson(res, 200, record);
}
