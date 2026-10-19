// Tests for the API, against a server on a random port.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.mjs';

let server;
let base;

before(async () => {
  server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

async function signIn(email) {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse' }),
  });
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

test('login sets an HttpOnly session cookie', async () => {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@example.com', password: 'correct horse' }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie'), /HttpOnly/);
});

test('a wrong password is refused', async () => {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@example.com', password: 'nope' }),
  });
  assert.equal(res.status, 401);
});

test('the record list shows only your own records', async () => {
  const cookie = await signIn('alice@example.com');
  const res = await fetch(`${base}/api/records`, { headers: { cookie } });
  const records = await res.json();
  assert.deepEqual(records.map((r) => r.id), ['r1']);
});

test('you can open your own record', async () => {
  const cookie = await signIn('bob@example.com');
  const res = await fetch(`${base}/api/records/r2`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).title, 'Bob journal');
});

test('records need a session', async () => {
  const res = await fetch(`${base}/api/records/r1`);
  assert.equal(res.status, 401);
});

test('an order is placed for the signed-in user', async () => {
  const cookie = await signIn('alice@example.com');
  const res = await fetch(`${base}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ items: [{ sku: 'extra-storage', quantity: 2 }] }),
  });
  assert.equal(res.status, 201);
  const order = await res.json();
  assert.equal(order.userId, 'u1');
  assert.equal(order.status, 'pending');
  assert.equal(order.items.length, 1);
});

test('an unknown product is refused', async () => {
  const cookie = await signIn('alice@example.com');
  const res = await fetch(`${base}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ items: [{ sku: 'nothing', quantity: 1 }] }),
  });
  assert.equal(res.status, 400);
});
