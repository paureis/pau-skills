---
name: migration-review
description: Review a database schema or data migration before it runs against a real database, in any migration tool (raw SQL, Rails, Django, Alembic, Prisma, Drizzle, Knex, TypeORM, Sequelize, Flyway, Liquibase, golang-migrate, goose, Ecto, Laravel, EF Core, Supabase), for locking and downtime, compatibility with the code running during deploy, data loss, reversibility, correctness and run time at the table's real size, and return a verdict with a rewritten safe version of every risky statement. Focus on PostgreSQL and MySQL, with notes for SQLite and SQL Server. Use when the user says "review this migration", "is this migration safe", "will this lock the table", "can I run this in production", "check my schema change", "zero-downtime migration", "add a NOT NULL column safely", "rename a column without downtime", or before merging or deploying any change under a migrations folder.
argument-hint: "<migration file(s) or PR> [engine and version] [table sizes if known]"
---

# Migration review

A pre-flight review of a database migration. The question is never "is the SQL valid": the tool will tell you that.
The question is what this exact statement does to a table of this size, on this engine version, while the old code is
still serving traffic, and what is lost if it has to be undone.

Scope, from the arguments: $ARGUMENTS

Reference files, read when you reach their step:
- `${CLAUDE_PLUGIN_ROOT}/skills/verification/migration-review/LOCKS.md`: statement-by-statement risk table per engine (lock taken,
  rewrite or scan, safe alternative), plus how migration tools wrap statements in transactions
- `${CLAUDE_PLUGIN_ROOT}/skills/verification/migration-review/PATTERNS.md`: expand/contract recipes (rename a column, change a type,
  add NOT NULL, split a table, add a foreign key, add a unique constraint, drop a column) and batched backfills
- `${CLAUDE_PLUGIN_ROOT}/skills/verification/migration-review/SIZING.md`: queries for row counts, table sizes, write rates and long
  transactions on PostgreSQL, MySQL, SQL Server and SQLite; run-time estimates; what to watch during the run

## Do not

- **Do not run the migration, or any part of it, against a shared, staging-used-by-others or production database.**
  Not to "check the lock", not inside a transaction you plan to roll back (on PostgreSQL the lock is real until the
  rollback; on MySQL DDL commits implicitly and cannot be rolled back at all).
- Do not run even read-only catalog queries against production without the user's explicit permission for that
  connection. Prefer handing the user the queries from `SIZING.md`, or a read replica they name.
- Do not approve a destructive change (DROP, TRUNCATE, DELETE, a narrowing type change, a lossy cast, a dropped
  constraint that guarded data) without stating in the report exactly what data it destroys and whether a backup or
  the down migration can bring it back.
- Do not judge a statement without the engine and major version. "Adding a column with a default is instant" is true
  on PostgreSQL 11+ for a non-volatile default and false on 10; on MySQL it depends on 8.0.12 vs 8.0.29 and the row
  format. If the version is unknown, review for the oldest version still plausible and say so.
- Do not review the ORM source and assume the SQL. Get the SQL the tool will actually emit (step 1). ORMs add
  defaults, rebuild tables (SQLite), wrap in transactions, or split a change in ways the model file does not show.
- Do not call a statement "safe" because it was fast on an empty local table. Speed on a copy with production-like
  row counts is evidence; speed on ten rows is not.

## 1. Collect the facts

- [ ] **The exact SQL.** Use the tool's dry-run or SQL output, not the model diff:
  Rails: run it against a local database and read the SQL in `log/development.log` (the `strong_migrations` gem
  also flags known-unsafe operations); Django
  `python manage.py sqlmigrate <app> <number>`; Alembic `alembic upgrade <from>:<to> --sql`; Prisma the generated
  `migration.sql` (`prisma migrate dev --create-only` to produce it without applying); Drizzle the file from
  `drizzle-kit generate` (never `drizzle-kit push` to a real database); Laravel `php artisan migrate --pretend`;
  EF Core `dotnet ef migrations script <from> <to>`; Knex, TypeORM, Sequelize, Ecto: read the up function and the
  builder calls, or run against a local database with query logging on; Flyway, Liquibase (`liquibase update-sql`),
  golang-migrate, goose, Supabase: the SQL files themselves.
