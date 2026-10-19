// The request handler: API routes under /api, the page and its script from public/.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './db.mjs';
import { applyCors } from './cors.mjs';
import { sendJson } from './http.mjs';
import { login } from './routes/login.mjs';
import { listRecords, getRecord } from './routes/records.mjs';
import { postOrder, getOrders } from './routes/orders.mjs';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const STATIC = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'] };

export function createApp(store = createStore()) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        applyCors(req, res);
        if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
        if (req.method === 'POST' && url.pathname === '/api/login') return await login(req, res, store);
        if (req.method === 'GET' && url.pathname === '/api/records') return listRecords(req, res, store);
        const m = /^\/api\/records\/([\w-]+)$/.exec(url.pathname);
        if (req.method === 'GET' && m) return getRecord(req, res, store, m[1]);
        if (req.method === 'POST' && url.pathname === '/api/orders') return await postOrder(req, res, store);
        if (req.method === 'GET' && url.pathname === '/api/orders') return getOrders(req, res, store);
        return sendJson(res, 404, { error: 'no such route' });
      }
      const file = STATIC[url.pathname];
      if (req.method === 'GET' && file) {
        res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` });
        return res.end(await readFile(join(PUBLIC, file[0])));
      }
      return sendJson(res, 404, { error: 'not found' });
    } catch (e) {
      return sendJson(res, e.status || 500, { error: e.status ? e.message : 'server error' });
    }
  };
}
