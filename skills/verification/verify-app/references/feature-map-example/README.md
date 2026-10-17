# Invoices feature map

The map an agent reads before driving Invoices, a small billing app with a web UI, a JSON API and an `inv` command
line tool. It is an example of the shape: the app, its commands and its handles are made up. Read this index first,
then the feature file for what you are verifying.

## Baseline state

- Launch from `SKILL.md` has run: the app answers at `$URL`, with a fresh database in `$RUN/db` and the seed from
  `scripts/seed-demo` (customers `Acme Ltd` and `Blue Fern`, no invoices).
- The doctor reports this run's process ID, `$RUN/db` as the database and the commit under test.
- The signed-in user is `demo@example.com`, created by the seed.
- `inv` is built at `./bin/inv` and reads `INV_URL` and `INV_TOKEN` from the environment Launch prints.

## Driving conventions

- Start every feature from the baseline state unless its preconditions say otherwise.
- Browser steps are Playwright calls in one scratch script per feature, run with `node $RUN/<feature>.mjs`; the
  calls are written out in each step.
- Find elements by role and accessible name. The app sets no test IDs.
- Treat quoted names, flags and values as literal.
- A feature that changes data cleans up its own records at the end, through the user path, and keeps its evidence.

## Proof rules

- Browser proof: a screenshot and an accessibility snapshot of the end state, in `$EV/<feature>/`.
- API proof: the request, the response headers and the body, in `$EV/<feature>/`.
- CLI proof: the command, stdout, stderr and the exit code, in `$EV/<feature>/`.
- A change is proven through a second, read-only view: a write in the browser is read back through the API or `inv`.
- Every artifact names the feature file and the entry point it came from.
- An entry point you could not reach is reported with the command tried and the missing precondition.

## Features

- [Create an invoice](./create-invoice.md): from the web form and from the API, with validation and read-back.
- [Send an invoice](./send-invoice.md): the send action, the status change and the outgoing email in the test mailbox.
- [Export invoices](./export.md): CSV export from `inv`, with the file contents checked.
