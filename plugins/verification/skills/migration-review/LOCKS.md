# Locks and safe alternatives

What each common statement does to a live table, per engine. "Brief" means the lock is held only for a catalog
change (milliseconds) once it is granted; it can still queue behind a long transaction and block everything behind
it, which is why every row here assumes a short lock timeout and a retry. "Scan" means the table is read in full while
the lock is held. "Rewrite" means the table and its indexes are copied, which costs time, I/O, WAL or binlog volume
and free disk roughly equal to the table's size.

Engine behaviour changes between versions. When a finding depends on a row here, confirm it against the engine's own
documentation for the version in use, or better, observe it on a disposable database (SKILL.md step 3).

## PostgreSQL

Lock names from weakest to strongest that matter here: `SHARE UPDATE EXCLUSIVE` (blocks other DDL and vacuum, not
reads or writes), `SHARE` (blocks writes), `SHARE ROW EXCLUSIVE` (blocks writes), `ACCESS EXCLUSIVE` (blocks
everything, including SELECT).

| Statement | Lock | Cost | Safe alternative |
|---|---|---|---|
| `ADD COLUMN c type` (nullable, no default) | ACCESS EXCLUSIVE, brief | catalog only | Fine with `lock_timeout`. |
| `ADD COLUMN c type DEFAULT <constant or stable expr>` | ACCESS EXCLUSIVE, brief on 11+ | catalog only on 11+; rewrite on 10 and older | On 10 and older: add nullable, set default, backfill in batches. `now()` counts as non-volatile here. |
| `ADD COLUMN c type DEFAULT <volatile expr>` (`random()`, `clock_timestamp()`, `gen_random_uuid()`) | ACCESS EXCLUSIVE | rewrite, every version | Add nullable with no default, `ALTER COLUMN SET DEFAULT` (affects new rows only), backfill old rows in batches. |
| `ADD COLUMN c type NOT NULL DEFAULT x` | ACCESS EXCLUSIVE | brief on 11+ with a non-volatile default | Fine on 11+. On older versions, see PATTERNS.md "Add NOT NULL". |
| `ALTER COLUMN c SET NOT NULL` | ACCESS EXCLUSIVE | scan | `ADD CONSTRAINT c_nn CHECK (c IS NOT NULL) NOT VALID`; `VALIDATE CONSTRAINT c_nn` (SHARE UPDATE EXCLUSIVE); then `SET NOT NULL` skips the scan on 12+; drop the check. PostgreSQL 18 can also add a NOT NULL constraint as `NOT VALID` directly; check your version. |
| `ALTER COLUMN c TYPE newtype` | ACCESS EXCLUSIVE | rewrite plus rebuild of every index on the table | Binary-coercible changes skip the rewrite: `varchar(n)` to larger `varchar` or `text`, removing a length limit, raising `numeric` precision with the same scale. `int` to `bigint` always rewrites: use a new column (PATTERNS.md "Change a type"). |
| `ALTER COLUMN c SET DEFAULT x` / `DROP DEFAULT` | ACCESS EXCLUSIVE, brief | catalog only | Fine. |
| `ADD CONSTRAINT ... FOREIGN KEY` | SHARE ROW EXCLUSIVE on both tables | scan of the referencing table | `ADD CONSTRAINT ... NOT VALID` (brief), then `VALIDATE CONSTRAINT` in a separate transaction (SHARE UPDATE EXCLUSIVE on the referencing table, ROW SHARE on the referenced). Index the referencing column first, concurrently. |
| `ADD CONSTRAINT ... CHECK (...)` | ACCESS EXCLUSIVE | scan | `NOT VALID`, then `VALIDATE CONSTRAINT` separately. |
| `ADD CONSTRAINT ... UNIQUE` / `PRIMARY KEY` | ACCESS EXCLUSIVE | index build while locked | `CREATE UNIQUE INDEX CONCURRENTLY idx ...`, then `ADD CONSTRAINT ... UNIQUE USING INDEX idx` (or `PRIMARY KEY USING INDEX`, which also needs the columns NOT NULL). |
| `CREATE INDEX` | SHARE (blocks writes) | full build | `CREATE INDEX CONCURRENTLY`. It cannot run inside a transaction block, takes two scans, and on failure leaves an `INVALID` index that must be dropped (`DROP INDEX CONCURRENTLY`) before retrying. Set `statement_timeout = 0` for it, keep `lock_timeout`. |
| `DROP INDEX` | ACCESS EXCLUSIVE | brief | `DROP INDEX CONCURRENTLY` (not in a transaction). |
| `REINDEX` | ACCESS EXCLUSIVE on the index, SHARE on the table | full build | `REINDEX ... CONCURRENTLY` on 12+. |
| `RENAME COLUMN` / `RENAME TO` | ACCESS EXCLUSIVE, brief | catalog only | Locking is fine; compatibility is not. See PATTERNS.md "Rename a column". |
| `DROP COLUMN` | ACCESS EXCLUSIVE, brief | catalog only, space reclaimed later | Stop all reads and writes in code first (Rails `ignored_columns`, remove from ORM models), deploy, then drop. |
| `DROP TABLE` / `TRUNCATE` | ACCESS EXCLUSIVE | brief, destroys data | Rename first and drop in a later release if you want a recovery window; state the data lost. |
| `ALTER TYPE ... ADD VALUE` (enum) | ACCESS EXCLUSIVE on the type, brief | catalog only | Before 12 it cannot run inside a transaction block. On 12+ it can, but the new value cannot be used in that same transaction. No `DROP VALUE` exists: removing a value means a new type and a column type change, or use a lookup table or a CHECK constraint instead of an enum. |
| `CREATE TRIGGER` | SHARE ROW EXCLUSIVE | brief | Fine with `lock_timeout`. |
| `VACUUM FULL`, `CLUSTER` | ACCESS EXCLUSIVE | rewrite | `pg_repack` (extension) for online rewrites. |
| `ATTACH PARTITION` | SHARE UPDATE EXCLUSIVE on the parent (12+), ACCESS EXCLUSIVE on the child | scan of the child unless a matching valid CHECK constraint exists | Add the CHECK as `NOT VALID`, validate it, then attach. `DETACH PARTITION ... CONCURRENTLY` on 14+. |
| Large `UPDATE` / `DELETE` | row locks on every touched row | WAL volume, bloat, replica lag | Batches by primary key range with commits and pauses (PATTERNS.md "Backfills"). |

