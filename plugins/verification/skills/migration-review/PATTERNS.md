# Expand/contract recipes

During a deploy, old and new versions of the code run at the same time, against one schema. A rolling deploy, a
canary, a background worker that restarts late or a rollback of the code all mean the schema must work for both
versions at every moment. Expand/contract gets there by never changing something in place:

1. **Expand**: add the new thing (column, table, constraint as not yet enforced). Old code ignores it.
2. **Migrate**: deploy code that writes both old and new, backfill existing rows, then deploy code that reads new.
3. **Contract**: once no running code touches the old thing, remove it in a later release.

Each numbered step below is its own migration or its own deploy. Steps marked "deploy" are code changes, not schema
changes. Do not collapse them into one release: that reintroduces exactly the window this pattern exists to close.

SQL is PostgreSQL unless marked; MySQL differences follow each recipe. Use `lock_timeout` / `lock_wait_timeout` on
every DDL step (LOCKS.md).

## Rename a column

Goal: `users.fullname` becomes `users.display_name`.

1. Migration: `ALTER TABLE users ADD COLUMN display_name text;`
2. Deploy: write to both columns on every insert and update. (Alternative: a trigger that copies `fullname` to
   `display_name` on write, which also covers writers you do not control.)
3. Backfill in batches: `UPDATE users SET display_name = fullname WHERE id BETWEEN $1 AND $2 AND display_name IS NULL;`
4. Deploy: read from `display_name`, keep writing both.
5. Deploy: stop writing `fullname`. In ORMs that cache columns, mark it ignored (Rails `self.ignored_columns`,
   remove the field from the Django model with `SeparateDatabaseAndState` or from the Prisma schema).
6. Migration, a release later: `ALTER TABLE users DROP COLUMN fullname;`

Shortcut, when every reader is under your control and can tolerate it: rename the column and create a view with the
old name, or (PostgreSQL) rename the table and put an updatable view with the old shape in its place, then remove the
view later. This is still two deploys, but needs no backfill.

MySQL: the same steps. `RENAME COLUMN` is metadata only, but that is not what makes a rename unsafe.

## Change a column's type

Goal: `orders.id` or `orders.amount` from `integer` to `bigint` (or any change that rewrites the table).

1. Migration: `ALTER TABLE orders ADD COLUMN amount_new bigint;`
2. Migration or deploy: keep the two in sync for new writes. A trigger is the usual choice here because every writer
   is covered:
   ```sql
   CREATE FUNCTION orders_amount_sync() RETURNS trigger AS $f$
   BEGIN NEW.amount_new := NEW.amount; RETURN NEW; END $f$ LANGUAGE plpgsql;
   CREATE TRIGGER orders_amount_sync BEFORE INSERT OR UPDATE ON orders
     FOR EACH ROW EXECUTE FUNCTION orders_amount_sync();
   ```
3. Backfill in batches (see "Backfills" below).
4. Add any index the new column needs, concurrently; add NOT NULL with the recipe below.
5. Swap in one short transaction, with `lock_timeout` set:
   ```sql
   BEGIN;
   SET LOCAL lock_timeout = '5s';
   ALTER TABLE orders RENAME COLUMN amount TO amount_old;
   ALTER TABLE orders RENAME COLUMN amount_new TO amount;
   DROP TRIGGER orders_amount_sync ON orders;
   COMMIT;
   ```
   This swap is itself a rename, so code must either not reference the column by a name that changes, or step 5 is
   replaced by "deploy code that reads `amount_new`" and the old column is dropped later.
6. Migration, a release later: drop `amount_old` and the function.

For a primary key the swap also involves the sequence (`ALTER SEQUENCE ... OWNED BY`), the primary key constraint
(`ADD CONSTRAINT ... PRIMARY KEY USING INDEX` built concurrently beforehand) and every foreign key that references it.
Plan those as their own steps; it is a project, not a migration.

MySQL: use gh-ost or pt-online-schema-change, which implement this same copy-and-swap with triggers (pt-osc) or the
binlog (gh-ost), throttle on replica lag, and cut over with a short lock. Check foreign keys first: gh-ost does not
support them, and pt-osc needs an explicit `--alter-foreign-keys-method`.

Before any narrowing change (`bigint` to `int`, shorter `varchar`, `timestamptz` to `timestamp`, `numeric` with less
scale), count the rows that would not fit and put the number in the report. On MySQL with non-strict `sql_mode` those
rows are truncated or clamped silently.

## Add NOT NULL to an existing column

1. Deploy: code always writes a value. Optionally set a default for new rows:
   `ALTER TABLE accounts ALTER COLUMN region SET DEFAULT 'unknown';`
2. Backfill existing NULLs in batches.
3. PostgreSQL 12 and later:
   ```sql
   ALTER TABLE accounts ADD CONSTRAINT accounts_region_nn CHECK (region IS NOT NULL) NOT VALID;  -- brief lock
   ALTER TABLE accounts VALIDATE CONSTRAINT accounts_region_nn;   -- scans, but allows reads and writes
   ALTER TABLE accounts ALTER COLUMN region SET NOT NULL;         -- uses the valid check, no scan
   ALTER TABLE accounts DROP CONSTRAINT accounts_region_nn;
   ```
   Run `VALIDATE` in its own transaction. On PostgreSQL 11 and older, `SET NOT NULL` always scans; keep the CHECK
   constraint as the enforcement instead, or accept the scan at a quiet time if the table is small.