- [ ] **How the tool runs it**: one transaction per file, per statement, or none. See "Tools and transactions" in
  `LOCKS.md`. This decides whether `CREATE INDEX CONCURRENTLY` will even work and how long locks are held.
- [ ] **Engine and major version** (`SELECT version();` on both PostgreSQL and MySQL), and for MySQL whether it is
  MySQL, MariaDB, Aurora or Vitess/PlanetScale, since online DDL support differs.
- [ ] **Size and traffic of every table touched**: row count, total size, writes per second, longest running
  transactions. Queries in `SIZING.md`. If the user cannot provide them, state the assumption you reviewed against.
- [ ] **The code that runs during deploy**: which columns and tables the currently deployed version reads and writes,
  and whether the migration runs before, during or after the new code rolls out (release phase, init container,
  manual step, on app boot).

Done when you have the SQL statements in order, the transaction boundaries, the engine version, a size per table
(measured or stated as assumed), and the deploy order.

## 2. Review statement by statement

For each statement, answer the six questions below and record findings. Use `LOCKS.md` for the lock and the safe
alternative; do not answer from memory when the table has a row for it.

1. **Locking and downtime.** Which lock it takes, whether it scans or rewrites the table, and for how long at this
   size. Remember the lock queue: on PostgreSQL an `ACCESS EXCLUSIVE` request that waits behind one long transaction
   blocks every query that arrives after it, even plain SELECTs; on MySQL a DDL waiting for a metadata lock does the
   same. A "metadata-only" change can still take the site down if it waits. So every DDL against a busy table needs a
   short lock timeout and a retry: PostgreSQL `SET lock_timeout = '5s'` (and a `statement_timeout` that fits the
   statement, or `0` for a concurrent index build), MySQL `SET SESSION lock_wait_timeout = 5` (the default is one
   year), SQL Server `SET LOCK_TIMEOUT 5000`. Also check what else shares the transaction: on PostgreSQL a quick
   `ALTER TABLE` followed by a backfill in the same transaction holds the exclusive lock for the whole backfill.
2. **Backward compatibility.** Will the old code still work after this statement, and the new code before it? A drop
   or rename of anything the old code reads breaks it the moment it commits. A new NOT NULL column without a default
   breaks old code that inserts without it. Many ORMs cache the column list at boot (Rails, Hibernate, some Django
   setups), so even an unused dropped column can fail inserts until restart. The fix is expand/contract in separate
   deploys; recipes in `PATTERNS.md`.
3. **Data safety.** Destructive operations, `UPDATE` or `DELETE` without a `WHERE`, narrowing types (`bigint` to
   `int`, `varchar(255)` to `varchar(50)`, `timestamptz` to `timestamp`, `utf8mb4` to `utf8mb3`, `text` to an enum),
   lossy casts, and on MySQL non-strict `sql_mode`, which truncates or zeroes values silently instead of failing.
   Write the query that counts affected rows (`SELECT count(*) FROM t WHERE length(col) > 50`) and put its result,
   or the instruction to run it, in the finding. Backfills on large tables must run in batches with a pause between
   them, not as one `UPDATE` (see "Backfills" in `PATTERNS.md`).
4. **Reversibility.** Is there a real down migration, and does running it restore the previous state, or only the
   previous shape? Dropping a column and re-adding it in `down` returns an empty column. If a change is forward only,
   that is acceptable when the report says so and names the forward fix and the backup to restore from.
5. **Correctness.** Constraints and indexes match how the table is queried (column order of composite indexes,
   partial indexes, unique constraints that the code relies on for upserts); defaults and nullability; enum changes
   (PostgreSQL cannot drop an enum value; MySQL reorders or rebuilds when a value is inserted mid-list); collation and
   charset (a case-insensitive collation can make a new unique index fail); timezone types (`timestamptz` on
   PostgreSQL; on MySQL `TIMESTAMP` converts to UTC and ends in 2038, `DATETIME` stores no zone); idempotency (does it
   fail cleanly or half-apply if re-run; MySQL DDL commits each statement, so a failure in statement three leaves one
   and two applied).