Session settings to put at the top of a PostgreSQL migration that touches a busy table:

```sql
SET lock_timeout = '5s';        -- give up quickly instead of queueing and blocking everyone
SET statement_timeout = '60s';  -- set to 0 for CREATE INDEX CONCURRENTLY and VALIDATE CONSTRAINT
```

Inside a transaction use `SET LOCAL`. Retry a timed-out statement a few times with a pause; if it keeps timing out,
find the blocking session (`SIZING.md`) rather than raising the timeout.

## MySQL (InnoDB, 8.0 and later)

Every DDL takes an exclusive metadata lock (MDL) at least briefly at its start and end. A long-running transaction
that has touched the table holds a shared MDL and makes the DDL wait, and a waiting DDL blocks all new queries on the
table. `lock_wait_timeout` defaults to 31536000 seconds (one year); set it low.

Always write the algorithm and lock clause explicitly, for example `ALTER TABLE t ADD COLUMN c INT, ALGORITHM=INSTANT;`
or `..., ALGORITHM=INPLACE, LOCK=NONE;`. MySQL then fails with an error instead of silently choosing a table copy.

MySQL DDL is not transactional: each statement commits implicitly. A migration with five statements that fails on the
third leaves the first two applied, and most tools will then refuse to continue. Prefer one DDL statement per
migration, or make each statement re-runnable.

