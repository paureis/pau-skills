# Area: correctness

Load for every app. These are the bugs that do not show in a demo and do show with real users, real money and real
text. Most checks need a test as evidence: a test that passes is a `command` row citing the test file and the code
it covers.

**COR-01 Money as integers in minor units, or a decimal type** (1, must-fix). Applies:
prices, balances, totals, credits, invoices. Check: money stored and computed as integer cents (or the smallest
unit of the currency) or a decimal type (`Decimal` in Python, `BigDecimal` in Java, `NUMERIC` in SQL, a money
library in JavaScript); never a binary float (`float`, `double`, a JavaScript `number` holding dollars, `REAL` or
`FLOAT` columns). `0.1 + 0.2` is not `0.3`. The currency is stored next to the amount. Pass: `file:line` of the type
in the schema and in the code that sums. Fix: small in new code, medium with stored data (a migration; use
`migration-review` if it is installed, else check the migration by hand for locks and data loss).

**COR-02 Time stored in UTC, shown in the user's zone** (1, must-fix). Applies: any stored time. Check: timestamps
with a zone (`timestamptz`, ISO 8601 with offset, `datetime` with `tzinfo`), conversion only at display; dates that
mean a calendar day (a birthday, a due date) stored as dates, not midnight timestamps; schedules that follow
daylight saving use the zone name, not an offset. Fix: small to medium.

**COR-03 Text: apostrophes, emoji, accents and right-to-left** (1, must-fix). Applies: user-entered text. Check: a
name such as `O'Brien` saves and shows (it breaks unescaped SQL and some JSON builders); the database and
connection are UTF-8 (`utf8mb4` on MySQL, not `utf8`); length limits count characters, not bytes, where it
matters; right-to-left text does not flip the layout around it. Probe or test: save each and read it back. Fix:
small.

**COR-04 Idempotency and duplicate submits** (2, must-fix). Applies: any action that charges, sends, creates an
order or calls an outside service. Check: a double click, a retried request or a replayed webhook does not do it
twice: an idempotency key, a unique constraint, or a state check in one transaction. Test: send the same request
twice. Fix: small to medium.

**COR-05 Pagination on every list** (2, must-fix). Applies: any list that grows with use. Check: list routes and
queries have a limit and a cursor or page; no route returns a whole table. Fix: small per route.

**COR-06 Concurrency on shared counters and stock** (2, must-fix). Applies: balances, inventory, seats, quotas.
Check: updates in one statement (`update ... set n = n - 1 where n > 0`), a row lock, or optimistic version
checks; not read, compute, write. Test: two parallel requests. Fix: small.

**COR-07 Imports and exports** (2, can-wait). Applies: CSV or file import and export. Check: imports validate each
row and report errors by line without half-applying; exports escape cells that start with `=`, `+`, `-` or `@`
(spreadsheet formula injection), use UTF-8 with the right header, and stream large sets. Fix: small.

**COR-08 Rounding, tax and currency rules** (2, must-fix). Applies: tax, discounts, currency conversion, splits.
Check: one rounding rule (half-even or half-up, stated), applied once at a defined step; amounts split so the parts
add up to the whole. Fix: small.

**COR-09 Limits on input size** (1, must-fix). Applies: any server. Check: a body size limit, a maximum length per
field, a cap on list sizes in requests, a timeout on slow uploads. Pass: `file:line`.

**COR-10 Errors are handled, not swallowed** (1, can-wait). Applies: any code. Check: empty `catch` or `except`
blocks, promises with no rejection handler, background jobs that log and drop. Pass: the grep.
