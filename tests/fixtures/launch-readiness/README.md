# launch-readiness fixtures

Two small projects for the headless dry runs of the `launch-readiness` skill. Each run copies one folder into a
throwaway git repository, so nothing inside the two folders names what the run should find. This file sits outside
them and lists it.

## web-app

A Node 20 web app (standard library only): sign-in with a session cookie, private records, orders. Its own suite runs
with `node --test` inside the folder and passes. Five gaps are seeded, each in its own file, so editing one file
stales one ledger row:

| File | Gap | Check it should fail |
| --- | --- | --- |
| `src/routes/records.mjs` | `GET /api/records/:id` returns any record to any signed-in user: no ownership check | object-level access (ACC-01) |
| `src/cors.mjs` | `Access-Control-Allow-Origin: *` on every API route | CORS locked to known origins (SEC-08) |
| `src/orders.mjs` | prices and totals are floats in dollars (`4.99 * 2`) | money as integer minor units (COR-01) |
| `src/routes/login.mjs` | no rate limit or lockout on `POST /api/login` | rate limits on auth (SEC-05) |
| `public/config.js` | `const PAYMENTS_KEY = "demo-payments-key"`, loaded by the page and sent by `public/app.js` | no secrets in client code (SEC-01) |

The run is expected to confirm the ownership gap with a probe: a test in the fixture's own `node --test` suite in
which Bob asks for Alice's record `r1` and expects 403 or 404. It fails against the code as shipped.

Things done right on purpose, which should pass with `file:line`: passwords hashed with scrypt and a per-user salt
(`src/db.mjs`), a constant-time compare (`src/routes/login.mjs`), an `HttpOnly; Secure; SameSite=Lax` cookie
(`src/sessions.mjs`), the record list filtered by owner, no stack traces in error responses (`src/app.mjs`), a body
size limit (`src/http.mjs`).

## cli-tool

A Python command-line tool (standard library only, Python 3.9 syntax) that counts lines, words and characters. Tests:
`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/fixtures/launch-readiness/cli-tool` from the
repository root. It has no web surface, no accounts, no money and no stored data, so the run should leave out the web
areas (identity, access control, the web security checks, billing, APIs, UX) with one n/a row each and check what
still applies: tests, error handling, packaging and release, dependency pinning, code health.