| Statement | Algorithm (best available) | Effect on writes | Safe alternative or note |
|---|---|---|---|
| `ADD COLUMN` (nullable or with a constant default) | INSTANT from 8.0.12 (last position only until 8.0.29, any position after) | none beyond the MDL | A table has a limit on the number of instant changes (64 row versions in 8.0.29+); past it, a rebuild is needed. Check `INFORMATION_SCHEMA.INNODB_TABLES.TOTAL_ROW_VERSIONS`. |
| `DROP COLUMN` | INSTANT from 8.0.29, otherwise INPLACE with rebuild | INPLACE allows DML | Same code-first rule as PostgreSQL. |
| `RENAME COLUMN` | INPLACE, metadata only (INSTANT from 8.0.28) | none beyond the MDL | Compatibility issue, not a locking one. |
| `ALTER COLUMN SET DEFAULT` / `DROP DEFAULT` | INSTANT | none | Fine. |
| `MODIFY COLUMN` changing type | COPY | blocks writes for the whole copy | Online tool (gh-ost, pt-online-schema-change) or new column plus backfill. Extending `VARCHAR` is INPLACE only while the length prefix stays 1 byte (up to 255 bytes) or was already 2 bytes; crossing that boundary is a COPY. Remember bytes, not characters: `utf8mb4` is up to 4 bytes per character. |
| `MODIFY COLUMN ... NOT NULL` | INPLACE with rebuild | DML allowed | Requires strict `sql_mode`, otherwise existing NULLs are converted to the type's zero value without error. Count NULLs first. |
| `MODIFY COLUMN ... NULL` (dropping NOT NULL) | INPLACE with rebuild | DML allowed | Fine, but a rebuild on a big table still costs time and replica lag. |
| `ADD INDEX` / `ADD UNIQUE` | INPLACE, `LOCK=NONE` | DML allowed | On a replica the build runs after the primary finishes and blocks replication for its whole duration: expect lag equal to the build time. A unique index fails if duplicates exist (check first, and remember collation: `'a'` and `'A'` collide under `_ci`). |
| `DROP INDEX` | INPLACE, metadata only | none | Check no query depends on it (`sys.schema_unused_indexes` helps, after a long uptime). |
| `ADD FOREIGN KEY` | INPLACE only when `foreign_key_checks = 0`, otherwise COPY | COPY blocks writes | With checks off, existing rows are not validated: run an orphan check query first. |
| `ADD PRIMARY KEY` / change primary key | INPLACE with rebuild (expensive) | DML allowed | Online tool for big tables. |
| `CONVERT TO CHARACTER SET utf8mb4` | COPY | blocks writes | Online tool; check index prefix limits (3072 bytes with DYNAMIC row format, 767 with COMPACT). |
| ENUM: add values at the end | INSTANT if the storage size does not change (stays under 256 members) | none | Adding in the middle or reordering is a COPY and changes stored ordinals. |
| `OPTIMIZE TABLE` | INPLACE rebuild | DML allowed mostly | Lag and I/O. |
| `TRUNCATE` / `DROP TABLE` | exclusive MDL | brief, destroys data | On large tables `DROP` can stall the server on older versions while the buffer pool is purged; drop at low traffic. |

```sql
SET SESSION lock_wait_timeout = 5;   -- seconds; fail fast on metadata lock waits
SET SESSION innodb_lock_wait_timeout = 5;
```

MariaDB has its own online DDL rules (and supports `ADD COLUMN IF NOT EXISTS`, which MySQL does not). Aurora MySQL
follows MySQL with some differences in instant DDL. Vitess and PlanetScale run schema changes through their own
online migration flow; review the deploy request there instead of the raw statements.

## SQLite

- Supports `ADD COLUMN` (no `NOT NULL` without a non-null default; no non-constant default), `RENAME COLUMN` (3.25+),
  `DROP COLUMN` (3.35+, with restrictions on indexed or constrained columns), `RENAME TO`.
- Everything else (change a type, add a constraint, change a default) needs the table rebuild: create the new table,
  copy rows, drop the old, rename, recreate indexes and triggers, with `PRAGMA foreign_keys=OFF` around it and a
  `PRAGMA foreign_key_check` after. Alembic batch mode, Django and Prisma generate this for you; read what they
  generate.