4. MySQL: `ALTER TABLE accounts MODIFY region VARCHAR(32) NOT NULL DEFAULT 'unknown', ALGORITHM=INPLACE, LOCK=NONE;`
   It rebuilds the table but allows writes. Confirm strict `sql_mode` and zero NULLs first.

A brand-new column that must be NOT NULL: on PostgreSQL 11+ and MySQL 8.0.12+, `ADD COLUMN c type NOT NULL DEFAULT x`
is a catalog change. Old code that inserts without the column still works because of the default.

## Split a table

Goal: move `users.address_*` columns into a new `addresses` table.

1. Migration: create `addresses` with a foreign key to `users` and an index on `user_id`.
2. Deploy: write to both places on every change (in the application, inside one transaction, or with a trigger).
3. Backfill `addresses` from `users` in batches, idempotently (`INSERT ... SELECT ... ON CONFLICT (user_id) DO NOTHING`
   on PostgreSQL, `INSERT IGNORE` or `ON DUPLICATE KEY UPDATE` on MySQL).
4. Verify: a query that compares the two copies and returns zero rows that differ. Put the query in the plan.
5. Deploy: read from `addresses`. Keep dual writes for at least one release so the code can be rolled back.
6. Deploy: stop writing the old columns, mark them ignored in the ORM.
7. Migration, a release later: drop the old columns (state what data is destroyed: by now it should be a duplicate).

## Add a foreign key

PostgreSQL:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_customer_id_idx ON orders (customer_id);   -- own migration, no transaction
ALTER TABLE orders ADD CONSTRAINT orders_customer_fk
  FOREIGN KEY (customer_id) REFERENCES customers (id) NOT VALID;    -- brief lock, enforced for new rows from now on
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_fk;         -- separate transaction; scans without blocking writes
```
Before validating, find orphans: `SELECT count(*) FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
WHERE o.customer_id IS NOT NULL AND c.id IS NULL;` Decide what happens to them (fix, null out, delete) and say so.

The index on the referencing column is not required by PostgreSQL, but without it every delete or key update on the
parent scans the child table.

MySQL: InnoDB creates the index if missing. With `foreign_key_checks = 1` adding the key is a table COPY; with it set
to 0 for the session it is INPLACE but existing rows are not checked, so run the orphan query first. On large tables
use an online tool, or decide whether the constraint belongs in the database at all for this workload.

SQL Server: `WITH NOCHECK` to add, then `WITH CHECK CHECK CONSTRAINT` to make it trusted.

## Add a unique constraint

```sql
CREATE UNIQUE INDEX CONCURRENTLY users_email_key ON users (lower(email));   -- fails if duplicates exist
```
If it fails it leaves an `INVALID` index: `DROP INDEX CONCURRENTLY users_email_key;` before retrying. Find duplicates
first with `SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;`. To turn a plain-column unique
index into a constraint: `ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE USING INDEX users_email_key;`.
Code that writes duplicates must be fixed and deployed before the index is built, or new duplicates arrive during the
build and it fails at the end.

## Drop a column or a table

1. Deploy: remove every read and write, including in reports, background jobs, ETL and other services that share the
   database. Search the code base and the other repositories for the name.
2. Deploy, for ORMs that cache columns: mark it ignored and restart all processes.
3. Optional recovery window: rename (`users_legacy_notes`) or copy the data out (`CREATE TABLE ... AS SELECT`, or a
   dump of just that table) and keep it for an agreed period.
4. Migration: drop. The report must state the data destroyed and where the copy is, or that none exists.

## Backfills

One `UPDATE big_table SET ...` holds row locks on every row until it commits, produces WAL or binlog for the whole
table at once (replicas fall behind), and on PostgreSQL leaves a dead copy of every row for vacuum. Run it in batches
instead:

- Batch by primary key range, never by `OFFSET`. Each batch is its own transaction.
- Make it re-runnable: the `WHERE` clause skips rows already done (`AND new_col IS NULL`, or a high-water mark that is
  stored).
- Pause between batches and slow down when replica lag or load rises. Stop on error rather than skipping.
- Keep it out of the schema migration's transaction. A backfill inside a migration that also ran DDL holds the DDL's
  lock for the whole backfill on PostgreSQL.
- Typical batch: 1,000 to 10,000 rows, sized so each batch takes well under a second. Measure on a copy.

Shape of the loop, in whatever language the project uses:

```
last_id = 0
loop:
  rows = execute("UPDATE t SET new_col = old_col
                  WHERE id > :last AND id <= :last + :batch AND new_col IS NULL", last, batch)
  commit
  last_id += batch
  if last_id > max_id: break
  sleep(pause)            # increase when replica lag > threshold
```

Framework helpers that do the batching: Rails `in_batches(of: 5000).update_all(...)`, Django a loop over primary key
ranges with `QuerySet.filter(pk__gt=..., pk__lte=...).update(...)`, Laravel `chunkById`, Ecto a loop with
`Repo.update_all` over id ranges, plain SQL a procedure with `COMMIT` per loop (PostgreSQL 11+ procedures, called
outside a transaction). Run the backfill as a separate job or task, not inside the deploy step, so a slow backfill
does not block or time out the release.
