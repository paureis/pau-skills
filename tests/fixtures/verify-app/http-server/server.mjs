#!/usr/bin/env node
// Bookmarks: a tiny HTTP service used to try the verify-app skill. Node standard library only.
//
//   PORT=0 DATA_DIR=<folder> node server.mjs
//
// PORT 0 (the default) picks a free port. DATA_DIR (default ./data) holds bookmarks.json. The server answers as soon
// as it listens, but it is not usable until it has loaded its data: /health returns 503 and "ready": false until then,
// and stdout prints "listening on <url>" first and "ready on <url>" when it can serve requests. STARTUP_DELAY_MS
// (default 300) stands in for slow start-up work such as migrations.
//
// Routes:
//   GET    /health           {"ok", "ready", "app", "version", "pid", "dataDir", "count"}
//   GET    /                 an HTML list of bookmarks
//   GET    /bookmarks[?tag=] the bookmarks as JSON, optionally only those with a tag
//   POST   /bookmarks        {"url", "title", "tags"}: 201 with the new bookmark, 400 when url is not http(s), 409 when
//                            the url is already saved. The title is trimmed.
//   DELETE /bookmarks/<id>   204, or 404 when there is no such bookmark
// SIGTERM and SIGINT stop it with exit code 0.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';

const VERSION = '1.0.0';
const dataDir = resolve(process.env.DATA_DIR || 'data');
const file = join(dataDir, 'bookmarks.json');
const delay = Number(process.env.STARTUP_DELAY_MS ?? 300);
let ready = false;
let store = { nextId: 1, items: [] };

function save() {
  writeFileSync(`${file}.tmp`, JSON.stringify(store, null, 2));
  renameSync(`${file}.tmp`, file);
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let data = '';
    req.on('data', (d) => { data += d; if (data.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => resolveBody(data));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') {
    return send(res, ready ? 200 : 503, { ok: ready, ready, app: 'bookmarks', version: VERSION, pid: process.pid, dataDir, count: store.items.length });
  }
  if (!ready) return send(res, 503, { error: 'starting' });

  if (req.method === 'GET' && url.pathname === '/') {
    const rows = store.items.map((b) => `<li data-id="${b.id}"><a href="${escape(b.url)}">${escape(b.title)}</a></li>`).join('');
    return send(res, 200, `<!doctype html><title>Bookmarks</title><h1>Bookmarks</h1><ul aria-label="Bookmarks">${rows}</ul>`, 'text/html');
  }
  if (req.method === 'GET' && url.pathname === '/bookmarks') {
    const tag = url.searchParams.get('tag');
    return send(res, 200, tag ? store.items.filter((b) => b.tags.includes(tag)) : store.items);
  }
  if (req.method === 'POST' && url.pathname === '/bookmarks') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'body must be JSON' }); }
    if (typeof body.url !== 'string' || !/^https?:\/\//.test(body.url)) return send(res, 400, { error: 'url must start with http:// or https://' });
    if (store.items.some((b) => b.url === body.url)) return send(res, 409, { error: 'already saved' });
    const item = { id: store.nextId++, url: body.url, title: String(body.title ?? body.url).trim(), tags: Array.isArray(body.tags) ? body.tags.map(String) : [] };
    store.items.push(item);
    save();
    return send(res, 201, item);
  }
  const del = /^\/bookmarks\/(\d+)$/.exec(url.pathname);
  if (req.method === 'DELETE' && del) {
    const i = store.items.findIndex((b) => b.id === Number(del[1]));
    if (i < 0) return send(res, 404, { error: 'no such bookmark' });
    store.items.splice(i, 1);
    save();
    res.writeHead(204).end();
    return;
  }
  send(res, 404, { error: 'not found' });
});

server.listen(Number(process.env.PORT || 0), '127.0.0.1', () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`listening on ${base}`);
  setTimeout(() => {
    mkdirSync(dataDir, { recursive: true });
    if (existsSync(file)) store = JSON.parse(readFileSync(file, 'utf8'));
    ready = true;
    console.log(`ready on ${base} (data: ${dataDir})`);
  }, delay);
});

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