- Writes lock the whole database file. DDL is transactional. A long copy blocks every writer for its duration.

## SQL Server

- DDL is transactional. Schema changes take a schema modification lock (`Sch-M`), which blocks everything, including
  reads. Use `SET LOCK_TIMEOUT 5000` (milliseconds) and, for index operations, `WAIT_AT_LOW_PRIORITY`.
- Adding a nullable column is metadata only. Adding a `NOT NULL` column with a runtime-constant default is metadata
  only in Enterprise edition and Azure SQL (2012+); otherwise it updates every row.
- `ALTER COLUMN` to a different type or a smaller size is a size-of-data operation under Sch-M.
- `CREATE INDEX ... WITH (ONLINE = ON)` (Enterprise and Azure SQL) keeps the table writable; `RESUMABLE = ON` (2019+
  for create, 2017+ for rebuild) lets a long build be paused.
- Foreign keys and checks: `WITH NOCHECK` adds without scanning but leaves the constraint untrusted (the optimizer
  ignores it); follow up with `ALTER TABLE t WITH CHECK CHECK CONSTRAINT fk` at a quiet time.

## Tools and transactions

Whether a file runs in one transaction decides two things: whether `CONCURRENTLY` (PostgreSQL) works at all, and how
long the locks from earlier statements are held. Check the version of the tool in use; these are the usual defaults.

| Tool | Default | How to run a statement outside a transaction |
|---|---|---|
| Rails | one transaction per migration (PostgreSQL, SQLite) | `disable_ddl_transaction!`, then `add_index ..., algorithm: :concurrently`; `add_foreign_key ..., validate: false` then `validate_foreign_key` in a later migration |
| Django | atomic per migration on PostgreSQL and SQLite | `atomic = False` on the Migration class; `AddIndexConcurrently` / `RemoveIndexConcurrently` from `django.contrib.postgres.operations` |
| Alembic | depends on `transaction_per_migration` and the dialect | `with op.get_context().autocommit_block():` around `op.create_index(..., postgresql_concurrently=True)` |
| Prisma | the generated `migration.sql` is applied as written | Edit the SQL (`--create-only`) and keep a `CONCURRENTLY` statement alone in its own migration; check your version's behaviour on a local database |
| Drizzle | SQL files from `drizzle-kit generate` | Edit the SQL; keep non-transactional statements in their own file |
| Knex | one transaction per migration | `exports.config = { transaction: false };` |
| TypeORM | one transaction for all pending migrations by default (`migrationsTransactionMode: "all"`) | Set `migrationsTransactionMode` to `"each"` or `"none"`; recent versions also accept `transaction = false` on the migration class |
| Sequelize | no transaction unless you open one | Fine for `CONCURRENTLY`; wrap multi-step changes yourself |
| Flyway | one transaction per script where the engine allows | A script config file next to it (`V5__idx.sql.conf`) with `executeInTransaction=false` |
| Liquibase | one transaction per changeset | `runInTransaction="false"` on the changeset |
| golang-migrate | the PostgreSQL driver sends the file as one multi-statement query, which PostgreSQL runs as one implicit transaction | Put `CREATE INDEX CONCURRENTLY` alone in its own file |
| goose | one transaction per file | `-- +goose NO TRANSACTION` at the top of the file |
| Ecto | one transaction plus a migration lock | `@disable_ddl_transaction true` and `@disable_migration_lock true`, then `create index(..., concurrently: true)` |
| Laravel | transaction per migration on PostgreSQL and SQLite when the grammar supports it | `protected $withinTransaction = false;` on the migration class |
| EF Core | one transaction per migration | `migrationBuilder.Sql("CREATE INDEX CONCURRENTLY ...", suppressTransaction: true);` |
| Supabase CLI | each file in `supabase/migrations` runs as a unit | Keep `CONCURRENTLY` alone in its own file, test with `supabase db reset` locally |

On MySQL none of this matters for atomicity, because each DDL statement commits on its own whatever the tool says.
