// The page script: sign in, list records, buy an add-on. Settings come from config.js.

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...options });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

$('login').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const me = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
    $('message').textContent = `Signed in as ${me.name}`;
    const records = await api('/api/records');
    $('records').replaceChildren(...records.map((r) => Object.assign(document.createElement('li'), { textContent: r.title })));
    $('buy').hidden = false;
  } catch (e) {
    $('message').textContent = e.message;
  }
});

$('buy').addEventListener('click', async () => {
  try {
    const order = await api('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Payments-Key': PAYMENTS_KEY },
      body: JSON.stringify({ items: [{ sku: 'extra-storage', quantity: 1 }] }),
    });
    $('message').textContent = `Order ${order.id} placed: ${order.total} ${order.currency}`;
  } catch (e) {
    $('message').textContent = e.message;
  }
});