6. **Operational.** Estimated run time at this size (`SIZING.md`), replication lag it will cause, disk it needs (a
   rewrite or a copy-based MySQL alter needs roughly the table's size again, free), and whether it should run at a
   low-traffic time or through an online tool (gh-ost, pt-online-schema-change, `pg_repack`).

Done when every statement has a line in your working table with its lock, its duration estimate at real size and a
pass or a finding.

## 3. Prove it on a disposable database, if one exists

If a local or throwaway database is available (Docker, `supabase start`, a CI service container, a database the user
names as disposable), use it. Match the engine and major version.

- [ ] Apply the migration, then the down migration, then the migration again. Report each result. A migration that
  cannot be re-applied after its own rollback is a finding.
- [ ] Check the lock and rewrite claims you made, instead of trusting the table. PostgreSQL: run the statement inside
  `BEGIN; ... ` and from a second session query `pg_locks` for that relation, then `ROLLBACK`; compare
  `pg_relation_filenode('t')` before and after to detect a rewrite. MySQL: add `ALGORITHM=INSTANT` (then `INPLACE`)
  and `LOCK=NONE` to the statement; MySQL refuses with an error rather than silently falling back.
- [ ] If you can load a production-sized volume of synthetic rows (`generate_series` on PostgreSQL, a recursive CTE
  on MySQL), time the slow statements and the backfill on it and extrapolate (`SIZING.md`).

If no disposable database exists, say so in the report and mark the run-time and lock claims as "from documentation,
not observed". Do not create one in a shared environment to get around this.

## 4. Rewrite what is risky

For every finding of medium or higher, write the replacement: the exact statements, in the migration tool's own
syntax where the tool needs a flag (Rails `disable_ddl_transaction!` with `algorithm: :concurrently`, Django
`AddIndexConcurrently` with `atomic = False`, Alembic `autocommit_block()`, goose `-- +goose NO TRANSACTION`, Ecto
`@disable_ddl_transaction true`, Flyway `executeInTransaction=false`, Liquibase `runInTransaction="false"`). When the
safe version needs several deploys, say which statements go in which migration and which code change goes between
them.

## Severity

- **Blocker**: will cause an outage or data loss as written at this size: a long exclusive lock on a hot table, a drop
  or rename the running code uses, a destructive change with no stated recovery, a statement that cannot succeed (for
  example `CONCURRENTLY` inside a transaction).
- **High**: likely to cause errors or a visible stall under realistic conditions: no lock timeout on a busy table, a
  single-statement backfill of millions of rows, a NOT NULL added while old code still inserts nulls.
- **Medium**: correct but costly or fragile: no down migration and no documented forward fix, a missing index for a
  new foreign key, a non-idempotent step on MySQL.
- **Low**: style or future risk: naming, a redundant index, a type that will need widening later.

Verdict: any blocker is **do not run**. Any high, or a medium on data safety, is **safe with changes**. Otherwise
**safe to run**.

## Report

```
Verdict: SAFE TO RUN | SAFE WITH CHANGES | DO NOT RUN
Engine: <engine and version, measured or assumed>   Tool: <tool, transaction mode>
Tables: <table: rows, size, writes/s, measured or assumed>
Disposable-database run: <up / down / up results, or "none available">

Findings (most severe first):
[SEVERITY] <short title>
  Statement:  <the exact statement>
  Risk:       <lock and duration at this size, or what breaks, or what is lost>
  Safe version:
    <rewritten statements, split into migrations and deploys if needed>

Data destroyed: <every destructive statement and what it removes, or "none">
Rollback: <what the down migration restores, and what it cannot>
Run plan: <order of deploys, timeouts to set, expected duration, what to watch (SIZING.md), abort condition>
Not checked: <anything you could not verify and why>
```

Keep the report to findings that change what the user does. A statement that is fine needs no paragraph.

## When this is overkill

A brand-new table nobody reads yet, a database with no live traffic, or a table of a few thousand rows: locking and
run time do not matter there, so check only data safety, reversibility and correctness, and say that you skipped the
rest and why.
