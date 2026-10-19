# Probes

A probe turns a security suspect from the code read into evidence. It is a test in the project's own framework that
states the safe behavior, so it fails while the gap is there and passes once it is fixed, and it stays in the suite
as a regression test. It runs against the app started locally or in-process by the test harness, never against
production or an environment other people use.

## Where probes run

In this order:
1. A project verification skill under `.claude/skills/verify-*/`: read it and use what it says to start and drive
   the app. It already knows the ports, the seed users and the sign-in.
2. The project's own test harness: the same runner and helpers its tests use (an in-process server, a test client,
   fixtures for users). Copy the setup of the nearest existing test.
3. Neither: start the app as its README says, call it with `curl`, and record the request and response. These
   probes are evidence for this run only; offer to turn them into tests.

## Writing one

- Name it after the behavior, for example "a user cannot read another user's record".
- One probe per suspect row, using the row's id in the test name or a comment, so the ledger can cite it.
- Use the project's seed users or create two users in the test. Never use real accounts or real keys.
- Show each probe in full before writing it, with the file it goes in, and add it only on the user's yes. Probes
  change the project's test suite.
- Run it and record the command and its output. A failing probe confirms the gap: the row is `fail`, citing the
  probe file and the route file. A passing probe clears the suspect: the row is `pass`. Either way the row is a
  `command` row with an expiry of 90 days.
- A probe that fails for another reason (the app did not start, the seed user is missing) proves nothing: fix the
  probe, do not grade from it.
- A missing feature (no sign-out, no reset) is a `fail` row from the code, not a probe. Never write a test that
  fails on purpose.

## Shapes by stack

- Node `node:test` or Jest or Vitest: start the server on port 0 in `before`, sign in as two users with `fetch` (or
  supertest), and assert the status of the cross-user request.
- Python pytest or `unittest`: the framework's test client (Django `Client`, Flask `app.test_client()`, FastAPI
  `TestClient`), two users from fixtures.
- Ruby on Rails: a request spec or integration test with two users from fixtures or factories.
- Go: `httptest.NewServer` with the real router, two sessions.
- Java or Kotlin: Spring `MockMvc` or `WebTestClient` with two authenticated principals.
- PHP Laravel: a feature test with `actingAs($userA)` and a request for user B's record.
- Postgres row-level security: a SQL test (pgTAP, or a script) that sets the role and `request.jwt.claims` of user A
  and selects user B's rows.

## The common probes

| Row | Probe |
| --- | --- |
| ACC-01 | User A requests user B's record by id: expect 403 or 404 |
| ACC-03, SEC-22 | A normal user calls an admin action: expect 403 |
| ACC-06, SEC-11 | A write with another user's id or `role: admin` in the body: the extra field is ignored or refused |
| SEC-04 | Each non-public route with no session: expect 401 or a redirect |
| SEC-05 | 20 bad logins in a row: the later ones get 429 or a lockout |
| SEC-07 | A quote in a search or filter field: a normal response, not a 500 |
| SEC-08 | A request with `Origin: https://evil.example.com`: the response does not allow that origin |
| SEC-09 | Read the login response's `Set-Cookie`: HttpOnly, Secure and SameSite are set |
| SEC-12 | A request that throws: the body has no stack trace, path or query |
| BIL-01, API-02 | An unsigned webhook: expect 400 or 401 |
