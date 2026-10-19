# Area: data and schema

Load when the app stores data in a database. For an app with no database, write one row `SCH-NA` (n/a, "no
database"). Migration rows: use `migration-review` if it is installed for each pending migration; otherwise check
locks, data loss and the down path by hand.

**SCH-01 Migrations in version control, applied by a tool** (1, must-fix). Applies: any schema. Check: a migrations
folder (Prisma, Drizzle, Alembic, Django, Rails, Flyway, Liquibase, Ecto, golang-migrate, Supabase) and that
production is changed only through it, not by hand in a console or by a "push the schema" command. Pass:
`file:line` of the folder and the deploy step that applies it. Fix: medium (baseline the live schema).

**SCH-02 Constraints in the database** (1, must-fix). Applies: any relational schema. Check: `NOT NULL` where the
code assumes a value, foreign keys between related tables, unique constraints where the code relies on uniqueness
(emails, slugs, idempotency keys), `CHECK` for enums or ranges. A rule only in app code breaks under concurrency.
Pass: `file:line` in the schema. Fix: small per constraint (check existing rows first).

**SCH-03 Indexes for the queries that run** (2, must-fix). Applies: tables that grow. Check: each foreign key and
each column used in a frequent `WHERE` or `ORDER BY` has an index; read `EXPLAIN` for the main list and search
queries on a copy with realistic row counts. Fix: small (build concurrently where the engine allows).

**SCH-04 Types that fit** (1, must-fix). Applies: any schema. Check: money (COR-01), time with zone (COR-02), ids
wide enough (`bigint` or UUID, not a 32-bit `int` that runs out), text columns with sane limits, no comma lists in
one column for what is a relation. Fix: medium with data.

**SCH-05 Seed and test data kept out of production** (1, must-fix). Applies: any database. Check: seeds that
create admin users or known passwords run only in development; no shared default password. Pass: `file:line` of the
guard.

**SCH-06 Connection limits and pooling** (2, can-wait). Applies: serverless functions or many app instances on
Postgres or MySQL. Check: a pooler (PgBouncer, Supabase pooler, RDS Proxy, Prisma Accelerate) or a pool size times
instances under the database's connection limit.

**SCH-07 Personal data mapped** (2, must-fix). Applies: personal data. Check: a list of the tables and columns that
hold personal or sensitive data, so deletion (CMP-04), export and retention (SAFE-05) can find it. Pass: the list in
the repository, `file:line`.
