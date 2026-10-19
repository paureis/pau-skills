#!/usr/bin/env node
// Team: a one-page web app whose list loads from an API behind a skeleton. A fixture for the States section and the
// skeleton recipe of the verify-app skill. Node standard library only.
//
//   PORT=0 node server.mjs
//
// PORT 0 (the default) picks a free port. stdout prints "ready on <url>" once it serves requests.
//
// Routes:
//   GET /             the page: a heading, the People list (three skeleton rows until the API answers), and a
//                     section below the list, so a change in the list height moves it
//   GET /api/people   three people as JSON. The page passes its own query string on, so the same switches work
//                     on the page URL and on the API:
//                       ?delay=<ms>   wait that long before answering (at most 60000): the loading state
//                       ?data=empty   answer []: the empty state
//                       ?fail=1       answer 500 with {"error"}: the error state
//
// Skeleton rows carry data-skeleton-for="person-row" and real rows data-skeleton-name="person-row".
// SIGTERM and SIGINT stop it with exit code 0.
import { createServer } from 'node:http';

const PEOPLE = [
  { id: 1, name: 'Ada Lovelace', role: 'Analyst' },
  { id: 2, name: 'Grace Hopper', role: 'Compiler lead' },
  { id: 3, name: 'Alan Turing', role: 'Research' },
];

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Team</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.4 system-ui, sans-serif; color: #1d1d1f; background: #fff; }
  main { max-width: 720px; margin: 0 auto; padding: 16px; }
  h1 { margin: 0 0 16px; font-size: 24px; line-height: 32px; }
  ul { list-style: none; margin: 0 0 16px; padding: 0; }
  li { margin: 0 0 8px; border-radius: 8px; }
  .skeleton-row { height: 36px; background: #e6e6ea; }
  .person { height: 56px; padding: 8px 12px; background: #f5f5f7; }
  .person strong { display: block; line-height: 20px; }
  .person span { display: block; font-size: 14px; line-height: 20px; color: #55555a; }
  #below { padding: 16px; height: 480px; background: #fafafa; border-top: 1px solid #ddd; }
</style>
</head>
<body>
<main>
  <h1>Team</h1>
  <ul id="people" aria-label="People" aria-busy="true">
    <li class="skeleton-row" data-skeleton-for="person-row" aria-hidden="true"></li>
    <li class="skeleton-row" data-skeleton-for="person-row" aria-hidden="true"></li>
    <li class="skeleton-row" data-skeleton-for="person-row" aria-hidden="true"></li>
  </ul>
  <p id="empty" hidden>No people yet. <a href="#invite">Invite someone</a></p>
  <div id="error" role="alert" hidden>Could not load people. <button type="button" id="retry">Try again</button></div>
  <section id="below" aria-label="About the team">
    <h2>About the team</h2>
    <p>This section sits below the list, so it moves when the list changes height.</p>
  </section>
</main>
<script>
  const list = document.getElementById('people');
  const empty = document.getElementById('empty');
  const error = document.getElementById('error');
  function load() {
    fetch('/api/people' + location.search)
      .then((r) => { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
      .then((people) => {
        list.removeAttribute('aria-busy');
        if (!people.length) { list.replaceChildren(); list.hidden = true; empty.hidden = false; return; }
        list.replaceChildren(...people.map((p) => {
          const li = document.createElement('li');
          li.className = 'person';
          li.setAttribute('data-skeleton-name', 'person-row');
          const name = document.createElement('strong');
          name.textContent = p.name;
          const role = document.createElement('span');
          role.textContent = p.role;
          li.append(name, role);
          return li;
        }));
      })
      .catch(() => { list.removeAttribute('aria-busy'); list.replaceChildren(); list.hidden = true; error.hidden = false; });
  }
  document.getElementById('retry').addEventListener('click', () => location.reload());
  load();
</script>
</body>
</html>
`;

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
  if (url.pathname === '/') return send(res, 200, PAGE, 'text/html; charset=utf-8');
  if (url.pathname === '/api/people') {
    const delay = Math.min(Math.max(Number(url.searchParams.get('delay')) || 0, 0), 60000);
    const answer = () => {
      if (url.searchParams.get('fail')) return send(res, 500, { error: 'the people service failed' });
      return send(res, 200, url.searchParams.get('data') === 'empty' ? [] : PEOPLE);
    };
    if (!delay) return answer();
    const t = setTimeout(answer, delay);
    res.on('close', () => clearTimeout(t));
    return;
  }
  send(res, 404, { error: 'not found' });
});

server.listen(Number(process.env.PORT || 0), '127.0.0.1', () => {
  console.log(`ready on http://127.0.0.1:${server.address().port}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
